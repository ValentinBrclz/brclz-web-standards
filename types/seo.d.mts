/**
 * URL path at which Workers Static Assets serves a built HTML file with status 200.
 * @param {string} file path relative to dist, with "/" separators
 * @param {string} htmlHandling
 */
export declare function servedPath(file: string, htmlHandling: string): string;
export type AuditReport = {
    htmlPages: number;
    indexablePages: number;
    errors: string[];
    warnings: string[];
};
/**
 * @typedef {object} AuditReport
 * @property {number} htmlPages
 * @property {number} indexablePages
 * @property {string[]} errors
 * @property {string[]} warnings
 */
/**
 * Audits a built `dist/` against the site configuration (see the module comment for scope).
 * @param {string} directory built output (`dist`)
 * @param {import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>} input
 * @returns {Promise<AuditReport>}
 */
export declare function auditDist(directory: string, input: import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>): Promise<AuditReport>;
