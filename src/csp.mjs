/**
 * Content-Security-Policy helpers. Policies are represented as an ordered object of
 * `directive -> source[]` so that sites can override one directive (or `$append` one origin)
 * without copying the whole policy string. `null` removes a directive; `[]` emits a
 * value-less directive such as `upgrade-insecure-requests`.
 *
 * @typedef {Record<string, string[] | null>} CspDirectives
 */
import { suggest } from './schema.mjs';

export const CSP_DIRECTIVES = Object.freeze([
  'default-src',
  'script-src',
  'script-src-elem',
  'script-src-attr',
  'style-src',
  'style-src-elem',
  'style-src-attr',
  'img-src',
  'font-src',
  'connect-src',
  'media-src',
  'object-src',
  'frame-src',
  'child-src',
  'worker-src',
  'manifest-src',
  'fenced-frame-src',
  'base-uri',
  'form-action',
  'frame-ancestors',
  'sandbox',
  'upgrade-insecure-requests',
  'report-uri',
  'report-to',
  'require-trusted-types-for',
  'trusted-types',
  'webrtc',
]);

/** Fetch directives fall back to these, in order (CSP Level 3, section 6.8.3). */
const FALLBACKS = {
  'script-src-elem': ['script-src-elem', 'script-src', 'default-src'],
  'script-src-attr': ['script-src-attr', 'script-src', 'default-src'],
  'script-src': ['script-src', 'default-src'],
  'style-src-elem': ['style-src-elem', 'style-src', 'default-src'],
  'style-src-attr': ['style-src-attr', 'style-src', 'default-src'],
  'style-src': ['style-src', 'default-src'],
  'worker-src': ['worker-src', 'child-src', 'script-src', 'default-src'],
  'frame-src': ['frame-src', 'child-src', 'default-src'],
};

const DIRECTIVE_SET = new Set(CSP_DIRECTIVES);
const SOURCE_PATTERN = /^[^\s;,]+$/;
/** Keywords that are only valid inside single quotes. */
const UNQUOTED_KEYWORD =
  /^(self|none|unsafe-inline|unsafe-eval|strict-dynamic|wasm-unsafe-eval|unsafe-hashes|report-sample)$/;

/**
 * Validation message for the first directive name that is not a known CSP directive.
 * @param {Record<string, unknown>} directives
 * @returns {string | undefined}
 */
export function unknownDirective(directives) {
  const unknown = Object.keys(directives).find((name) => !DIRECTIVE_SET.has(name));
  return unknown
    ? `unknown CSP directive "${unknown}"${suggest(unknown, CSP_DIRECTIVES)}`
    : undefined;
}

/**
 * Validates and serialises directives deterministically (insertion order, duplicates removed).
 * @param {CspDirectives} directives
 * @returns {string}
 */
export function serializeCsp(directives) {
  const parts = [];
  for (const [name, sources] of Object.entries(directives)) {
    if (!DIRECTIVE_SET.has(name)) throw new Error(`Unknown CSP directive "${name}"`);
    if (sources === null) continue;
    if (!Array.isArray(sources))
      throw new Error(`CSP directive "${name}" must be an array of sources or null`);
    for (const source of sources) {
      if (typeof source !== 'string' || !SOURCE_PATTERN.test(source))
        throw new Error(`Invalid CSP source ${JSON.stringify(source)} in "${name}"`);
      if (UNQUOTED_KEYWORD.test(source))
        throw new Error(`CSP keyword ${source} in "${name}" must be single-quoted: '${source}'`);
    }
    const unique = [...new Set(sources)];
    if (unique.includes("'none'") && unique.length > 1)
      throw new Error(`CSP directive "${name}" combines 'none' with other sources`);
    parts.push(unique.length ? `${name} ${unique.join(' ')}` : name);
  }
  if (!parts.length) throw new Error('Content-Security-Policy has no directives');
  return parts.join('; ');
}

