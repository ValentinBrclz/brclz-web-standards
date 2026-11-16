/**
 * Browser-side, consent-aware PostHog loader. It has no dependency on the rest of the package
 * (so it stays small in client bundles) and never loads `posthog-js` before the selected
 * consent model allows it:
 *
 * - `opt-in`: nothing is loaded until `grant()`; the decision is remembered in localStorage
 *   (a strictly necessary record of the visitor's choice) so a static multi-page site does not
 *   ask again on every page.
 * - `cookieless`: PostHog's cookieless mode (no cookies or browser storage) starts immediately;
 *   it must also be enabled in the PostHog project settings. `deny()` still opts out.
 *
 * Global Privacy Control / Do Not Track are honoured as a refusal unless the visitor explicitly
 * grants consent. Nothing runs outside the production hostname (Previews, localhost).
 *
 * @typedef {object} PostHogClientConfig Serializable output of `posthogClientConfig()`.
 * @property {string} projectKey
 * @property {string} apiHost
 * @property {'opt-in' | 'cookieless'} consent
 * @property {'memory' | 'localStorage' | 'localStorage+cookie'} persistence
 * @property {boolean} capturePageview
 * @property {string[]} events
 * @property {string} productionHostname
 */

export const CONSENT_STORAGE_KEY = 'web-standards:analytics-consent';
const PROPERTY_NAME = /^[a-z][a-z0-9_]{0,63}$/;

/** @param {unknown} value */
function stripUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

/**
 * `before_send` hook: removes query strings and fragments (search terms, tokens, campaign
 * identifiers) from every URL-like property before it leaves the browser.
 * @param {any} event
 */
export function stripUrlQueries(event) {
  if (!event) return event;
  for (const bag of [event.properties, event.$set, event.$set_once]) {
    if (!bag || typeof bag !== 'object') continue;
    for (const key of Object.keys(bag))
      if (/(url|referrer)$/i.test(key)) bag[key] = stripUrl(bag[key]);
  }
  return event;
}

/**
 * Conservative `posthog.init()` options for a config.
 * @param {Pick<PostHogClientConfig, 'apiHost' | 'consent' | 'persistence'>} config
 */
export function posthogInitOptions(config) {
  const host = new URL(config.apiHost);
  if (host.protocol !== 'https:') throw new Error('PostHog apiHost must use HTTPS');
  const cookieless = config.consent === 'cookieless';
  return {
    api_host: config.apiHost,
    // No remotely loaded code (recorder, surveys, toolbar, site apps): keeps the CSP to a
    // single connect-src origin.
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    rageclick: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    disable_product_tours: true,
    disable_conversations: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    person_profiles: /** @type {const} */ ('identified_only'),
    respect_dnt: true,
    persistence: cookieless ? /** @type {const} */ ('memory') : config.persistence,
    ...(cookieless ? { cookieless_mode: /** @type {const} */ ('always') } : {}),
    opt_out_capturing_by_default: !cookieless,
    opt_out_persistence_by_default: !cookieless,
    before_send: stripUrlQueries,
  };
}

/**
 * `posthogInitOptions()` from a region (or custom `apiHost`) when no site configuration is at hand.
 * @param {{ region?: 'eu' | 'us', apiHost?: string, consent?: 'opt-in' | 'cookieless', persistence?: PostHogClientConfig['persistence'] }} [options]
 */
export function posthogOptions({
  region = 'eu',
  apiHost,
  consent = 'opt-in',
  persistence = 'memory',
} = {}) {
  return posthogInitOptions({
    apiHost: apiHost ?? (region === 'us' ? 'https://us.i.posthog.com' : 'https://eu.i.posthog.com'),
    consent,
    persistence,
  });
}

/**
 * Keeps only event properties that cannot identify a visitor: snake_case keys with boolean,
 * finite number or short string values (no e-mail-like or URL strings).
 * @param {Record<string, unknown> | undefined} properties
 * @returns {Record<string, string | number | boolean>}
 */
export function sanitizeProperties(properties) {
  /** @type {Record<string, string | number | boolean>} */
  const clean = {};
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (!PROPERTY_NAME.test(key)) continue;
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
      clean[key] = value;
    else if (
      typeof value === 'string' &&
      value.length <= 100 &&
      !value.includes('@') &&
      !/^https?:\/\//i.test(value)
    )
      clean[key] = value;
  }
  return clean;
}

