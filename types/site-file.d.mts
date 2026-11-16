export { httpsOrigin } from './config.mjs';
/**
 * Parses a YAML (`.yaml`, `.yml`), JSON or TOML file into a plain object. Relative paths are
 * resolved against the current working directory (the project root when run by npm scripts and
 * by `brclz`).
 * @param {string} path
 * @returns {Record<string, unknown>}
 */
export declare function readSiteFile(path: string): Record<string, unknown>;
/** Default location of the JSON copy that `site.config.mjs` imports. */
export declare const SITE_JSON = "site.generated.json";
/**
 * The project's site file: `site.yaml`, else `site.yml`, relative to the working directory.
 * @returns {string | undefined}
 */
export declare function findSiteFile(): string | undefined;
/**
 * Writes (or, with `check`, only compares) the JSON copy of a site file.
 * @param {{ from?: string, to?: string, check?: boolean }} [options]
 * @returns {{ from: string, to: string, status: 'written' | 'unchanged' | 'stale' | 'missing' }}
 *   `missing` = check mode and the JSON file does not exist; `stale` = it differs from the site file.
 */
export declare function syncSiteFile({ from, to, check }?: {
    from?: string;
    to?: string;
    check?: boolean;
}): {
    from: string;
    to: string;
    status: 'written' | 'unchanged' | 'stale' | 'missing';
};
