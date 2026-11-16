import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defineSite } from '../src/config.mjs';
import { posthogClientConfig } from '../src/posthog.mjs';
import {
  CONSENT_STORAGE_KEY,
  createPostHogConsent,
  posthogInitOptions,
  posthogOptions,
  sanitizeProperties,
  stripUrlQueries,
} from '../src/posthog-client.mjs';

/** @param {'opt-in' | 'cookieless'} [consent] */
const config = (consent = 'opt-in') => ({
  projectKey: 'phc_test',
  apiHost: 'https://eu.i.posthog.com',
  consent,
  persistence: /** @type {const} */ ('memory'),
  capturePageview: true,
  events: ['download_click'],
  productionHostname: 'www.example.com',
});

function fakePostHog() {
  /** @type {any[][]} */
  const calls = [];
  const posthog = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args) => {
          calls.push([name, ...args]);
        },
    },
  );
  let loads = 0;
  return {
    calls,
    names: () => calls.map((c) => c[0]),
    get loads() {
      return loads;
    },
    load: async () => {
      loads++;
      return { default: posthog };
    },
  };
}

function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    map,
  };
}

const production = { hostname: 'www.example.com' };

describe('posthogInitOptions', () => {
  it('is conservative and needs only the ingestion host in the CSP', () => {
    const options = posthogInitOptions(config());
    assert.equal(options.disable_external_dependency_loading, true);
    assert.equal(options.autocapture, false);
    assert.equal(options.disable_session_recording, true);
    assert.equal(options.capture_pageview, false);
    assert.equal(options.opt_out_capturing_by_default, true);
    assert.equal(options.persistence, 'memory');
    assert.equal('cookieless_mode' in options, false);
    const cookieless = posthogInitOptions({ ...config('cookieless'), persistence: 'localStorage' });
    assert.equal(cookieless.cookieless_mode, 'always');
    assert.equal(cookieless.persistence, 'memory');
    assert.equal(cookieless.opt_out_capturing_by_default, false);
    assert.throws(
      () => posthogInitOptions({ ...config(), apiHost: 'http://insecure.test' }),
      /HTTPS/,
    );
    assert.equal(posthogOptions({ region: 'us' }).api_host, 'https://us.i.posthog.com');
  });
  it('strips query strings and fragments from URL properties', () => {
    const event = stripUrlQueries({
      properties: {
        $current_url: 'https://www.example.com/search?q=secret#x',
        $referrer: 'https://ref.test/?token=1',
        title: 'keep?x',
      },
      $set_once: { $initial_current_url: 'https://www.example.com/?utm=1' },
    });
    assert.equal(event.properties.$current_url, 'https://www.example.com/search');
    assert.equal(event.properties.$referrer, 'https://ref.test/');
    assert.equal(event.properties.title, 'keep?x');
    assert.equal(event.$set_once.$initial_current_url, 'https://www.example.com/');
  });
  it('drops personal-looking or unbounded properties', () => {
    assert.deepEqual(
      sanitizeProperties({
        document_type: 'pdf',
        count: 2,
        ok: true,
        email: 'a@b.test',
        url: 'https://x.test',
        BadKey: 'x',
        long: 'x'.repeat(101),
        obj: {},
      }),
      { document_type: 'pdf', count: 2, ok: true },
    );
  });
});

