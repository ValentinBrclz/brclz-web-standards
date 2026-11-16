/**
 * Static audit of a built `dist/` directory: indexability signals that must agree with each
 * other (canonical, robots, sitemap, preview isolation) plus basic page metadata. It is a
 * consistency check, not a search-ranking, structured-data or WCAG audit.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { resolveSite } from './config.mjs';
import { allowsInline, parseCsp } from './csp.mjs';
import { buildHeaderRules } from './headers.mjs';
import { resolveRuleHeaders } from './headers-runtime.mjs';
import { linksByRel, metaContent, parseHtml } from './html.mjs';

/** @param {string} directory */
async function listFiles(directory) {
  /** @type {string[]} */
  const files = [];
  /** @param {string} dir */
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === '_astro' || entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await visit(directory);
  return files;
}

/**
 * URL path at which Workers Static Assets serves a built HTML file with status 200.
 * @param {string} file path relative to dist, with "/" separators
 * @param {string} htmlHandling
 */
export function servedPath(file, htmlHandling) {
  if (htmlHandling === 'none') return `/${file}`;
  const index = file === 'index.html' || file.endsWith('/index.html');
  const base =
    `/${index ? file.slice(0, -'index.html'.length) : file.slice(0, -'.html'.length)}`.replace(
      /\/$/,
      '',
    ) || '/';
  if (base === '/') return '/';
  if (htmlHandling === 'force-trailing-slash') return `${base}/`;
  if (htmlHandling === 'auto-trailing-slash' && index) return `${base}/`;
  return base;
}

/** @param {string} text */
function robotsGroups(text) {
  /** @type {{ agents: string[], rules: [string, string][] }[]} */
  const groups = [];
  /** @type {{ agents: string[], rules: [string, string][] } | undefined} */
  let current;
  let lastWasAgent = false;
  const sitemaps = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = (m[1] ?? '').toLowerCase();
    const value = (m[2] ?? '').trim();
    if (key === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      current?.rules.push([key, value]);
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps };
}

/**
 * Appends `value` to the list stored under `key`.
 * @template K, V
 * @param {Map<K, V[]>} map
 * @param {K} key
 * @param {V} value
 */
