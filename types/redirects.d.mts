/**
 * Validation of Cloudflare Workers Static Assets `_redirects` files.
 * Docs: https://developers.cloudflare.com/workers/static-assets/redirects/
 *
 * The file stays project-owned (public/_redirects, or a build step that writes
 * dist/_redirects); this module checks it against Cloudflare's rules and limits and against the
 * site's trailing-slash policy.
 */
export declare const LIMITS: Readonly<{
    static: 2000;
    dynamic: 100;
    lineLength: 1000;
}>;
export type Redirect = {
    line: number;
    source: string;
    target: string;
    status: number;
    /**
     * Source contains a splat or placeholder.
     */
    dynamic: boolean;
};
export type RedirectReport = {
    redirects: Redirect[];
    static: number;
    dynamic: number;
    warnings: string[];
};
/**
 * @typedef {object} Redirect
 * @property {number} line
 * @property {string} source
 * @property {string} target
 * @property {number} status
 * @property {boolean} dynamic Source contains a splat or placeholder.
 *
 * @typedef {object} RedirectReport
 * @property {Redirect[]} redirects
 * @property {number} static
 * @property {number} dynamic
 * @property {string[]} warnings
 */
/**
 * Parses and validates `_redirects` content. Throws with every error; returns warnings.
 * @param {string} content
 * @param {{ trailingSlash?: 'never' | 'always' | 'ignore', productionUrl?: string }} [options]
 * @returns {RedirectReport}
 */
export declare function checkRedirects(content: string, options?: {
    trailingSlash?: 'never' | 'always' | 'ignore';
    productionUrl?: string;
}): RedirectReport;
/**
 * Validates `_redirects` content (throws like `checkRedirects`) and returns the redirect count.
 * @param {string} content
 * @param {Parameters<typeof checkRedirects>[1]} [options]
 */
export declare function validateRedirects(content: string, options?: Parameters<typeof checkRedirects>[1]): number;
