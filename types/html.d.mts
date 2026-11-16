/**
 * Tiny, dependency-free extraction of head metadata from built HTML. It tokenises start tags
 * and attributes (any order, quoted or unquoted) but is not a full HTML parser: comments and
 * <script>/<style> contents are skipped so their text is never mistaken for markup.
 */
/**
 * Attributes of a start tag as a lowercase-name map (the first occurrence of a name wins).
 * @param {string} source text between the tag name and `>`
 * @returns {Record<string, string>}
 */
export declare function parseAttributes(source: string): Record<string, string>;
export type HtmlDocument = {
    lang: string | undefined;
    title: string | undefined;
    meta: Record<string, string>[];
    links: Record<string, string>[];
    /**
     * Raw JSON-LD script contents.
     */
    jsonLd: string[];
    /**
     * Executable `<script>` elements without `src`.
     */
    inlineScripts: number;
    /**
     * `<style>` elements.
     */
    inlineStyles: number;
    h1: number;
};
/**
 * Extracts the audit-relevant parts of a built HTML page in one pass.
 * @param {string} html
 * @returns {HtmlDocument}
 */
export declare function parseHtml(html: string): HtmlDocument;
/**
 * `content` of the first `<meta>` whose `name` or `property` equals `name` (case-insensitive).
 * @param {HtmlDocument} doc
 * @param {string} name `name` or `property` value
 * @returns {string | undefined}
 */
export declare function metaContent(doc: HtmlDocument, name: string): string | undefined;
/**
 * `<link>` elements whose `rel` list contains `rel`.
 * @param {HtmlDocument} doc
 * @param {string} rel lowercase relation, e.g. `canonical`
 * @returns {Record<string, string>[]}
 */
export declare function linksByRel(doc: HtmlDocument, rel: string): Record<string, string>[];
