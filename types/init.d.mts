/**
 * `brclz init`: creates a new Astro site wired to the shared standards. Configuration files
 * are generated from the arguments; static files come from templates/astro-static; dependency
 * versions come from templates/astro-static/package.json (updated by Dependabot).
 */
/**
 * Optional features and the packages they add. The core (Astro, Tailwind, sitemap, Biome,
 * TypeScript, Wrangler, Playwright + axe) is always installed.
 */
export declare const FEATURES: Readonly<{
    search: {
        packages: string[];
        description: string;
    };
    mdx: {
        packages: string[];
        description: string;
    };
    icons: {
        packages: string[];
        description: string;
    };
    typography: {
        packages: string[];
        description: string;
    };
    satteri: {
        packages: string[];
        description: string;
    };
    posthog: {
        packages: string[];
        description: string;
    };
}>;
export type InitOptions = {
    /**
     * Target directory (created; must be empty if it exists).
     */
    directory: string;
    /**
     * Site name.
     */
    name: string;
    /**
     * Production origin, e.g. https://www.example.com.
     */
    url: string;
    /**
     * Defaults to "dev." + the host without "www.".
     */
    previewDomain?: string;
    /**
     * Defaults to the reversed host without "www." (example.org → org-example).
     */
    workerName?: string;
    /**
     * BCP 47 tag, default "fr-CH".
     */
    language?: string;
    /**
     * Optional features (see FEATURES).
     */
    features?: string[];
    /**
     * npm spec of this package for the new site (default: the repository's default branch; the lockfile pins the commit).
     */
    standardsSpec?: string;
    /**
     * Default: today (UTC); `brclz init` then lowers it with
     * `alignCompatibilityDate()` once the site's Wrangler is installed.
     */
    compatibilityDate?: string;
};
/**
 * Derives defaults from the production URL.
 * @param {string} url
 */
export declare function deriveDefaults(url: string): {
    previewDomain: string;
    workerName: string;
};
/**
 * Creates the project. Returns the relative paths written.
 * @param {InitOptions} options
 */
export declare function initProject(options: InitOptions): Promise<{
    name: string;
    url: string;
    previewDomain: string;
    workerName: string;
    language: string;
    compatibilityDate: string;
    directory: string;
    files: string[];
    features: string[];
}>;
/**
 * Newest compatibility date the local Workers runtime (`workerd`) installed with the site's
 * Wrangler declares, or null when Wrangler is not installed.
 * @param {string} directory
 * @returns {string | null}
 */
export declare function installedWorkerdDate(directory: string): string | null;
/**
 * Lowers the compatibility date written by `initProject()` to the one the installed `workerd`
 * supports, so `wrangler dev` starts when the release is older than today. Rewrites
 * `wrangler.toml` and `site.config.mjs` (before Biome formats them). Never raises the date.
 * @param {string} directory
 * @param {string} current Date written by `initProject()`.
 * @returns {Promise<{ date: string, changed: boolean } | null>} null when workerd is not installed.
 */
export declare function alignCompatibilityDate(directory: string, current: string): Promise<{
    date: string;
    changed: boolean;
} | null>;
