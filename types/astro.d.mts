export type BaseAstroConfig = {
    site: string;
    output: 'static';
    trailingSlash: 'never' | 'always' | 'ignore';
    build: {
        format: 'file' | 'directory' | 'preserve';
        inlineStylesheets?: 'never';
    };
    vite: {
        build?: {
            assetsInlineLimit: number;
        };
    };
};
/**
 * @typedef {object} BaseAstroConfig
 * @property {string} site
 * @property {'static'} output
 * @property {'never' | 'always' | 'ignore'} trailingSlash
 * @property {{ format: 'file' | 'directory' | 'preserve', inlineStylesheets?: 'never' }} build
 * @property {{ build?: { assetsInlineLimit: number } }} vite
 */
/**
 * @param {import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>} input
 * @returns {BaseAstroConfig}
 */
export declare function baseAstroConfig(input: import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>): BaseAstroConfig;
/**
 * Finds settings in a project's `astro.config.*` that `baseAstroConfig()` already derives from
 * `site.config.mjs`. A second copy would silently win over the spread (it comes later in the
 * object) and make Astro's canonical URLs and sitemap disagree with `_headers` and the Wrangler
 * routes. Only top-level properties of the config object are inspected (biome/prettier indent:
 * at most two spaces or one tab), so integration options named `site` are not reported.
 * @param {string} source Text of the Astro configuration file.
 * @returns {{ line: number, key: string }[]}
 */
export declare function findAstroConfigConflicts(source: string): {
    line: number;
    key: string;
}[];
