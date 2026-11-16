export { posthogInitOptions, posthogOptions, stripUrlQueries } from './posthog-client.mjs';
/**
 * Serializable browser configuration derived from `analytics.posthog` and the production host.
 * @param {import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>} input
 * @returns {import('./posthog-client.mjs').PostHogClientConfig | null} `null` when PostHog is disabled.
 */
export declare function posthogClientConfig(input: import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>): import('./posthog-client.mjs').PostHogClientConfig | null;
