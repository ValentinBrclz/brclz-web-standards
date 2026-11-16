import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaults,
  defineSite,
  lintSite,
  mergeSettings,
  resolveSite,
  validateSite,
} from '../src/config.mjs';

const minimal = { identity: { name: 'Example', productionUrl: 'https://example.com' } };
/** @param {Record<string, any>} extra */
const site = (extra = {}) => defineSite(mergeSettings(minimal, extra));

describe('mergeSettings', () => {
  it('merges objects deeply and replaces arrays and scalars', () => {
    const base = { a: { b: 1, c: [1, 2] }, d: 'x' };
    assert.deepEqual(mergeSettings(base, { a: { c: [3] }, d: 'y' }), {
      a: { b: 1, c: [3] },
      d: 'y',
    });
  });
  it('supports $append and $replace', () => {
    const base = { list: [1], obj: { a: 1, b: 2 } };
    assert.deepEqual(mergeSettings(base, { list: { $append: [2] }, obj: { $replace: { c: 3 } } }), {
      list: [1, 2],
      obj: { c: 3 },
    });
  });
  it('$append on a missing value starts a new array', () => {
    assert.deepEqual(mergeSettings({}, { list: { $append: ['a'] } }), { list: ['a'] });
  });
  it('null clears and undefined inherits', () => {
    assert.deepEqual(mergeSettings({ a: { b: 1 }, c: 2 }, { a: null, c: undefined }), {
      a: null,
      c: 2,
    });
  });
  it('never mutates its inputs', () => {
    const base = { a: { b: [1] } };
    const override = { a: { b: { $append: [2] } } };
    mergeSettings(base, override);
    assert.deepEqual(base, { a: { b: [1] } });
    assert.deepEqual(override, { a: { b: { $append: [2] } } });
  });
  it('rejects operators mixed with other keys, $append on non-arrays, unsafe keys and non-data', () => {
    assert.throws(() => mergeSettings({ a: [] }, { a: { $append: [1], x: 1 } }), /only key/);
    assert.throws(
      () => mergeSettings({ a: 'x' }, { a: { $append: [1] } }),
      /can only extend an array/,
    );
    assert.throws(
      () => mergeSettings({}, JSON.parse('{"__proto__": {"polluted": true}}')),
      /Unsafe configuration key/,
    );
    assert.throws(
      () => mergeSettings({}, { a: { constructor: 1 } }),
      /Unsafe configuration key: a.constructor/,
    );
    assert.throws(() => mergeSettings({}, { fn: () => 1 }), /only plain data/);
    assert.throws(() => mergeSettings({}, { when: new Date() }), /only plain data/);
    assert.equal(/** @type {any} */ ({}).polluted, undefined);
  });
});

describe('defineSite', () => {
  it('applies defaults and returns a deeply frozen config', () => {
    const resolved = site();
    assert.equal(resolved.security.headers['X-Frame-Options'], 'DENY');
    assert.equal(resolved.cloudflare.htmlHandling, 'drop-trailing-slash');
    assert.ok(Object.isFrozen(resolved.security.csp));
    assert.throws(() => {
      /** @type {any} */ (resolved.security).hsts = 'max-age=1';
    }, TypeError);
  });
  it('keeps the exported defaults immutable', () => {
    assert.ok(Object.isFrozen(defaults.security.headers));
    assert.ok(Object.isFrozen(defaults.analytics.posthog.events));
  });
  it('removes a default header with null and replaces the CSP wholesale with $replace', () => {
    const resolved = site({
      security: {
        headers: { 'X-Frame-Options': null },
        csp: { $replace: { 'default-src': ["'none'"] } },
      },
    });
    assert.equal(resolved.security.headers['X-Frame-Options'], null);
    assert.deepEqual(resolved.security.csp, { 'default-src': ["'none'"] });
  });
  it('resolveSite accepts raw overrides or a resolved site', () => {
    const resolved = site();
    assert.equal(resolveSite(resolved), resolved);
    assert.equal(resolveSite(minimal).identity.name, 'Example');
  });
});

