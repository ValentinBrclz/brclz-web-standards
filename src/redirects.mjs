/**
 * Validation of Cloudflare Workers Static Assets `_redirects` files.
 * Docs: https://developers.cloudflare.com/workers/static-assets/redirects/
 *
 * The file stays project-owned (public/_redirects, or a build step that writes
 * dist/_redirects); this module checks it against Cloudflare's rules and limits and against the
 * site's trailing-slash policy.
 */

export const LIMITS = Object.freeze({ static: 2000, dynamic: 100, lineLength: 1000 });
const STATUSES = new Set(['200', '301', '302', '303', '307', '308']);

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
export function checkRedirects(content, options = {}) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {Redirect[]} */
  const redirects = [];
  /** @type {Map<string, Redirect>} */
  const bySource = new Map();
  let seenDynamic = false;
  const production = options.productionUrl ? new URL(options.productionUrl) : null;

  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.length > LIMITS.lineLength)
      errors.push(`line ${line}: exceeds ${LIMITS.lineLength} characters`);
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2 || parts.length > 3) {
      errors.push(`line ${line}: expected "source destination [status]"`);
      continue;
    }
    const [source = '', target = '', code = '302'] = parts;
    if (!STATUSES.has(code)) {
      errors.push(`line ${line}: unsupported status ${code} (use 301, 302, 303, 307, 308 or 200)`);
      continue;
    }
    const status = Number(code);
    if (!source.startsWith('/'))
      errors.push(
        `line ${line}: source must be a path starting with "/" (domain-level redirects are not supported; use a Redirect Rule)`,
      );
    if (source.includes('?'))
      errors.push(`line ${line}: query strings cannot be matched in the source`);
    if (source.includes('#'))
      warnings.push(`line ${line}: fragments in the source are ignored by Cloudflare`);
    if ((source.match(/\*/g) ?? []).length > 1)
      errors.push(`line ${line}: only one splat (*) is allowed`);
    const placeholders = [...source.matchAll(/:([A-Za-z]\w*)/g)].map((m) => m[1]);
    if (new Set(placeholders).size !== placeholders.length)
      errors.push(`line ${line}: each placeholder may appear once in the source`);
    for (const ref of target.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').matchAll(/:([A-Za-z]\w*)/g)) {
      if (ref[1] !== 'splat' && !placeholders.includes(ref[1]))
        errors.push(`line ${line}: destination uses unknown placeholder :${ref[1]}`);
      if (ref[1] === 'splat' && !source.includes('*'))
        errors.push(`line ${line}: destination uses :splat but the source has no *`);
    }
    const external = /^[a-z][a-z0-9+.-]*:\/\//i.test(target);
    if (!external && !target.startsWith('/'))
      errors.push(`line ${line}: destination must start with "/" or be an absolute URL`);
    if (external) {
      try {
        const url = new URL(target);
        if (url.protocol !== 'https:')
          warnings.push(`line ${line}: destination uses ${url.protocol} instead of https:`);
        if (status === 200)
          errors.push(`line ${line}: proxying (200) is only supported for paths on the same site`);
        if (production && url.origin === production.origin)
          warnings.push(
            `line ${line}: destination repeats the production origin; use a relative path`,
          );
      } catch {
        errors.push(`line ${line}: invalid destination URL`);
      }
    }
    const dynamic = /[*:]/.test(source);
    if (dynamic) seenDynamic = true;
    else if (seenDynamic)
      warnings.push(
        `line ${line}: static redirect after a dynamic one; Cloudflare recommends listing static redirects first`,
      );
    if (source === target) errors.push(`line ${line}: redirects to itself`);
    const previous = bySource.get(source);
    if (previous)
      errors.push(
        `line ${line}: duplicate source ${source} (line ${previous.line} wins; this line is never used)`,
      );
    const redirect = { line, source, target, status, dynamic };
    redirects.push(redirect);
    if (!previous) bySource.set(source, redirect);

    if (
      !external &&
      !dynamic &&
      status !== 200 &&
      options.trailingSlash &&
      options.trailingSlash !== 'ignore'
    ) {
      const path = target.split(/[?#]/)[0] ?? '';
      const last = path.split('/').pop() ?? '';
      const isFile = last.includes('.');
      if (path !== '/' && !isFile) {
        if (options.trailingSlash === 'never' && path.endsWith('/'))
          warnings.push(
            `line ${line}: destination ${path} ends with "/" but trailingSlash is "never" (extra redirect hop)`,
          );
        if (options.trailingSlash === 'always' && !path.endsWith('/'))
          warnings.push(
            `line ${line}: destination ${path} lacks the trailing "/" required by trailingSlash "always" (extra redirect hop)`,
          );
      }
    }
  }

  const staticCount = redirects.filter((r) => !r.dynamic).length;
  const dynamicCount = redirects.length - staticCount;
  if (staticCount > LIMITS.static)
    errors.push(
      `${staticCount} static redirects exceed Cloudflare's limit of ${LIMITS.static} (use Bulk Redirects)`,
    );
  if (dynamicCount > LIMITS.dynamic)
    errors.push(`${dynamicCount} dynamic redirects exceed Cloudflare's limit of ${LIMITS.dynamic}`);

  // Exact-path chains and cycles (fragments and queries are stripped before following).
  for (const start of bySource.values()) {
    if (start.dynamic || start.status === 200) continue;
    const seen = new Set([start.source]);
    let next = bySource.get(start.target.split(/[?#]/)[0] ?? '');
    let hops = 0;
    let cycle = false;
    while (next && !next.dynamic && next.status !== 200) {
      if (seen.has(next.source)) {
        errors.push(`line ${start.line}: redirect cycle ${[...seen, next.source].join(' -> ')}`);
        cycle = true;
        break;
      }
      seen.add(next.source);
      hops++;
      next = bySource.get(next.target.split(/[?#]/)[0] ?? '');
    }
    if (hops > 0 && !cycle)
      warnings.push(
        `line ${start.line}: ${start.source} needs ${hops + 1} hops (${[...seen].join(' -> ')}); point it at the final destination`,
      );
  }

  if (errors.length) throw new Error(`Invalid _redirects:\n- ${errors.join('\n- ')}`);
  return { redirects, static: staticCount, dynamic: dynamicCount, warnings };
}

/**
 * Validates `_redirects` content (throws like `checkRedirects`) and returns the redirect count.
 * @param {string} content
 * @param {Parameters<typeof checkRedirects>[1]} [options]
 */
export function validateRedirects(content, options) {
  return checkRedirects(content, options).redirects.length;
}