describe('createPostHogConsent (opt-in)', () => {
  it('loads nothing before consent', async () => {
    const ph = fakePostHog();
    const consent = createPostHogConsent(config(), {
      load: ph.load,
      storage: memoryStorage(),
      location: production,
      navigator: {},
    });
    await consent.ready;
    assert.equal(consent.state(), 'unset');
    assert.equal(ph.loads, 0);
    assert.equal(consent.capture('download_click'), false);
  });
  it('starts after grant, remembers it across pages and only sends allow-listed events', async () => {
    const ph = fakePostHog();
    const storage = memoryStorage();
    const consent = createPostHogConsent(config(), {
      load: ph.load,
      storage,
      location: production,
      navigator: {},
    });
    assert.equal(await consent.grant(), true);
    assert.deepEqual(ph.names(), ['init', 'opt_in_capturing', 'capture']);
    assert.equal(ph.calls[0]?.[1], 'phc_test');
    assert.deepEqual(ph.calls[1]?.[1], { captureEventName: false });
    assert.equal(ph.calls[2]?.[1], '$pageview');
    assert.equal(
      consent.capture('download_click', { document_type: 'pdf', email: 'x@y.test' }),
      true,
    );
    assert.deepEqual(ph.calls.at(-1), ['capture', 'download_click', { document_type: 'pdf' }]);
    assert.equal(consent.capture('unknown_event'), false);
    assert.equal(JSON.parse(storage.map.get(CONSENT_STORAGE_KEY) ?? '{}').decision, 'granted');

    const nextPage = fakePostHog();
    const again = createPostHogConsent(config(), {
      load: nextPage.load,
      storage,
      location: production,
      navigator: {},
    });
    assert.equal(await again.ready, true);
    assert.equal(again.state(), 'granted');
    assert.deepEqual(nextPage.names(), ['init', 'opt_in_capturing', 'capture']);
  });
  it('deny() resets then opts out, and blocks further capture', async () => {
    const ph = fakePostHog();
    const consent = createPostHogConsent(config(), {
      load: ph.load,
      storage: memoryStorage(),
      location: production,
      navigator: {},
    });
    await consent.grant();
    consent.deny();
    assert.deepEqual(ph.names().slice(-2), ['reset', 'opt_out_capturing']);
    assert.equal(consent.capture('download_click'), false);
    assert.equal(consent.state(), 'denied');
    await consent.grant();
    assert.equal(ph.loads, 1, 'the SDK is initialised only once');
    assert.equal(ph.names().at(-1), 'opt_in_capturing');
  });
  it('handles deny() while the SDK is loading', async () => {
    const ph = fakePostHog();
    const consent = createPostHogConsent(config(), {
      load: ph.load,
      storage: memoryStorage(),
      location: production,
      navigator: {},
    });
    const granting = consent.grant();
    consent.deny();
    assert.equal(await granting, false);
    assert.ok(!ph.names().includes('opt_in_capturing'));
    assert.equal(ph.names().at(-1), 'opt_out_capturing');
  });
  it('is disabled outside production and without a key', async () => {
    for (const [cfg, location] of [
      [config(), { hostname: 'feature.dev.example.com' }],
      [config(), { hostname: 'localhost' }],
      [{ ...config(), projectKey: '' }, production],
    ]) {
      const ph = fakePostHog();
      const consent = createPostHogConsent(/** @type {any} */ (cfg), {
        load: ph.load,
        storage: memoryStorage(),
        location,
        navigator: {},
      });
      assert.equal(consent.state(), 'disabled');
      assert.equal(await consent.grant(), false);
      assert.equal(ph.loads, 0);
    }
  });
  it('survives unavailable storage', async () => {
    const ph = fakePostHog();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    const consent = createPostHogConsent(config(), {
      load: ph.load,
      storage: broken,
      location: production,
      navigator: {},
    });
    assert.equal(await consent.grant(), true);
  });
});

describe('createPostHogConsent (cookieless)', () => {
  it('starts without a banner but honours refusal and privacy signals', async () => {
    const ph = fakePostHog();
    const consent = createPostHogConsent(config('cookieless'), {
      load: ph.load,
      storage: memoryStorage(),
      location: production,
      navigator: {},
    });
    assert.equal(await consent.ready, true);
    assert.deepEqual(ph.names(), ['init', 'capture']);
    assert.equal(ph.calls[0]?.[2].cookieless_mode, 'always');

    const gpc = fakePostHog();
    const withSignal = createPostHogConsent(config('cookieless'), {
      load: gpc.load,
      storage: memoryStorage(),
      location: production,
      navigator: { globalPrivacyControl: true },
    });
    assert.equal(await withSignal.ready, false);
    assert.equal(withSignal.state(), 'unset');
    assert.equal(gpc.loads, 0);

    const storage = memoryStorage();
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ v: 1, decision: 'denied' }));
    const refused = fakePostHog();
    createPostHogConsent(config('cookieless'), {
      load: refused.load,
      storage,
      location: production,
      navigator: {},
    });
    assert.equal(refused.loads, 0);
  });
});

describe('posthogClientConfig', () => {
  it('serialises only what the browser needs, or null when disabled', () => {
    const site = defineSite({
      identity: { name: 'X', productionUrl: 'https://www.example.com' },
      security: { csp: { 'connect-src': ["'self'", 'https://eu.i.posthog.com'] } },
      analytics: {
        posthog: { enabled: true, projectKey: 'phc_abc', events: ['download_click'] },
      },
    });
    assert.deepEqual(posthogClientConfig(site), {
      projectKey: 'phc_abc',
      apiHost: 'https://eu.i.posthog.com',
      consent: 'opt-in',
      persistence: 'memory',
      capturePageview: true,
      events: ['download_click'],
      productionHostname: 'www.example.com',
    });
    assert.equal(
      posthogClientConfig({ identity: { name: 'X', productionUrl: 'https://x.test' } }),
      null,
    );
  });
});