/**
 * @typedef {object} ConsentController
 * @property {() => 'disabled' | 'unset' | 'granted' | 'denied'} state
 * @property {() => Promise<boolean>} grant Records consent and starts capturing.
 * @property {() => void} deny Records refusal, stops capturing and clears PostHog state.
 * @property {(name: string, properties?: Record<string, unknown>) => boolean} capture Sends an allow-listed event.
 * @property {Promise<boolean>} ready Resolves once the initial decision has been applied.
 */

/**
 * Creates the consent controller for a page; nothing is loaded or sent before the configured
 * consent model allows it (see the module comment).
 * @param {PostHogClientConfig} config
 * @param {{ load?: () => Promise<{ default: any }>, storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null, location?: { hostname: string }, navigator?: { globalPrivacyControl?: boolean, doNotTrack?: string | null } }} [env]
 * @returns {ConsentController}
 */
export function createPostHogConsent(config, env = {}) {
  const location = env.location ?? globalThis.location;
  /** @type {{ globalPrivacyControl?: boolean, doNotTrack?: string | null } | undefined} */
  const nav = env.navigator ?? globalThis.navigator;
  /** @type {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null} */
  let storage = null;
  try {
    storage = env.storage === undefined ? (globalThis.localStorage ?? null) : env.storage;
  } catch {
    storage = null;
  }
  // Loading posthog-js is left to the caller's bundler; the default uses a dynamic import.
  const load = env.load ?? (() => import('posthog-js'));
  const disabled =
    !location || location.hostname !== config.productionHostname || !config.projectKey;
  const allowed = new Set(config.events);
  /** @type {any} */
  let client = null;
  /** @type {Promise<boolean> | null} */
  let starting = null;
  let active = false;

  const read = () => {
    try {
      const raw = storage?.getItem(CONSENT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.v === 1 && (parsed.decision === 'granted' || parsed.decision === 'denied')
        ? parsed.decision
        : null;
    } catch {
      return null;
    }
  };
  /** @param {'granted' | 'denied'} decision */
  const write = (decision) => {
    current = decision;
    try {
      storage?.setItem(
        CONSENT_STORAGE_KEY,
        JSON.stringify({ v: 1, decision, at: new Date().toISOString().slice(0, 10) }),
      );
    } catch {
      // Storage unavailable (private mode, blocked): the choice applies to this page only.
    }
  };
  /** @type {'granted' | 'denied' | null} */
  let current = read();
  const privacySignal = () => nav?.globalPrivacyControl === true || nav?.doNotTrack === '1';

  /** @param {boolean} optIn */
  const start = (optIn) => {
    if (client) {
      if (optIn) client.opt_in_capturing({ captureEventName: false });
      active = true;
      return Promise.resolve(true);
    }
    starting ??= load()
      .then((module) => {
        const posthog = module.default;
        posthog.init(config.projectKey, posthogInitOptions(config));
        client = posthog;
        if (current === 'denied') {
          // deny() was called while the SDK was loading.
          posthog.opt_out_capturing();
          return false;
        }
        if (optIn) posthog.opt_in_capturing({ captureEventName: false });
        if (config.capturePageview) posthog.capture('$pageview');
        active = true;
        return true;
      })
      .catch(() => {
        starting = null;
        return false;
      });
    return starting;
  };

  /** @type {Promise<boolean>} */
  let ready = Promise.resolve(false);
  if (!disabled) {
    if (config.consent === 'opt-in' && current === 'granted') ready = start(true);
    if (config.consent === 'cookieless' && current !== 'denied' && !privacySignal())
      ready = start(false);
  }

  return {
    state: () =>
      disabled
        ? 'disabled'
        : (current ?? (config.consent === 'cookieless' && !privacySignal() ? 'granted' : 'unset')),
    ready,
    async grant() {
      if (disabled) return false;
      write('granted');
      return start(true);
    },
    deny() {
      if (disabled) return;
      write('denied');
      active = false;
      if (client) {
        // reset() restores the default consent state, so opt out afterwards.
        client.reset();
        client.opt_out_capturing();
      }
    },
    capture(name, properties) {
      if (!client || !active || !allowed.has(name)) return false;
      client.capture(name, sanitizeProperties(properties));
      return true;
    },
  };
}
