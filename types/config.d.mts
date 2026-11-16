export type CspDirectives = import('./csp.mjs').CspDirectives;
export type HeaderRule = {
    /**
     * `_headers` URL pattern (`/path/*` or `https://host/*`).
     */
    path: string;
    /**
     * Header values; `null` only detaches.
     */
    headers?: Record<string, string | null>;
    /**
     * Acknowledges a deliberate production `X-Robots-Tag: noindex`.
     */
    allowNoindex?: boolean;
    /**
     * Override of `security.csp` for this pattern (same merge operators); `null` removes the CSP.
     */
    csp?: Override<CspDirectives> | null;
};
export type SiteConfig = {
    preset: 'astro-static';
    identity: {
        name: string;
        productionUrl: string;
        previewDomain: string | null;
        language: string | null;
    };
    astro: {
        buildFormat: 'file' | 'directory' | 'preserve';
        trailingSlash: 'never' | 'always' | 'ignore';
    };
    cloudflare: {
        workerName: string | null;
        compatibilityDate: string | null;
        workersDev: boolean;
        previewUrls: boolean;
        assetsDirectory: string;
        htmlHandling: 'auto-trailing-slash' | 'force-trailing-slash' | 'drop-trailing-slash' | 'none';
        notFoundHandling: '404-page' | 'single-page-application' | 'none';
    };
    security: {
        headers: Record<string, string | null>;
        csp: CspDirectives | null;
        cspReportOnly: boolean;
        hsts: string | null;
        previewNoindex: boolean;
        previewRobotsTag: string;
        immutableAstroAssets: boolean;
        extraRules: HeaderRule[];
    };
    seo: {
        sitemap: boolean;
        canonical: boolean;
        robotsTxt: boolean;
    };
    aio: {
        llmsTxt: boolean;
    };
    analytics: AnalyticsConfig;
};
export type AnalyticsConfig = {
    posthog: PostHogConfig;
    ga4: {
        enabled: boolean;
        consent: 'opt-in' | 'not-required';
    };
    cloudflareWebAnalytics: {
        enabled: boolean;
    };
};
export type PostHogConfig = {
    enabled: boolean;
    consent: 'opt-in' | 'cookieless';
    region: 'eu' | 'us';
    /**
     * Custom ingestion origin (reverse proxy); defaults to the region host.
     */
    apiHost: string | null;
    /**
     * Public project API key (`phc_…`).
     */
    projectKey: string | null;
    /**
     * Persistence after opt-in.
     */
    persistence: 'memory' | 'localStorage' | 'localStorage+cookie';
    capturePageview: boolean;
    /**
     * Allowed custom event names; anything else is dropped.
     */
    events: string[];
};
export type SiteOverrides = {
    [K in Exclude<keyof SiteConfig, 'identity'>]?: Override<SiteConfig[K]>;
} & {
    identity: { [K in keyof SiteConfig['identity']]?: SiteConfig['identity'][K]; } & {
        name: string;
        productionUrl: string;
    };
};
export type Override<T> = T extends readonly (infer U)[] ? T | {
    $append: U[];
} | {
    $replace: T;
} : T extends object ? {
    [K in keyof T]?: Override<T[K]>;
} | {
    $replace: T;
} : T | {
    $replace: T;
};
/**
 * Deep merge without mutating either argument.
 * @template T
 * @param {T} base
 * @param {unknown} override
 * @param {string} [path]
 * @returns {T}
 */
export declare function mergeSettings<T>(base: T, override: unknown, path?: string): T;
/** @type {Readonly<Omit<SiteConfig, 'identity'> & { identity: { name: null, productionUrl: null, previewDomain: null, language: null } }>} */
export declare const defaults: Readonly<Omit<SiteConfig, 'identity'> & {
    identity: {
        name: null;
        productionUrl: null;
        previewDomain: null;
        language: null;
    };
}>;
/**
 * Analytics endpoints that must be allowed by the CSP of a page that loads the provider.
 * @param {Pick<SiteConfig, 'analytics'>} site
 */
export declare function analyticsCspRequirements(site: Pick<SiteConfig, 'analytics'>): {
    provider: string;
    directive: string;
    url: string;
}[];
/**
 * Ingestion origin: the custom `apiHost`, else the regional PostHog host.
 * @param {Pick<PostHogConfig, 'apiHost' | 'region'>} posthog
 * @returns {string}
 */
export declare function posthogApiHost(posthog: Pick<PostHogConfig, 'apiHost' | 'region'>): string;
/**
 * Validates a fully merged configuration and throws one error listing every problem.
 * @param {unknown} config
 * @returns {SiteConfig}
 */
export declare function validateSite(config: unknown): SiteConfig;
/**
 * Applies `defaults`, then the site overrides, validates, and returns a deeply frozen config.
 * @param {SiteOverrides} overrides
 * @returns {Readonly<SiteConfig>}
 */
export declare function defineSite(overrides: SiteOverrides): Readonly<SiteConfig>;
/**
 * Accepts either the result of `defineSite()` or raw overrides.
 * @param {SiteOverrides | Readonly<SiteConfig>} input
 * @returns {Readonly<SiteConfig>}
 */
export declare function resolveSite(input: SiteOverrides | Readonly<SiteConfig>): Readonly<SiteConfig>;
/**
 * Non-fatal findings worth reviewing (printed by `brclz check`).
 * @param {Readonly<SiteConfig>} site
 * @returns {string[]}
 */
export declare function lintSite(site: Readonly<SiteConfig>): string[];
/**
 * Turns a domain or an HTTPS URL from a site file into the bare HTTPS origin that
 * `identity.productionUrl` expects: "example.com" and "https://example.com/" both give
 * "https://example.com". Anything else (HTTP, a path, a port, credentials) is refused so the
 * mismatch is visible instead of being silently trimmed.
 * @param {unknown} value
 * @returns {string}
 */
export declare function httpsOrigin(value: unknown): string;
