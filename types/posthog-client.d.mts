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
export type PostHogClientConfig = {
    projectKey: string;
    apiHost: string;
    consent: 'opt-in' | 'cookieless';
    persistence: 'memory' | 'localStorage' | 'localStorage+cookie';
    capturePageview: boolean;
    events: string[];
    productionHostname: string;
};
export declare const CONSENT_STORAGE_KEY = "web-standards:analytics-consent";
/**
 * `before_send` hook: removes query strings and fragments (search terms, tokens, campaign
 * identifiers) from every URL-like property before it leaves the browser.
 * @param {any} event
 */
export declare function stripUrlQueries(event: any): any;
/**
 * Conservative `posthog.init()` options for a config.
 * @param {Pick<PostHogClientConfig, 'apiHost' | 'consent' | 'persistence'>} config
 */
export declare function posthogInitOptions(config: Pick<PostHogClientConfig, 'apiHost' | 'consent' | 'persistence'>): {
    api_host: string;
    disable_external_dependency_loading: boolean;
    advanced_disable_flags: boolean;
    autocapture: boolean;
    capture_pageview: boolean;
    capture_pageleave: boolean;
    capture_dead_clicks: boolean;
    capture_heatmaps: boolean;
    capture_exceptions: boolean;
    capture_performance: boolean;
    rageclick: boolean;
    disable_session_recording: boolean;
    disable_surveys: boolean;
    disable_web_experiments: boolean;
    disable_product_tours: boolean;
    disable_conversations: boolean;
    mask_all_text: boolean;
    mask_all_element_attributes: boolean;
    person_profiles: 'identified_only';
    respect_dnt: boolean;
    persistence: "localStorage" | "localStorage+cookie" | "memory";
    cookieless_mode?: "always" | undefined;
    opt_out_capturing_by_default: boolean;
    opt_out_persistence_by_default: boolean;
    before_send: typeof stripUrlQueries;
};
/**
 * `posthogInitOptions()` from a region (or custom `apiHost`) when no site configuration is at hand.
 * @param {{ region?: 'eu' | 'us', apiHost?: string, consent?: 'opt-in' | 'cookieless', persistence?: PostHogClientConfig['persistence'] }} [options]
 */
export declare function posthogOptions({ region, apiHost, consent, persistence, }?: {
    region?: 'eu' | 'us';
    apiHost?: string;
    consent?: 'opt-in' | 'cookieless';
    persistence?: PostHogClientConfig['persistence'];
}): {
    api_host: string;
    disable_external_dependency_loading: boolean;
    advanced_disable_flags: boolean;
    autocapture: boolean;
    capture_pageview: boolean;
    capture_pageleave: boolean;
    capture_dead_clicks: boolean;
    capture_heatmaps: boolean;
    capture_exceptions: boolean;
    capture_performance: boolean;
    rageclick: boolean;
    disable_session_recording: boolean;
    disable_surveys: boolean;
    disable_web_experiments: boolean;
    disable_product_tours: boolean;
    disable_conversations: boolean;
    mask_all_text: boolean;
    mask_all_element_attributes: boolean;
    person_profiles: 'identified_only';
    respect_dnt: boolean;
    persistence: "localStorage" | "localStorage+cookie" | "memory";
    cookieless_mode?: "always" | undefined;
    opt_out_capturing_by_default: boolean;
    opt_out_persistence_by_default: boolean;
    before_send: typeof stripUrlQueries;
};
/**
 * Keeps only event properties that cannot identify a visitor: snake_case keys with boolean,
 * finite number or short string values (no e-mail-like or URL strings).
 * @param {Record<string, unknown> | undefined} properties
 * @returns {Record<string, string | number | boolean>}
 */
export declare function sanitizeProperties(properties: Record<string, unknown> | undefined): Record<string, string | number | boolean>;
export type ConsentController = {
    state: () => 'disabled' | 'unset' | 'granted' | 'denied';
    /**
     * Records consent and starts capturing.
     */
    grant: () => Promise<boolean>;
    /**
     * Records refusal, stops capturing and clears PostHog state.
     */
    deny: () => void;
    /**
     * Sends an allow-listed event.
     */
    capture: (name: string, properties?: Record<string, unknown>) => boolean;
    /**
     * Resolves once the initial decision has been applied.
     */
    ready: Promise<boolean>;
};
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
export declare function createPostHogConsent(config: PostHogClientConfig, env?: {
    load?: () => Promise<{
        default: any;
    }>;
    storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
    location?: {
        hostname: string;
    };
    navigator?: {
        globalPrivacyControl?: boolean;
        doNotTrack?: string | null;
    };
}): ConsentController;
