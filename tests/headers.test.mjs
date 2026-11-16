import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { defineSite, mergeSettings } from '../src/config.mjs';
import { allowsInline, cspAllows, parseCsp, serializeCsp, sourceAllows } from '../src/csp.mjs';
import {
  buildHeaderRules,
  compilePattern,
  GENERATED_MARKER,
  generateHeaders,
  MAX_RULES,
  parseHeadersFile,
  resolveHeaders,
  serializeRulesJson,
} from '../src/headers.mjs';
import { applyHeaders, resolveRuleHeaders } from '../src/headers-runtime.mjs';

const base = {
  identity: {
    name: 'Example',
    productionUrl: 'https://www.example.com',
    previewDomain: 'dev.example.com',
  },
};
/** @param {Record<string, any>} [extra] */
const site = (extra = {}) => defineSite(mergeSettings(base, extra));

describe('csp', () => {
  it('serialises directives deterministically and round-trips', () => {
    const text = serializeCsp({
      'default-src': ["'self'", "'self'"],
      'object-src': ["'none'"],
      'upgrade-insecure-requests': [],
      'img-src': null,
    });
    assert.equal(text, "default-src 'self'; object-src 'none'; upgrade-insecure-requests");
    assert.deepEqual(parseCsp(text), {
      'default-src': ["'self'"],
      'object-src': ["'none'"],
      'upgrade-insecure-requests': [],
    });
  });
  it('matches sources like browsers do (self, wildcards, schemes, paths, fallbacks)', () => {
    const self = 'https://example.com';
    assert.ok(sourceAllows("'self'", new URL('https://example.com/x'), self));
    assert.ok(!sourceAllows("'self'", new URL('https://cdn.example.com/x'), self));
    assert.ok(sourceAllows('https://*.example.com', new URL('https://a.b.example.com/'), self));
    assert.ok(!sourceAllows('https://*.example.com', new URL('https://example.com/'), self));
    assert.ok(sourceAllows('https:', new URL('https://any.test/'), self));
    assert.ok(sourceAllows('cdn.test/lib/', new URL('https://cdn.test/lib/x.js'), self));
    assert.ok(!sourceAllows('cdn.test/lib/', new URL('https://cdn.test/other.js'), self));
    assert.ok(!sourceAllows('https://cdn.test:8443', new URL('https://cdn.test/'), self));
    const policy = { 'default-src': ["'self'"], 'script-src': ["'self'", 'https://js.test'] };
    assert.ok(cspAllows(policy, 'script-src-elem', 'https://js.test/a.js', self));
    assert.ok(!cspAllows(policy, 'connect-src', 'https://js.test/api', self));
    assert.ok(cspAllows({}, 'connect-src', 'https://any.test', self));
  });
  it('knows when inline code is allowed', () => {
    assert.equal(allowsInline({ 'default-src': ["'self'"] }, 'script'), false);
    assert.equal(allowsInline({ 'style-src': ["'self'", "'unsafe-inline'"] }, 'style'), true);
    assert.equal(
      allowsInline({ 'script-src': ["'unsafe-inline'", "'nonce-abc'"] }, 'script'),
      false,
    );
    assert.equal(allowsInline({}, 'script'), true);
  });
});

