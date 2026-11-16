/**
 * Request-time half of the `_headers` support: evaluates precompiled rules for one URL.
 *
 * It imports nothing, so a Worker that loads the rules written by `brclz generate-header-rules`
 * bundles only this file, not the configuration, CSP or schema code (and none of the site data).
 * Docs: https://developers.cloudflare.com/workers/static-assets/headers/
 */

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
export function checkPattern(pattern) {
  if (typeof pattern !== 'string' || /\s/.test(pattern))
    throw new Error(`Invalid _headers pattern ${JSON.stringify(pattern)}: no whitespace allowed`);
  if (!pattern.startsWith('/') && !pattern.startsWith('https://'))
    throw new Error(`Invalid _headers pattern "${pattern}": must start with "/" or "https://"`);
  if (/^https:\/\/[^/]*:\d/.test(pattern))
    throw new Error(`Invalid _headers pattern "${pattern}": ports are not supported`);
  if ((pattern.match(/\*/g) ?? []).length > 1)
    throw new Error(`Invalid _headers pattern "${pattern}": only one splat (*) is allowed`);
  const names = [...pattern.matchAll(/:([A-Za-z]\w*)/g)].map((m) => m[1]);
  if (new Set(names).size !== names.length)
    throw new Error(`Invalid _headers pattern "${pattern}": each placeholder may appear once`);
}

/** @typedef {(url: string | URL) => boolean} Matcher */

/** @type {Map<string, Matcher>} Patterns come from the site's own rules, so the map stays small. */
const matchers = new Map();

/**
 * Compiles a Cloudflare URL pattern to a matcher over `host + path` (absolute) or `path`.
 * Matchers are cached per pattern: a Worker evaluates the same few rules on every request.
 * @param {string} pattern
 * @returns {Matcher}
 */
export function compilePattern(pattern) {
  const cached = matchers.get(pattern);
  if (cached) return cached;
  checkPattern(pattern);
  const absolute = pattern.startsWith('https://');
  const body = absolute ? pattern.slice('https://'.length) : pattern;
  const slash = absolute ? body.indexOf('/') : 0;
  const hostPart = absolute ? (slash === -1 ? body : body.slice(0, slash)) : '';
  const pathPart = absolute ? (slash === -1 ? '/' : body.slice(slash)) : body;
  /** @param {string} text @param {string} delimiter */
  const toRegex = (text, delimiter) =>
    text
      .split(/(\*|:[A-Za-z]\w*)/)
      .map((token) => {
        if (token === '*') return '.*';
        if (/^:[A-Za-z]\w*$/.test(token)) return `[^${delimiter}]+`;
        return token.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
  const regex = new RegExp(
    `^${absolute ? toRegex(hostPart, './') : ''}${toRegex(pathPart, '/')}$`,
    'i',
  );
  /** @type {Matcher} */
  const matcher = (url) => {
    const u = typeof url === 'string' ? new URL(url) : url;
    return regex.test(absolute ? `${u.hostname}${u.pathname}` : u.pathname);
  };
  matchers.set(pattern, matcher);
  return matcher;
}

/**
 * Emulates Cloudflare's documented evaluation of `_headers` for one URL. Use it to apply the
 * same headers to Worker-generated responses, and in tests. Keys are returned as written.
 * @param {CompiledRule[]} rules
 * @param {string | URL} url
 * @returns {Record<string, string>}
 */
export function resolveRuleHeaders(rules, url) {
  const target = typeof url === 'string' ? new URL(url) : url;
  /** @type {Map<string, [string, string]>} */
  const result = new Map();
  for (const rule of rules) {
    if (!compilePattern(rule.pattern)(target)) continue;
    for (const name of rule.detach) result.delete(name.toLowerCase());
    for (const [name, value] of rule.set) {
      const key = name.toLowerCase();
      const existing = result.get(key);
      result.set(key, existing ? [existing[0], `${existing[1]}, ${value}`] : [name, value]);
    }
  }
  return Object.fromEntries(result.values());
}

/**
 * Copies the resolved headers onto a Worker `Response` (e.g. a 410 page) and returns it.
 * @param {Response} response
 * @param {CompiledRule[]} rules
 * @param {string | URL} url request URL
 * @returns {Response}
 */
export function applyHeaders(response, rules, url) {
  const copy = new Response(response.body, response);
  for (const [name, value] of Object.entries(resolveRuleHeaders(rules, url)))
    copy.headers.set(name, value);
  return copy;
}