describe('validation errors', () => {
  /** @param {Record<string, any>} extra @param {RegExp} message */
  const rejects = (extra, message) => assert.throws(() => site(extra), message);

  it('reports unknown keys with suggestions', () => {
    rejects({ secruity: {} }, /secruity: unknown key \(did you mean "security"\?\)/);
    rejects(
      { security: { header: {} } },
      /security.header: unknown key \(did you mean "headers"\?\)/,
    );
    rejects(
      { security: { csp: { 'scrpt-src': [] } } },
      /unknown CSP directive "scrpt-src" \(did you mean "script-src"\?\)/,
    );
  });
  it('lists every problem at once', () => {
    try {
      site({ astro: { buildFormat: 'files' }, cloudflare: { workerName: 'Bad_Name' } });
      assert.fail('expected an error');
    } catch (error) {
      const message = /** @type {Error} */ (error).message;
      assert.match(message, /astro.buildFormat: must be one of/);
      assert.match(message, /cloudflare.workerName: invalid value/);
    }
  });
  it('requires identity and a bare HTTPS production origin', () => {
    assert.throws(
      () => defineSite(/** @type {any} */ ({})),
      /identity.name: required[\s\S]*identity.productionUrl: required/,
    );
    for (const url of [
      'http://example.com',
      'https://example.com/path',
      'https://example.com:8443',
      'https://u:p@example.com',
      'not a url',
    ])
      assert.throws(
        () => defineSite({ identity: { name: 'X', productionUrl: url } }),
        /identity.productionUrl/,
        url,
      );
    assert.throws(
      () => defineSite({ identity: { name: 'X', productionUrl: 'https://Example.com' } }),
      /normalised origin "https:\/\/example.com"/,
    );
  });
  it('refuses a preview domain that would cover production', () => {
    rejects({ identity: { previewDomain: 'example.com' } }, /previewDomain/);
    assert.throws(
      () =>
        defineSite({
          identity: {
            name: 'X',
            productionUrl: 'https://www.example.com',
            previewDomain: 'example.com',
          },
        }),
      /noindex rules would reach production/,
    );
    rejects({ identity: { previewDomain: 'https://dev.example.com' } }, /bare lowercase hostname/);
  });
  it('enforces consistent Astro output and html_handling', () => {
    rejects(
      { astro: { buildFormat: 'directory', trailingSlash: 'always' } },
      /use "force-trailing-slash" or "auto-trailing-slash"/,
    );
    assert.equal(
      site({
        astro: { buildFormat: 'directory', trailingSlash: 'always' },
        cloudflare: { htmlHandling: 'auto-trailing-slash' },
      }).astro.buildFormat,
      'directory',
    );
    rejects({ astro: { trailingSlash: 'always' } }, /use "force-trailing-slash"/);
  });
  it('keeps workers.dev disabled and validates dates, HSTS and preview robots values', () => {
    rejects({ cloudflare: { workersDev: true } }, /workersDev: must stay false/);
    rejects({ cloudflare: { compatibilityDate: '2026-02-30' } }, /real date/);
    rejects({ security: { hsts: 'max-age=abc' } }, /security.hsts/);
    rejects({ security: { previewRobotsTag: 'nofollow' } }, /Must contain "noindex"/);
  });
  it('rejects raw CSP/HSTS headers, invalid header names and line breaks', () => {
    rejects(
      { security: { headers: { 'Content-Security-Policy': "default-src 'self'" } } },
      /security.csp/,
    );
    rejects(
      { security: { headers: { 'Strict-Transport-Security': 'max-age=1' } } },
      /security.hsts/,
    );
    rejects({ security: { headers: { 'Bad Header': 'x' } } }, /invalid header name/);
    rejects({ security: { headers: { 'X-Test': 'a\r\nInjected: 1' } } }, /line breaks/);
    rejects(
      { security: { headers: { 'x-frame-options': 'SAMEORIGIN' } } },
      /defined twice with different casing/,
    );
  });
  it('rejects unquoted CSP keywords and none combined with sources', () => {
    rejects({ security: { csp: { 'script-src': ['self'] } } }, /must be single-quoted/);
    rejects({ security: { csp: { 'img-src': ["'none'", 'data:'] } } }, /combines 'none'/);
  });
});

