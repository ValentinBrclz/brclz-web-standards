/**
 * Generates a Wrangler JSON configuration for a fully static site. Refuses Worker code,
 * bindings and cron triggers: those stay in a project-owned configuration.
 * @param {import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>} input
 * @param {{ configDir?: string, projectDir?: string }} [options] Directory the config will be written to,
 *   and the project root that `cloudflare.assetsDirectory` is relative to (both default to cwd).
 */
export declare function generateStaticWrangler(input: import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>, options?: {
    configDir?: string;
    projectDir?: string;
}): {
    $schema: string;
    name: string;
    compatibility_date: string;
    workers_dev: boolean;
    preview_urls: boolean;
    assets: {
        directory: string;
        html_handling: "auto-trailing-slash" | "drop-trailing-slash" | "force-trailing-slash" | "none";
        not_found_handling: "404-page" | "none" | "single-page-application";
    };
    routes: {
        pattern: string;
        custom_domain: boolean;
    }[];
    previews: {};
};
/**
 * Strips // and /* *\/ comments and trailing commas from JSONC.
 * @param {string} text
 */
export declare function parseJsonc(text: string): any;
/**
 * Reads wrangler.toml, wrangler.json or wrangler.jsonc.
 * @param {string} path
 * @returns {Promise<Record<string, any>>}
 */
export declare function readWranglerConfig(path: string): Promise<Record<string, any>>;
/**
 * Compares a Wrangler configuration with the site configuration. Never modifies it.
 * @param {import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>} input
 * @param {Record<string, any>} config parsed Wrangler configuration
 * @param {{ configDir?: string, projectDir?: string }} [options]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export declare function checkWranglerConfig(input: import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>, config: Record<string, any>, options?: {
    configDir?: string;
    projectDir?: string;
}): {
    errors: string[];
    warnings: string[];
};