describe('generateHeaders', () => {
  it('emits secure defaults, immutable assets and preview noindex', () => {
    const text = generateHeaders(site());
    assert.ok(text.startsWith(GENERATED_MARKER));
    assert.match(text, /^\/\*\n {2}X-Content-Type-Options: nosniff$/m);
    assert.match(
      text,
      /Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'/,
    );
    assert.match(text, /^\/_astro\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
    assert.match(text, /^https:\/\/:preview\.dev\.example\.com\/\*\n {2}X-Robots-Tag: noindex$/m);
    assert.doesNotMatch(text, /Strict-Transport-Security/);
    assert.equal(generateHeaders(site()), text, 'deterministic');
  });
  it('never sends noindex to production, only to preview hosts', () => {
    const s = site({
      security: {
        extraRules: [{ path: '/downloads/*', headers: { 'Cache-Control': 'public, max-age=60' } }],
      },
    });
    for (const url of [
      'https://www.example.com/',
      'https://www.example.com/a/b',
      'https://www.example.com/downloads/x.pdf',
      'https://example.com/',
    ])
      assert.equal(resolveHeaders(s, url)['X-Robots-Tag'], undefined, url);
    for (const url of [
      'https://feature-x.dev.example.com/',
      'https://abc123-feature.dev.example.com/page',
      'https://dev.example.com/',
    ])
      assert.equal(resolveHeaders(s, url)['X-Robots-Tag'], 'noindex', url);
    // The :preview placeholder never spans a dot, so a production host that merely contains
    // the preview domain as a suffix of another label is not matched.
    assert.equal(resolveHeaders(s, 'https://a.b.dev.example.com/')['X-Robots-Tag'], undefined);
  });
  it('omits preview rules when disabled or without a preview domain', () => {
    assert.doesNotMatch(
      generateHeaders(site({ security: { previewNoindex: false } })),
      /X-Robots-Tag/,
    );
    assert.doesNotMatch(
      generateHeaders(defineSite({ identity: { name: 'X', productionUrl: 'https://x.test' } })),
      /X-Robots-Tag/,
    );
  });
  it('rejects noindex rules that could reach production', () => {
    assert.throws(
      () =>
        generateHeaders(
          site({
            security: {
              extraRules: [{ path: '/private/*', headers: { 'X-Robots-Tag': 'noindex' } }],
            },
          }),
        ),
      /allowNoindex/,
    );
    assert.equal(
      resolveHeaders(
        site({
          security: {
            extraRules: [
              { path: '/search', headers: { 'X-Robots-Tag': 'noindex' }, allowNoindex: true },
            ],
          },
        }),
        'https://www.example.com/search',
      )['X-Robots-Tag'],
      'noindex',
    );
    assert.throws(
      () =>
        generateHeaders(
          site({
            security: {
              extraRules: [
                {
                  path: 'https://www.example.com/*',
                  headers: { 'X-Robots-Tag': 'noindex' },
                  allowNoindex: true,
                },
              ],
            },
          }),
        ),
      /whole production site/,
    );
    assert.throws(
      () =>
        generateHeaders(
          site({ security: { extraRules: [{ path: '/*', headers: { 'X-Test': '1' } }] } }),
        ),
      /use security.headers/,
    );
  });
  it('replaces (detaches) inherited headers instead of letting Cloudflare join them', () => {
    const s = site({
      security: {
        extraRules: [
          {
            path: '/embed/*',
            headers: { 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': null },
          },
        ],
      },
    });
    const text = generateHeaders(s);
    assert.match(
      text,
      /^\/embed\/\*\n {2}! X-Frame-Options\n {2}! Referrer-Policy\n {2}X-Frame-Options: SAMEORIGIN$/m,
    );
    const headers = resolveHeaders(s, 'https://www.example.com/embed/a');
    assert.equal(headers['X-Frame-Options'], 'SAMEORIGIN');
    assert.equal(headers['Referrer-Policy'], undefined);
    assert.equal(resolveHeaders(s, 'https://www.example.com/')['X-Frame-Options'], 'DENY');
  });
  it('derives per-path CSP from the global policy with merge operators', () => {
    const s = site({
      security: {
        extraRules: [
          {
            path: '/map',
            csp: {
              'frame-src': ['https://maps.test'],
              'img-src': { $append: ['https://tiles.test'] },
            },
          },
        ],
      },
    });
    const csp = parseCsp(
      resolveHeaders(s, 'https://www.example.com/map')['Content-Security-Policy'] ?? '',
    );
    assert.deepEqual(csp['frame-src'], ['https://maps.test']);
    assert.deepEqual(csp['img-src'], ['https://tiles.test']);
    assert.deepEqual(csp['default-src'], ["'self'"]);
    assert.equal(
      parseCsp(resolveHeaders(s, 'https://www.example.com/')['Content-Security-Policy'] ?? '')[
        'frame-src'
      ],
      undefined,
    );
    const removed = site({ security: { extraRules: [{ path: '/legacy', csp: null }] } });
    assert.equal(
      resolveHeaders(removed, 'https://www.example.com/legacy')['Content-Security-Policy'],
      undefined,
    );
  });
  it('supports report-only CSP and HSTS', () => {
    const headers = resolveHeaders(
      site({ security: { cspReportOnly: true, hsts: 'max-age=31536000' } }),
      'https://www.example.com/',
    );
    assert.equal(headers['Content-Security-Policy'], undefined);
    assert.match(headers['Content-Security-Policy-Report-Only'] ?? '', /default-src 'self'/);
    assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000');
  });
  it('rejects overlapping rules that would concatenate values', () => {
    const rules = [
      { path: '/docs/*', headers: { 'Cache-Control': 'public, max-age=60' } },
      { path: '/docs/manual.pdf', headers: { 'Cache-Control': 'public, max-age=3600' } },
    ];
    assert.throws(
      () => generateHeaders(site({ security: { extraRules: rules } })),
      /both match some URLs and set Cache-Control/,
    );
    const disjoint = [rules[0], { path: '/files/*', headers: { 'Cache-Control': 'no-store' } }];
    assert.doesNotThrow(() => generateHeaders(site({ security: { extraRules: disjoint } })));
    assert.throws(
      () =>
        generateHeaders(
          site({
            security: {
              extraRules: [{ path: '/_astro/chunk.js', headers: { 'Cache-Control': 'no-store' } }],
            },
          }),
        ),
      /security.immutableAstroAssets/,
    );
  });
  it('enforces Cloudflare limits and pattern syntax', () => {
    const many = Array.from({ length: MAX_RULES }, (_, i) => ({
      path: `/p${i}`,
      headers: { 'X-N': String(i) },
    }));
    assert.throws(
      () => generateHeaders(site({ security: { extraRules: many } })),
      /at most 100 _headers rules/,
    );
    assert.throws(
      () =>
        generateHeaders(
          site({
            security: { extraRules: [{ path: '/a', headers: { 'X-Long': 'x'.repeat(2000) } }] },
          }),
        ),
      /2000-character limit/,
    );
    for (const path of [
      'relative',
      '/a/*/b/*',
      'http://x.test/*',
      'https://x.test:8443/*',
      '/:id/:id',
    ])
      assert.throws(
        () =>
          generateHeaders(site({ security: { extraRules: [{ path, headers: { 'X-A': '1' } }] } })),
        /Invalid _headers pattern/,
        path,
      );
  });
});

describe('pattern matching and parsing', () => {
  it('follows Cloudflare splat and placeholder rules', () => {
    assert.ok(compilePattern('/blog/*')('https://x.test/blog/a/b'));
    assert.ok(!compilePattern('/blog/*')('https://x.test/blogs'));
    assert.ok(compilePattern('/users/:id')('https://x.test/users/42'));
    assert.ok(!compilePattern('/users/:id')('https://x.test/users/42/edit'));
    assert.ok(compilePattern('https://:sub.example.com/*')('https://a.example.com/x'));
    assert.ok(!compilePattern('https://:sub.example.com/*')('https://a.b.example.com/x'));
    assert.ok(compilePattern('https://example.com/*')('https://example.com/'));
  });
  it('parses existing _headers files, including detach lines', () => {
    const rules = parseHeadersFile('# c\n/*\n  A: 1\n\n/x\n  ! A\n  A: 2\n');
    assert.deepEqual(
      rules.map((r) => [r.pattern, r.detach, r.set]),
      [
        ['/*', [], [['A', '1']]],
        ['/x', ['A'], [['A', '2']]],
      ],
    );
    assert.deepEqual(resolveHeaders(rules, 'https://t.test/x'), { A: '2' });
    assert.deepEqual(
      resolveHeaders(parseHeadersFile('/*\n  A: 1\n/x\n  A: 2\n'), 'https://t.test/x'),
      { A: '1, 2' },
    );
    assert.throws(() => parseHeadersFile('  A: 1\n'), /before any URL pattern/);
  });
  it('buildHeaderRules exposes rules for Worker responses', () => {
    const rules = buildHeaderRules(site());
    assert.equal(rules[0]?.pattern, '/*');
  });
});

describe('headers runtime (Worker side)', () => {
  const url = 'https://www.example.com/page';
  it('imports nothing, so the Worker bundle holds no configuration or site data', async () => {
    const source = await readFile(new URL('../src/headers-runtime.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /^\s*(import|export)\b[^\n]*\bfrom\b/m);
  });
  it('applies the same headers from JSON rules as from the site, without the site', () => {
    const s = site();
    const rules = JSON.parse(serializeRulesJson(buildHeaderRules(s)));
    assert.equal(
      rules.some((/** @type {object} */ r) => 'source' in r),
      false,
    );
    assert.deepEqual(resolveRuleHeaders(rules, url), resolveHeaders(s, url));
    const response = applyHeaders(new Response('Gone', { status: 410 }), rules, url);
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('X-Robots-Tag'), null, 'production stays indexable');
    const preview = applyHeaders(new Response('x'), rules, 'https://a.dev.example.com/');
    assert.equal(preview.headers.get('X-Robots-Tag'), 'noindex');
  });
  it('compiles each pattern once', () => {
    assert.equal(compilePattern('/cache-me/*'), compilePattern('/cache-me/*'));
  });
});

describe('review regressions', () => {
  it('detects overlaps with /_astro/* even when no site-wide header remains', () => {
    const s = site({
      security: {
        headers: {
          'X-Content-Type-Options': null,
          'Referrer-Policy': null,
          'Permissions-Policy': null,
          'X-Frame-Options': null,
        },
        csp: null,
        extraRules: [{ path: '/_astro/legacy.js', headers: { 'Cache-Control': 'no-store' } }],
      },
    });
    assert.throws(() => generateHeaders(s), /both match some URLs and set Cache-Control/);
  });
  it('allows a deliberate noindex on a file type with allowNoindex', () => {
    const s = site({
      security: {
        extraRules: [
          { path: '/*.pdf', headers: { 'X-Robots-Tag': 'noindex' }, allowNoindex: true },
        ],
      },
    });
    assert.equal(resolveHeaders(s, 'https://www.example.com/a/b.pdf')['X-Robots-Tag'], 'noindex');
    assert.equal(resolveHeaders(s, 'https://www.example.com/')['X-Robots-Tag'], undefined);
  });
});