describe('analytics model', () => {
  const posthog = { enabled: true, projectKey: 'phc_abc123' };
  it('enables a provider without any review reference (the key no longer exists)', () => {
    const csp = {
      'script-src': ["'self'", 'https://static.cloudflareinsights.com'],
      'connect-src': ["'self'", 'https://cloudflareinsights.com'],
    };
    const ok = site({
      analytics: { cloudflareWebAnalytics: { enabled: true } },
      security: { csp },
    });
    assert.equal(ok.analytics.cloudflareWebAnalytics.enabled, true);
    assert.throws(
      () => site({ analytics: { privacyReview: 'r' }, security: { csp } }),
      /analytics.*privacyReview/,
    );
  });
  it('requires the PostHog project key and refuses personal API keys', () => {
    assert.throws(
      () => site({ analytics: { posthog: { enabled: true } } }),
      /projectKey: required/,
    );
    assert.throws(
      () =>
        site({
          analytics: { posthog: { enabled: true, projectKey: 'phx_secret' } },
        }),
      /public project API key/,
    );
  });
  it('requires the CSP to allow the enabled providers, with an actionable fix', () => {
    assert.throws(
      () => site({ analytics: { posthog } }),
      /posthog is enabled but connect-src blocks https:\/\/eu.i.posthog.com; set e.g. \{ "connect-src": \["'self'","https:\/\/eu.i.posthog.com"\] \}/,
    );
    const ok = site({
      analytics: { posthog },
      security: { csp: { 'connect-src': ["'self'", 'https://eu.i.posthog.com'] } },
    });
    assert.equal(ok.analytics.posthog.region, 'eu');
    assert.throws(
      () => site({ analytics: { ga4: { enabled: true } } }),
      /ga4 is enabled but script-src blocks https:\/\/www.googletagmanager.com/,
    );
  });
  it('accepts a same-origin reverse proxy covered by self', () => {
    const resolved = site({
      analytics: {
        posthog: { ...posthog, apiHost: 'https://example.com/ingest' },
      },
    });
    assert.equal(resolved.analytics.posthog.apiHost, 'https://example.com/ingest');
  });
  it('checks per-path CSP overrides too', () => {
    assert.throws(
      () =>
        site({
          analytics: { posthog },
          security: {
            csp: { 'connect-src': ["'self'", 'https://eu.i.posthog.com'] },
            extraRules: [{ path: '/embed', csp: { 'connect-src': ["'self'"] } }],
          },
        }),
      /security.extraRules\[0\].csp: posthog is enabled but connect-src blocks/,
    );
  });
  it('forbids browser storage in cookieless mode', () => {
    assert.throws(
      () =>
        site({
          analytics: {
            posthog: { ...posthog, consent: 'cookieless', persistence: 'localStorage' },
          },
          security: { csp: { 'connect-src': ["'self'", 'https://eu.i.posthog.com'] } },
        }),
      /cookieless consent cannot use browser storage/,
    );
  });
});

describe('lintSite', () => {
  it('warns about risky but valid choices', () => {
    const warnings = lintSite(
      site({
        security: {
          cspReportOnly: true,
          csp: { 'connect-src': ["'self'", 'https://eu.i.posthog.com'] },
        },
      }),
    );
    assert.ok(warnings.some((w) => w.includes('previewDomain is not set')));
    assert.ok(warnings.some((w) => w.includes('not enforced')));
    assert.ok(
      warnings.some((w) =>
        w.includes('allows posthog origins but analytics.posthog.enabled is false'),
      ),
    );
  });
  it('does not warn about enabled providers whose CSP origins are in place', () => {
    const warnings = lintSite(
      site({
        analytics: {
          cloudflareWebAnalytics: { enabled: true },
          ga4: { enabled: true, consent: 'not-required' },
        },
        security: {
          csp: {
            'script-src': [
              "'self'",
              'https://static.cloudflareinsights.com',
              'https://www.googletagmanager.com',
            ],
            'connect-src': [
              "'self'",
              'https://cloudflareinsights.com',
              'https://region1.google-analytics.com',
            ],
          },
        },
      }),
    );
    assert.ok(!warnings.some((w) => /analytics|privacy|consent/i.test(w)), warnings.join('\n'));
  });
  it('validateSite accepts an already merged config', () => {
    assert.equal(validateSite(mergeSettings(defaults, minimal)).identity.name, 'Example');
  });
});

describe('review regressions', () => {
  it('suggests $append only for directives that already exist', () => {
    assert.throws(
      () =>
        site({
          analytics: { ga4: { enabled: true } },
          security: {
            csp: {
              'script-src': ["'self'"],
              'connect-src': ["'self'", 'https://region1.google-analytics.com'],
            },
          },
        }),
      /script-src blocks https:\/\/www.googletagmanager.com; set e.g. \{ "script-src": \{ \$append: \["https:\/\/www.googletagmanager.com"\] \} \}/,
    );
  });
});
