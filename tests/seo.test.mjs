import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { generateLlmsTxt, generateRobotsTxt } from '../src/aio.mjs';
import { defineSite, mergeSettings } from '../src/config.mjs';
import { parseHtml } from '../src/html.mjs';
import { auditDist, servedPath } from '../src/seo.mjs';
import { buildPageMeta, canonicalUrl, jsonLdScript, organizationJsonLd } from '../src/seo-meta.mjs';

const base = {
  identity: {
    name: 'Example',
    productionUrl: 'https://example.com',
    previewDomain: 'dev.example.com',
  },
};
/** @param {Record<string, any>} [extra] */
const site = (extra = {}) => defineSite(mergeSettings(base, extra));
const dirs = [];
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

/** @param {Record<string, string>} files */
async function dist(files) {
  const dir = await mkdtemp(join(tmpdir(), 'ws-dist-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, name)), { recursive: true });
    await writeFile(join(dir, name), content);
  }
  return dir;
}

/** @param {{ title?: string, description?: string, canonical?: string, robots?: string, extra?: string, lang?: string }} p */
const html = ({
  title = 'Home',
  description = 'A description',
  canonical = 'https://example.com/',
  robots,
  extra = '',
  lang = 'en',
}) =>
  `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
  `<title>${title}</title>${description ? `<meta content="${description}" name="description">` : ''}` +
  `${canonical ? `<link href="${canonical}" rel="canonical">` : ''}${robots ? `<meta name="robots" content="${robots}">` : ''}${extra}</head><body><h1>${title}</h1></body></html>`;

const robots = 'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap-index.xml\n';
const sitemapIndex =
  '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://example.com/sitemap-0.xml</loc></sitemap></sitemapindex>';
/** @param {string[]} urls */
const urlset = (urls) =>
  `<?xml version="1.0"?><urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>`;

describe('servedPath', () => {
  it('mirrors Workers html_handling', () => {
    assert.equal(servedPath('index.html', 'drop-trailing-slash'), '/');
    assert.equal(servedPath('about.html', 'drop-trailing-slash'), '/about');
    assert.equal(servedPath('docs/index.html', 'drop-trailing-slash'), '/docs');
    assert.equal(servedPath('docs/index.html', 'auto-trailing-slash'), '/docs/');
    assert.equal(servedPath('about.html', 'auto-trailing-slash'), '/about');
    assert.equal(servedPath('about.html', 'force-trailing-slash'), '/about/');
    assert.equal(servedPath('about.html', 'none'), '/about.html');
  });
});

describe('auditDist', () => {
  it('passes a consistent build', async () => {
    const dir = await dist({
      'index.html': html({}),
      'about.html': html({
        title: 'About',
        description: 'About us',
        canonical: 'https://example.com/about',
      }),
      'search.html': html({
        title: 'Search',
        canonical: 'https://example.com/search',
        robots: 'noindex, follow',
      }),
      '404.html': '<!doctype html><html lang="en"><title>Not found</title></html>',
      'robots.txt': robots,
      'sitemap-index.xml': sitemapIndex,
      'sitemap-0.xml': urlset(['https://example.com/', 'https://example.com/about']),
    });
    const report = await auditDist(dir, site());
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
    assert.equal(report.indexablePages, 2);
  });
  it('reports inconsistent indexability signals', async () => {
    const dir = await dist({
      'index.html': html({ canonical: 'https://feature.dev.example.com/' }),
      'about.html': html({ title: 'Home', canonical: 'https://example.com/about/' }),
      'nolang.html': html({
        title: 'No lang',
        lang: '',
        canonical: 'https://example.com/nolang',
        description: '',
      }),
      'hidden.html': html({
        title: 'Hidden',
        robots: 'noindex',
        canonical: 'https://example.com/hidden',
      }),
      'robots.txt': 'User-agent: *\nDisallow: /\nSitemap: https://other.test/sitemap.xml\n',
      'sitemap.xml': urlset([
        'https://example.com/hidden',
        'https://other.test/x',
        'https://example.com/about/',
      ]),
    });
    const { errors, warnings } = await auditDist(dir, site());
    for (const expected of [
      'index.html: canonical points to the preview domain',
      'index.html: canonical https://feature.dev.example.com/ is not on https://example.com',
      'about.html: canonical path /about/ differs from the served URL /about (trailing slash',
      'nolang.html: <html> has no lang attribute',
      'nolang.html: missing meta description',
      'robots.txt: "User-agent: *" disallows the whole site',
      'robots.txt: Sitemap https://other.test/sitemap.xml is not on https://example.com',
      'sitemap: https://example.com/hidden is not indexable',
      'sitemap: https://other.test/x is not on https://example.com',
      'sitemap: https://example.com/about/ disagrees with the served URL',
    ])
      assert.ok(
        errors.some((e) => e.startsWith(expected)),
        `${expected}\n${errors.join('\n')}`,
      );
    assert.ok(warnings.some((w) => w.startsWith('duplicate title "Home"')));
  });
  it('requires robots.txt, a sitemap and llms.txt only when configured', async () => {
    const dir = await dist({ 'index.html': html({}) });
    const strict = await auditDist(dir, site({ aio: { llmsTxt: true } }));
    assert.ok(strict.errors.includes('robots.txt: missing'));
    assert.ok(strict.errors.some((e) => e.startsWith('sitemap: none found')));
    assert.ok(strict.errors.some((e) => e.startsWith('llms.txt: aio.llmsTxt is true')));
    const relaxed = await auditDist(dir, site({ seo: { sitemap: false, robotsTxt: false } }));
    assert.deepEqual(relaxed.errors, []);
  });
  it('validates JSON-LD, hreflang and inline code against the CSP', async () => {
    const extra =
      '<script type="application/ld+json">{not json}</script><link rel="alternate" hreflang="fr" href="/fr/">' +
      '<script>alert(1)</script><style>h1{}</style><script type="application/json">{"a":1}</script>';
    const dir = await dist({
      'index.html': html({ extra }),
      'robots.txt': robots,
      'sitemap-index.xml': sitemapIndex,
      'sitemap-0.xml': urlset(['https://example.com/']),
    });
    const { errors } = await auditDist(dir, site());
    assert.ok(errors.includes('index.html: JSON-LD block 1 is not valid JSON'));
    assert.ok(
      errors.includes('index.html: hreflang fr is not an absolute URL on https://example.com'),
    );
    assert.ok(
      errors.some((e) =>
        e.startsWith('index.html: 1 inline <script> element(s) blocked by the CSP'),
      ),
    );
    assert.ok(
      errors.some((e) =>
        e.startsWith('index.html: 1 inline <style> element(s) blocked by the CSP'),
      ),
    );
    const permissive = await auditDist(
      dir,
      site({
        security: {
          csp: {
            'script-src': ["'self'", "'unsafe-inline'"],
            'style-src': ["'self'", "'unsafe-inline'"],
          },
        },
      }),
    );
    assert.ok(!permissive.errors.some((e) => e.includes('inline')));
  });
  it('fails clearly on an empty build', async () => {
    const dir = await dist({ 'robots.txt': robots });
    assert.ok((await auditDist(dir, site())).errors.some((e) => e.includes('no HTML files found')));
  });
});

describe('html parsing', () => {
  it('handles attribute order, quoting, entities and ignores script contents', () => {
    const doc = parseHtml(
      `<html data-x lang=fr><meta content='a &amp; b' name=description><script>"<h1>"</script><!-- <h1> --><h1 class="t">x</h1>`,
    );
    assert.equal(doc.lang, 'fr');
    assert.equal(doc.meta[0]?.content, 'a & b');
    assert.equal(doc.h1, 1);
  });
});

describe('page metadata', () => {
  it('builds canonical URLs that follow the trailing-slash policy and Workers html_handling', () => {
    assert.equal(canonicalUrl(site(), '/about/'), 'https://example.com/about');
    assert.equal(canonicalUrl(site(), '/about.html'), 'https://example.com/about');
    assert.equal(canonicalUrl(site(), '/index.html'), 'https://example.com/');
    assert.equal(canonicalUrl(site(), '/docs/index.html?q=1#x'), 'https://example.com/docs');
    const always = site({
      astro: { buildFormat: 'directory', trailingSlash: 'always' },
      cloudflare: { htmlHandling: 'auto-trailing-slash' },
    });
    assert.equal(canonicalUrl(always, '/about'), 'https://example.com/about/');
    assert.equal(canonicalUrl(always, '/file.pdf'), 'https://example.com/file.pdf');
    assert.throws(() => canonicalUrl(site(), 'https://evil.test/'), /site-relative/);
    assert.throws(() => canonicalUrl(site(), '//evil.test/'), /site-relative/);
  });
  it('buildPageMeta requires real content and HTTPS images', () => {
    const meta = buildPageMeta({
      site: site(),
      path: '/about.html',
      title: 'About',
      description: 'About us',
      image: '/og.png',
      locale: 'fr-CH',
    });
    assert.equal(meta.canonical, 'https://example.com/about');
    assert.equal(meta.og.image, 'https://example.com/og.png');
    assert.equal(meta.og.locale, 'fr_CH');
    assert.throws(
      () => buildPageMeta({ site: site(), title: '', description: 'x' }),
      /title and description required/,
    );
    assert.throws(
      () =>
        buildPageMeta({
          productionUrl: 'https://example.com',
          title: 'a',
          description: 'b',
          image: 'http://cdn.test/x.png',
        }),
      /HTTPS/,
    );
  });
  it('organizationJsonLd and jsonLdScript', () => {
    const org = organizationJsonLd({
      name: 'Org',
      url: 'https://example.com',
      id: '/#org',
      logo: '/logo.png',
      sameAs: ['https://social.test/org'],
    });
    assert.equal(org['@id'], 'https://example.com/#org');
    assert.throws(
      () =>
        organizationJsonLd({ name: 'Org', url: 'https://example.com', sameAs: ['http://x.test'] }),
      /HTTPS/,
    );
    assert.equal(jsonLdScript({ a: '</script><script>' }), '{"a":"\\u003c/script>\\u003cscript>"}');
  });
});

describe('llms.txt and robots.txt', () => {
  it('generates llms.txt from explicit facts only', () => {
    const text = generateLlmsTxt({
      name: 'Example',
      summary: 'Factual summary.',
      productionUrl: 'https://example.com',
      pages: [{ label: 'About [us]', path: '/about', description: 'Who we are' }],
      sections: [{ title: 'Optional', links: [{ label: 'Sitemap', path: '/sitemap-index.xml' }] }],
    });
    assert.equal(
      text,
      '# Example\n\n> Factual summary.\n\n## Pages\n\n- [About \\[us\\]](https://example.com/about): Who we are\n\n## Optional\n\n- [Sitemap](https://example.com/sitemap-index.xml)\n',
    );
    assert.throws(
      () =>
        generateLlmsTxt({
          name: 'X',
          summary: 'Y',
          productionUrl: 'https://example.com',
          pages: [{ label: 'Ext', path: 'https://other.test/' }],
        }),
      /External link/,
    );
    assert.throws(
      () => generateLlmsTxt({ name: 'X', summary: 'a\nb', productionUrl: 'https://example.com' }),
      /single line/,
    );
  });
  it('generates robots.txt with explicit crawler policies', () => {
    assert.equal(
      generateRobotsTxt({ productionUrl: 'https://example.com' }),
      'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap-index.xml\n',
    );
    const text = generateRobotsTxt({
      productionUrl: 'https://example.com',
      sitemapPath: '/sitemap.xml',
      groups: [
        { userAgents: ['*'], contentSignal: 'search=yes, ai-input=yes, ai-train=no' },
        { userAgents: ['GPTBot', 'CCBot'], disallow: ['/'], comment: 'Training-only crawlers' },
      ],
    });
    assert.match(
      text,
      /User-agent: \*\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: \//,
    );
    assert.match(
      text,
      /# Training-only crawlers\nUser-agent: GPTBot\nUser-agent: CCBot\nDisallow: \//,
    );
    assert.throws(
      () =>
        generateRobotsTxt({
          productionUrl: 'https://example.com',
          groups: [{ userAgents: ['*'], disallow: ['/'] }],
        }),
      /must not disallow/,
    );
    assert.throws(
      () =>
        generateRobotsTxt({
          productionUrl: 'https://example.com',
          groups: [{ userAgents: ['GPTBot'] }],
        }),
      /User-agent: \*/,
    );
  });
});

describe('review regressions', () => {
  it('follows every robots.txt sitemap and reports missing ones', async () => {
    const dir = await dist({
      'index.html': html({}),
      'about.html': html({
        title: 'About',
        description: 'About us',
        canonical: 'https://example.com/about',
      }),
      'robots.txt':
        'User-agent: *\nAllow: /\nSitemap: https://example.com/a.xml\nSitemap: https://example.com/b.xml\nSitemap: https://example.com/missing.xml\n',
      'a.xml': urlset(['https://example.com/']),
      'b.xml': urlset(['https://example.com/about']),
    });
    const { errors, warnings } = await auditDist(dir, site());
    assert.deepEqual(errors, ['robots.txt: Sitemap /missing.xml is not in the build']);
    assert.deepEqual(warnings, []);
  });
});
