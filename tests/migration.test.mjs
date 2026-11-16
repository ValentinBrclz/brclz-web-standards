// Migration from a hand-written public/_headers: examples/multilingual.site.config.mjs must
// reproduce tests/fixtures/handwritten/_headers URL by URL, and the hand-written _redirects and
// wrangler.toml must pass the checks. The same approach proves any real migration.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import example from '../examples/multilingual.site.config.mjs';
import { defineSite } from '../src/config.mjs';
import { parseCsp } from '../src/csp.mjs';
import { parseHeadersFile, resolveHeaders } from '../src/headers.mjs';
import { checkRedirects } from '../src/redirects.mjs';
import { checkWranglerConfig, readWranglerConfig } from '../src/wrangler.mjs';

const fixture = (name) => new URL(`./fixtures/handwritten/${name}`, import.meta.url);
const origin = 'https://www.example.org';
const site = defineSite(example);

/** Lower-case header names; CSP compared as a set of directives, independent of order. */
function normalise(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => {
      const lower = name.toLowerCase();
      if (lower !== 'content-security-policy') return [lower, value];
      const csp = Object.entries(parseCsp(value)).map(([k, v]) => [k, [...(v ?? [])].sort()]);
      return [lower, Object.fromEntries(csp.sort(([a], [b]) => a.localeCompare(b)))];
    }),
  );
}

describe('migration from a hand-written _headers', async () => {
  const handwritten = parseHeadersFile(await readFile(fixture('_headers'), 'utf8'));
  const urls = [
    `${origin}/`,
    `${origin}/fr/`,
    `${origin}/fr/reserver/`,
    `${origin}/en/book/`,
    `${origin}/llms.txt`,
    `${origin}/documents/terms.pdf`,
    `${origin}/pagefind/index/fr_abc.pf_index`,
    `${origin}/_astro/app.abc.js`,
    'https://feature.dev.example.org/fr/',
    'https://dev.example.org/',
  ];

  it('generated headers equal the hand-written file for every sampled URL', () => {
    for (const url of urls)
      assert.deepEqual(
        normalise(resolveHeaders(site, url)),
        normalise(resolveHeaders(handwritten, url)),
        url,
      );
  });
  it('Preview responses carry noindex and production responses do not', () => {
    assert.match(
      resolveHeaders(site, 'https://feature.dev.example.org/')['X-Robots-Tag'] ?? '',
      /noindex/,
    );
    for (const url of urls.filter((u) => u.startsWith(origin)))
      assert.equal(resolveHeaders(site, url)['X-Robots-Tag'], undefined, url);
  });
  it('the hand-written _redirects file is valid for the site', async () => {
    const report = checkRedirects(await readFile(fixture('_redirects'), 'utf8'), {
      trailingSlash: site.astro.trailingSlash,
      productionUrl: origin,
    });
    assert.equal(report.redirects.length, 8);
    assert.deepEqual(report.warnings, []);
  });
  it('the hand-written wrangler.toml agrees with the site configuration', async () => {
    const config = await readWranglerConfig(fileURLToPath(fixture('wrangler.toml')));
    assert.deepEqual(checkWranglerConfig(site, config, { projectDir: '/p', configDir: '/p' }), {
      errors: [],
      warnings: [],
    });
  });
});
