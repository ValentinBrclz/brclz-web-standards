/**
 * Build-time PostHog helpers. `posthogClientConfig()` turns the validated site configuration
 * into the small serializable object consumed by `@valentinbrclz/web-standards/posthog/client`.
 */
import { posthogApiHost, resolveSite } from './config.mjs';

export { posthogInitOptions, posthogOptions, stripUrlQueries } from './posthog-client.mjs';

/**
 * Serializable browser configuration derived from `analytics.posthog` and the production host.
 * @param {import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>} input
 * @returns {import('./posthog-client.mjs').PostHogClientConfig | null} `null` when PostHog is disabled.
 */
export function posthogClientConfig(input) {
  const site = resolveSite(input);
  const ph = site.analytics.posthog;
  if (!ph.enabled) return null;
  return {
    projectKey: /** @type {string} */ (ph.projectKey),
    apiHost: posthogApiHost(ph),
    consent: ph.consent,
    persistence: ph.persistence,
    capturePageview: ph.capturePageview,
    events: [...ph.events],
    productionHostname: new URL(/** @type {string} */ (site.identity.productionUrl)).hostname,
  };
}
