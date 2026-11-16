export type CspDirectives = Record<string, string[] | null>;
export declare const CSP_DIRECTIVES: readonly string[];
/**
 * Validation message for the first directive name that is not a known CSP directive.
 * @param {Record<string, unknown>} directives
 * @returns {string | undefined}
 */
export declare function unknownDirective(directives: Record<string, unknown>): string | undefined;
/**
 * Validates and serialises directives deterministically (insertion order, duplicates removed).
 * @param {CspDirectives} directives
 * @returns {string}
 */
export declare function serializeCsp(directives: CspDirectives): string;
/**
 * Parses a policy string into directives (first occurrence wins, as browsers do).
 * @param {string} policy
 * @returns {CspDirectives}
 */
export declare function parseCsp(policy: string): CspDirectives;
/**
 * Whether one source expression allows `url` (simplified CSP Level 3 matching: schemes,
 * wildcard hosts, ports and path prefixes; no redirects).
 * @param {string} source
 * @param {URL} url
 * @param {string} selfOrigin
 */
export declare function sourceAllows(source: string, url: URL, selfOrigin: string): boolean;
/**
 * Sources that govern `directive`, after fallbacks; `undefined` means unrestricted.
 * @param {CspDirectives} directives
 * @param {string} directive
 */
export declare function effectiveSources(directives: CspDirectives, directive: string): string[] | undefined;
/**
 * Whether the policy lets a page on `selfOrigin` load `url` under `directive`.
 * @param {CspDirectives} directives
 * @param {string} directive e.g. `connect-src`
 * @param {string} url absolute URL to load
 * @param {string} selfOrigin origin of the page
 */
export declare function cspAllows(directives: CspDirectives, directive: string, url: string, selfOrigin: string): boolean;
/**
 * Whether inline `<script>` / `<style>` elements are allowed. `'unsafe-inline'` is ignored by
 * browsers when a hash or nonce is present.
 * @param {CspDirectives} directives
 * @param {'script' | 'style'} kind
 */
export declare function allowsInline(directives: CspDirectives, kind: 'script' | 'style'): boolean;
