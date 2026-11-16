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
export function parseAttributes(source) {
  /** @type {Record<string, string>} */
  const attributes = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const m of source.matchAll(re)) {
    const name = (m[1] ?? '').toLowerCase();
    if (!(name in attributes)) attributes[name] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attributes;
}

/**
 * Decodes the HTML entities that appear in attribute values and titles.
 * @param {string} value
 */
function decode(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/**
 * @typedef {object} HtmlDocument
 * @property {string | undefined} lang
 * @property {string | undefined} title
 * @property {Record<string, string>[]} meta
 * @property {Record<string, string>[]} links
 * @property {string[]} jsonLd Raw JSON-LD script contents.
 * @property {number} inlineScripts Executable `<script>` elements without `src`.
 * @property {number} inlineStyles `<style>` elements.
 * @property {number} h1
 */

/** Script types a browser executes (data blocks such as application/json are not). */
const EXECUTABLE = /^(|module|text\/javascript|application\/javascript|text\/ecmascript)$/;

/**
 * Extracts the audit-relevant parts of a built HTML page in one pass.
 * @param {string} html
 * @returns {HtmlDocument}
 */
export function parseHtml(html) {
  /** @type {HtmlDocument} */
  const doc = {
    lang: undefined,
    title: undefined,
    meta: [],
    links: [],
    jsonLd: [],
    h1: 0,
    inlineScripts: 0,
    inlineStyles: 0,
  };
  const re =
    /<!--[\s\S]*?-->|<(script|style|title)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  for (const m of html.matchAll(re)) {
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      const attrs = parseAttributes(m[2] ?? '');
      if (tag === 'title' && doc.title === undefined) doc.title = decode((m[3] ?? '').trim());
      const type = attrs.type?.toLowerCase() ?? '';
      if (tag === 'script' && type === 'application/ld+json') doc.jsonLd.push(m[3] ?? '');
      else if (
        tag === 'script' &&
        !('src' in attrs) &&
        EXECUTABLE.test(type) &&
        (m[3] ?? '').trim()
      )
        doc.inlineScripts++;
      if (tag === 'style' && (m[3] ?? '').trim()) doc.inlineStyles++;
      continue;
    }
    const tag = (m[4] ?? '').toLowerCase();
    if (tag === 'html') doc.lang ??= parseAttributes(m[5] ?? '').lang;
    else if (tag === 'meta') doc.meta.push(parseAttributes(m[5] ?? ''));
    else if (tag === 'link') doc.links.push(parseAttributes(m[5] ?? ''));
    else if (tag === 'h1') doc.h1++;
  }
  return doc;
}

/**
 * `content` of the first `<meta>` whose `name` or `property` equals `name` (case-insensitive).
 * @param {HtmlDocument} doc
 * @param {string} name `name` or `property` value
 * @returns {string | undefined}
 */
export function metaContent(doc, name) {
  const lower = name.toLowerCase();
  return doc.meta.find(
    (m) => m.name?.toLowerCase() === lower || m.property?.toLowerCase() === lower,
  )?.content;
}

/**
 * `<link>` elements whose `rel` list contains `rel`.
 * @param {HtmlDocument} doc
 * @param {string} rel lowercase relation, e.g. `canonical`
 * @returns {Record<string, string>[]}
 */
export function linksByRel(doc, rel) {
  return doc.links.filter((l) => (l.rel ?? '').toLowerCase().split(/\s+/).includes(rel));
}
