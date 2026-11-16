/**
 * Request-time half of the `_headers` support: evaluates precompiled rules for one URL.
 *
 * It imports nothing, so a Worker that loads the rules written by `brclz generate-header-rules`
 * bundles only this file, not the configuration, CSP or schema code (and none of the site data).
 * Docs: https://developers.cloudflare.com/workers/static-assets/headers/
 */
export type CompiledRule = {
    pattern: string;
    /**
     * Header names removed before `set` is applied.
     */
    detach: string[];
    set: [string, string][];
    /**
     * Human-readable origin used in error messages (not serialised).
     */
    source?: string;
};
/**
 * @typedef {object} CompiledRule
 * @property {string} pattern
 * @property {string[]} detach Header names removed before `set` is applied.
 * @property {[string, string][]} set
 * @property {string} [source] Human-readable origin used in error messages (not serialised).
 */
/**
 * Throws when a `_headers` URL pattern is not valid for Cloudflare.
 * @param {string} pattern
 */
export declare function checkPattern(pattern: string): void;
export type Matcher = (url: string | URL) => boolean;
/**
 * Compiles a Cloudflare URL pattern to a matcher over `host + path` (absolute) or `path`.
 * Matchers are cached per pattern: a Worker evaluates the same few rules on every request.
 * @param {string} pattern
 * @returns {Matcher}
 */
export declare function compilePattern(pattern: string): Matcher;
/**
 * Emulates Cloudflare's documented evaluation of `_headers` for one URL. Use it to apply the
 * same headers to Worker-generated responses, and in tests. Keys are returned as written.
 * @param {CompiledRule[]} rules
 * @param {string | URL} url
 * @returns {Record<string, string>}
 */
export declare function resolveRuleHeaders(rules: CompiledRule[], url: string | URL): Record<string, string>;
/**
 * Copies the resolved headers onto a Worker `Response` (e.g. a 410 page) and returns it.
 * @param {Response} response
 * @param {CompiledRule[]} rules
 * @param {string | URL} url request URL
 * @returns {Response}
 */
export declare function applyHeaders(response: Response, rules: CompiledRule[], url: string | URL): Response;