function pushTo(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * `<loc>` values of a sitemap.
 * @param {string} xml
 */
const locs = (xml) =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) =>
    (m[1] ?? '').replace(/&amp;/g, '&'),
  );

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
export async function auditDist(directory, input) {
  const site = resolveSite(input);
  const origin = new URL(/** @type {string} */ (site.identity.productionUrl)).origin;
  const preview = site.identity.previewDomain;
  const html = site.cloudflare.htmlHandling;
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  const files = (await listFiles(directory)).map((f) =>
    relative(directory, f).split(sep).join('/'),
  );
  const fileSet = new Set(files);
  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const headerRules = buildHeaderRules(site);
  if (!htmlFiles.length) errors.push(`${directory}: no HTML files found (run the build first)`);

  /** @type {Map<string, { file: string, indexable: boolean, canonical?: string }>} */
  const pages = new Map();
  /** @type {Map<string, string[]>} */
  const titles = new Map();
  /** @type {Map<string, string[]>} */
  const descriptions = new Map();
  /** @param {string} value */
  const onPreview = (value) => {
    if (!preview) return false;
    try {
      const host = new URL(value, origin).hostname;
      return host === preview || host.endsWith(`.${preview}`);
    } catch {
      return false;
    }
  };

  for (const file of htmlFiles) {
    const doc = parseHtml(await readFile(join(directory, file), 'utf8'));
    const path = servedPath(file, html);
    const refresh = doc.meta.some((m) => m['http-equiv']?.toLowerCase() === 'refresh');
    const robots = metaContent(doc, 'robots') ?? '';
    const indexable = !/\b(noindex|none)\b/i.test(robots) && !refresh && file !== '404.html';
    pages.set(path, { file, indexable });
    const at = file;
    // Effective policy for this URL, including per-path overrides from security.extraRules.
    const policy = resolveRuleHeaders(headerRules, `${origin}${path}`)['Content-Security-Policy'];
    const csp = policy ? parseCsp(policy) : null;
    if (csp && doc.inlineScripts && !allowsInline(csp, 'script'))
      errors.push(
        `${at}: ${doc.inlineScripts} inline <script> element(s) blocked by the CSP (no 'unsafe-inline'); move them to bundled files`,
      );
    if (csp && doc.inlineStyles && !allowsInline(csp, 'style'))
      errors.push(
        `${at}: ${doc.inlineStyles} inline <style> element(s) blocked by the CSP (no 'unsafe-inline')`,
      );
    if (!doc.lang) errors.push(`${at}: <html> has no lang attribute (WCAG 3.1.1)`);
    if (!doc.title?.trim()) errors.push(`${at}: missing or empty <title>`);
    if (file === '404.html' || refresh) continue;
    if (!doc.meta.some((m) => m.name?.toLowerCase() === 'viewport'))
      warnings.push(`${at}: no <meta name="viewport">`);

    const canonicals = linksByRel(doc, 'canonical');
    if (canonicals.length > 1) errors.push(`${at}: ${canonicals.length} canonical links`);
    const canonical = canonicals[0]?.href;
    for (const [label, value] of [
      ['canonical', canonical],
      ['og:url', metaContent(doc, 'og:url')],
      ...linksByRel(doc, 'alternate')
        .filter((l) => l.hreflang)
        .map((l) => [`hreflang ${l.hreflang}`, l.href]),
    ]) {
      if (value && onPreview(value))
        errors.push(`${at}: ${label} points to the preview domain (${value})`);
    }
    for (const alt of linksByRel(doc, 'alternate').filter((l) => l.hreflang)) {
      try {
        if (new URL(alt.href ?? '').origin !== origin)
          errors.push(`${at}: hreflang ${alt.hreflang} is not an absolute URL on ${origin}`);
      } catch {
        errors.push(`${at}: hreflang ${alt.hreflang} is not an absolute URL on ${origin}`);
      }
    }
    for (const [i, raw] of doc.jsonLd.entries()) {
      try {
        const data = JSON.parse(raw);
        const items = Array.isArray(data) ? data : [data];
        if (items.some((item) => !String(item?.['@context'] ?? '').includes('schema.org')))
          warnings.push(`${at}: JSON-LD block ${i + 1} has no schema.org @context`);
      } catch {
        errors.push(`${at}: JSON-LD block ${i + 1} is not valid JSON`);
      }
    }
    if (!indexable) continue;
    if (doc.h1 === 0) warnings.push(`${at}: no <h1>`);
    if (doc.h1 > 1) warnings.push(`${at}: ${doc.h1} <h1> elements`);
    const description = metaContent(doc, 'description');
    if (!description?.trim()) errors.push(`${at}: missing meta description`);
    else pushTo(descriptions, description, file);
    if (doc.title) pushTo(titles, doc.title, file);
    if (site.seo.canonical) {
      if (!canonical) {
        errors.push(`${at}: missing canonical link`);
        continue;
      }
      let url;
      try {
        url = new URL(canonical);
      } catch {
        errors.push(`${at}: canonical "${canonical}" is not an absolute URL`);
        continue;
      }
      if (url.origin !== origin) errors.push(`${at}: canonical ${canonical} is not on ${origin}`);
      else if (url.pathname !== path) {
        const sameIgnoringSlash = url.pathname.replace(/\/$/, '') === path.replace(/\/$/, '');
        (sameIgnoringSlash ? errors : warnings).push(
          `${at}: canonical path ${url.pathname} differs from the served URL ${path}${sameIgnoringSlash ? ` (trailing slash disagrees with htmlHandling "${html}")` : ''}`,
        );
      }
      const og = metaContent(doc, 'og:url');
      if (og && og !== canonical)
        warnings.push(`${at}: og:url ${og} differs from canonical ${canonical}`);
      /** @type {{ canonical?: string }} */ (pages.get(path)).canonical = url.href;
    }
  }
  for (const [title, list] of titles)
    if (list.length > 1) warnings.push(`duplicate title "${title}" on ${list.join(', ')}`);
  for (const [, list] of descriptions)
    if (list.length > 1) warnings.push(`duplicate meta description on ${list.join(', ')}`);

  let robotsText;
  try {
    robotsText = await readFile(join(directory, 'robots.txt'), 'utf8');
  } catch {
    if (site.seo.robotsTxt) errors.push('robots.txt: missing');
  }
  /** @type {string[]} */
  let sitemapUrls = [];
  if (robotsText !== undefined) {
    const { groups, sitemaps } = robotsGroups(robotsText);
    if (!groups.length) errors.push('robots.txt: no User-agent group');
    const all = groups.filter((g) => g.agents.includes('*'));
    if (
      all.some(
        (g) =>
          g.rules.some(([k, v]) => k === 'disallow' && v === '/') &&
          !g.rules.some(([k, v]) => k === 'allow' && v === '/'),
      )
    )
      errors.push(
        'robots.txt: "User-agent: *" disallows the whole site on production. Previews are excluded by X-Robots-Tag, not robots.txt.',
      );
    for (const url of sitemaps) {
      try {
        if (new URL(url).origin !== origin)
          errors.push(`robots.txt: Sitemap ${url} is not on ${origin}`);
      } catch {
        errors.push(`robots.txt: Sitemap "${url}" must be an absolute URL`);
      }
    }
    sitemapUrls = sitemaps;
    if (site.seo.sitemap && !sitemaps.length) warnings.push('robots.txt: no Sitemap line');
  }

  if (site.seo.sitemap) {
    const local = sitemapUrls.flatMap((u) => {
      try {
        const url = new URL(u);
        return url.origin === origin ? [url.pathname.slice(1)] : [];
      } catch {
        return [];
      }
    });
    for (const file of local)
      if (!fileSet.has(file)) errors.push(`robots.txt: Sitemap /${file} is not in the build`);
    const declared = local.filter((f) => fileSet.has(f));
    const candidates = declared.length
      ? declared
      : ['sitemap-index.xml', 'sitemap.xml'].filter((f) => fileSet.has(f)).slice(0, 1);
    if (!candidates.length)
      errors.push(
        'sitemap: none found (looked for the robots.txt Sitemap URL, sitemap-index.xml and sitemap.xml)',
      );
    else {
      /** @type {string[]} */
      const urls = [];
      const queue = [...candidates];
      const visited = new Set();
      while (queue.length) {
        const file = /** @type {string} */ (queue.shift());
        if (visited.has(file)) continue;
        visited.add(file);
        const xml = await readFile(join(directory, file), 'utf8');
        if (!/<(urlset|sitemapindex)\b/.test(xml)) {
          errors.push(`${file}: not a sitemap (no <urlset> or <sitemapindex>)`);
          continue;
        }
        const isIndex = /<sitemapindex\b/.test(xml);
        for (const loc of locs(xml)) {
          if (isIndex) {
            const child = new URL(loc, origin);
            if (child.origin !== origin)
              errors.push(`${file}: child sitemap ${loc} is not on ${origin}`);
            else if (fileSet.has(child.pathname.slice(1))) queue.push(child.pathname.slice(1));
            else errors.push(`${file}: child sitemap ${loc} is not in the build`);
          } else urls.push(loc);
        }
      }
      for (const loc of urls) {
        let url;
        try {
          url = new URL(loc);
        } catch {
          errors.push(`sitemap: invalid URL ${loc}`);
          continue;
        }
        if (url.origin !== origin) {
          errors.push(`sitemap: ${loc} is not on ${origin}`);
          continue;
        }
        const page = pages.get(url.pathname);
        if (!page) {
          if (
            url.pathname.endsWith('/')
              ? pages.has(url.pathname.slice(0, -1))
              : pages.has(`${url.pathname}/`)
          )
            errors.push(`sitemap: ${loc} disagrees with the served URL's trailing slash`);
          else warnings.push(`sitemap: ${loc} does not correspond to a built HTML page`);
        } else if (!page.indexable)
          errors.push(`sitemap: ${loc} is not indexable (noindex, redirect or 404 page)`);
        else if (page.canonical && page.canonical !== url.href)
          warnings.push(`sitemap: ${loc} is not the canonical URL (${page.canonical})`);
      }
      const listed = new Set(
        urls.map((u) => {
          try {
            return new URL(u).pathname;
          } catch {
            return u;
          }
        }),
      );
      for (const [path, page] of pages)
        if (page.indexable && !listed.has(path))
          warnings.push(`sitemap: indexable page ${path} is not listed`);
    }
  }

  if (site.aio.llmsTxt) {
    if (!fileSet.has('llms.txt'))
      errors.push('llms.txt: aio.llmsTxt is true but dist/llms.txt is missing');
    else {
      const text = await readFile(join(directory, 'llms.txt'), 'utf8');
      if (!/^# \S/.test(text)) errors.push('llms.txt: must start with an H1 ("# Name")');
      for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (onPreview(m[1] ?? '')) errors.push(`llms.txt: link to the preview domain ${m[1]}`);
      }
    }
  }

  const indexablePages = [...pages.values()].filter((p) => p.indexable).length;
  return { htmlPages: htmlFiles.length, indexablePages, errors, warnings };
}
