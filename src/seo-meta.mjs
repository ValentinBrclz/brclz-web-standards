/**
 * Pure helpers for page metadata and JSON-LD. They never invent values: every field comes from
 * the caller, and URLs are forced onto the production origin with the site's trailing-slash
 * policy so canonical URLs match what Cloudflare serves.
 */

/**
 * Canonical URL of `path` on the production origin.
 * @param {{ identity: { productionUrl: string | null }, astro?: { trailingSlash?: string }, cloudflare?: { htmlHandling?: string } } | string} siteOrOrigin
 *   a resolved site (applies `astro.trailingSlash` and drops `.html`, as Workers Static Assets
 *   does) or a bare production origin (path kept as is)
 * @param {string} [path]
 */
export function canonicalUrl(siteOrOrigin, path = '/') {
  const origin = new URL(
    typeof siteOrOrigin === 'string'
      ? siteOrOrigin
      : /** @type {string} */ (siteOrOrigin.identity.productionUrl),
  );
  if (origin.protocol !== 'https:') throw new Error('HTTPS production origin required');
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(path))
    throw new Error(`Canonical path must be site-relative: ${path}`);
  const url = new URL(path, origin);
  url.hash = '';
  url.search = '';
  const slash = typeof siteOrOrigin === 'string' ? 'ignore' : siteOrOrigin.astro?.trailingSlash;
  // With build.format "file", Astro.url.pathname is "/about.html" during the build; Workers
  // Static Assets serves that page at "/about" (and "/index.html" at "/").
  if (typeof siteOrOrigin !== 'string' && siteOrOrigin.cloudflare?.htmlHandling !== 'none')
    url.pathname = url.pathname.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
  const last = url.pathname.split('/').pop() ?? '';
  if (url.pathname !== '/' && !last.includes('.')) {
    if (slash === 'never') url.pathname = url.pathname.replace(/\/+$/, '');
    if (slash === 'always' && !url.pathname.endsWith('/')) url.pathname += '/';
  }
  return url.toString();
}

/**
 * Title, description, canonical URL, robots and Open Graph fields for a page. Nothing is
 * defaulted from the content: `title` and `description` are required.
 * @param {{ productionUrl?: string, site?: Parameters<typeof canonicalUrl>[0], path?: string, title: string, description: string, robots?: string, image?: string, type?: string, locale?: string }} options
 */
export function buildPageMeta({
  productionUrl,
  site,
  path = '/',
  title,
  description,
  robots = 'index, follow',
  image,
  type = 'website',
  locale,
}) {
  if (!title?.trim() || !description?.trim()) throw new Error('title and description required');
  const base = site ?? productionUrl;
  if (!base) throw new Error('site or productionUrl required');
  const canonical = canonicalUrl(base, path);
  const origin = new URL(canonical).origin;
  /** @type {{ title: string, description: string, canonical: string, robots: string, og: Record<string, string> }} */
  const result = {
    title,
    description,
    canonical,
    robots,
    og: { type, title, description, url: canonical },
  };
  if (locale) result.og.locale = locale.replace('-', '_');
  if (image) {
    const url = new URL(image, origin);
    if (url.protocol !== 'https:') throw new Error('og:image must use HTTPS');
    result.og.image = url.toString();
  }
  return result;
}

/** @param {string} value @param {string} field */
function httpsUrl(value, field) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${field} must use HTTPS`);
  return url.toString();
}

/**
 * schema.org Organization built only from explicit facts.
 * @param {{ name: string, url: string, id?: string, description?: string, logo?: string, sameAs?: string[] }} facts
 */
export function organizationJsonLd({ name, url, id, description, logo, sameAs = [] }) {
  if (!name?.trim() || !url) throw new Error('Organization name and url are required');
  const origin = httpsUrl(url, 'url');
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    ...(id ? { '@id': new URL(id, origin).toString() } : {}),
    name,
    url: origin,
    ...(description ? { description } : {}),
    ...(logo ? { logo: new URL(logo, origin).toString() } : {}),
    ...(sameAs.length ? { sameAs: sameAs.map((s, i) => httpsUrl(s, `sameAs[${i}]`)) } : {}),
  };
}

/**
 * Serialises JSON-LD for `<script type="application/ld+json" set:html={...}>`, escaping "<"
 * so the payload can never close the script element.
 * @param {unknown} data
 */
export function jsonLdScript(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}