/**
 * Parses a policy string into directives (first occurrence wins, as browsers do).
 * @param {string} policy
 * @returns {CspDirectives}
 */
export function parseCsp(policy) {
  /** @type {CspDirectives} */
  const result = {};
  for (const chunk of policy.split(';')) {
    const [name, ...sources] = chunk.trim().split(/\s+/).filter(Boolean);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!(key in result)) result[key] = sources;
  }
  return result;
}

/**
 * Host-source match: exact host, `*` or a `*.` wildcard (one or more labels).
 * @param {string} host
 * @param {string} pattern
 */
function hostMatches(host, pattern) {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1));
  return host === pattern;
}

/**
 * Whether one source expression allows `url` (simplified CSP Level 3 matching: schemes,
 * wildcard hosts, ports and path prefixes; no redirects).
 * @param {string} source
 * @param {URL} url
 * @param {string} selfOrigin
 */
export function sourceAllows(source, url, selfOrigin) {
  const lower = source.toLowerCase();
  if (lower === "'self'") return url.origin === selfOrigin;
  if (lower.startsWith("'")) return false;
  if (lower === '*')
    return (
      ['http:', 'https:'].includes(url.protocol) || url.protocol === new URL(selfOrigin).protocol
    );
  if (/^[a-z][a-z0-9+.-]*:$/.test(lower))
    return url.protocol === lower || (lower === 'http:' && url.protocol === 'https:');
  const match =
    /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*|(?:\*\.)?[a-z0-9.-]+)(?::(\d+|\*))?(\/[^?#]*)?$/.exec(lower);
  if (!match) return false;
  const [, scheme, host = '', port, path] = match;
  if (
    scheme &&
    !(url.protocol === `${scheme}:` || (scheme === 'http' && url.protocol === 'https:'))
  )
    return false;
  if (!scheme && url.protocol !== 'https:' && url.protocol !== new URL(selfOrigin).protocol)
    return false;
  if (!hostMatches(url.hostname, host)) return false;
  if (port !== '*') {
    const effective = url.port || (url.protocol === 'https:' ? '443' : '80');
    const wanted = port || (url.protocol === 'https:' ? '443' : '80');
    if (effective !== wanted) return false;
  }
  if (path) return path.endsWith('/') ? url.pathname.startsWith(path) : url.pathname === path;
  return true;
}

/**
 * Sources that govern `directive`, after fallbacks; `undefined` means unrestricted.
 * @param {CspDirectives} directives
 * @param {string} directive
 */
export function effectiveSources(directives, directive) {
  const chain = FALLBACKS[/** @type {keyof typeof FALLBACKS} */ (directive)] ?? [
    directive,
    'default-src',
  ];
  for (const name of chain) {
    const sources = directives[name];
    if (Array.isArray(sources)) return sources;
  }
  return undefined;
}

/**
 * Whether the policy lets a page on `selfOrigin` load `url` under `directive`.
 * @param {CspDirectives} directives
 * @param {string} directive e.g. `connect-src`
 * @param {string} url absolute URL to load
 * @param {string} selfOrigin origin of the page
 */
export function cspAllows(directives, directive, url, selfOrigin) {
  const sources = effectiveSources(directives, directive);
  if (!sources) return true;
  const target = new URL(url);
  return sources.some((source) => sourceAllows(source, target, selfOrigin));
}

/**
 * Whether inline `<script>` / `<style>` elements are allowed. `'unsafe-inline'` is ignored by
 * browsers when a hash or nonce is present.
 * @param {CspDirectives} directives
 * @param {'script' | 'style'} kind
 */
export function allowsInline(directives, kind) {
  const sources = effectiveSources(directives, `${kind}-src-elem`);
  if (!sources) return true;
  const lower = sources.map((s) => s.toLowerCase());
  if (lower.some((s) => /^'(nonce|sha256|sha384|sha512)-/.test(s) || s === "'strict-dynamic'"))
    return false;
  return lower.includes("'unsafe-inline'");
}
