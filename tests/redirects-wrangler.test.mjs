import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import Ajv from 'ajv';
import { defineSite, mergeSettings } from '../src/config.mjs';
import { checkRedirects, validateRedirects } from '../src/redirects.mjs';
import {
  checkWranglerConfig,
  generateStaticWrangler,
  parseJsonc,
  readWranglerConfig,
} from '../src/wrangler.mjs';

const schema = JSON.parse(
  await readFile(new URL('../node_modules/wrangler/config-schema.json', import.meta.url), 'utf8'),
);
const ajv = new Ajv({ allErrors: true, strict: false });
const validateWrangler = ajv.compile(schema);

const base = {
  identity: {
    name: 'Example',
    productionUrl: 'https://example.com',
    previewDomain: 'dev.example.com',
  },
  cloudflare: { workerName: 'example-site', compatibilityDate: '2026-10-26' },
};
/** @param {Record<string, any>} [extra] */
const site = (extra = {}) => defineSite(mergeSettings(base, extra));

describe('_redirects', () => {
  it('accepts valid static, dynamic, external and proxy rules', () => {
    const report = checkRedirects(
      [
        '# comment',
        '/old /new 301',
        '/a /b',
        '/ext https://example.org/x 302',
        '/proxy /real 200',
        '/blog/* /posts/:splat 301',
        '/u/:id /users/:id 308',
      ].join('\n'),
    );
    assert.equal(report.static, 4);
    assert.equal(report.dynamic, 2);
    assert.equal(
      report.redirects.find((r) => r.source === '/a')?.status,
      302,
      'Cloudflare defaults to 302',
    );
    assert.equal(validateRedirects('/x /y\n'), 1);
  });
  it('reports every error with line numbers', () => {
    const content = [
      '/a /b 404',
      'a /b',
      '/self /self',
      '/dup /x',
      '/dup /y',
      '/q?x=1 /y',
      '/s/* /t/:id',
      '/p/* https://ext.test/ 200',
      '/x',
    ].join('\n');
    try {
      checkRedirects(content);
      assert.fail('expected an error');
    } catch (error) {
      const message = /** @type {Error} */ (error).message;
      for (const expected of [
        'line 1: unsupported status 404',
        'line 2: source must be a path',
        'line 3: redirects to itself',
        'line 5: duplicate source /dup (line 4 wins',
        'line 6: query strings cannot be matched',
        'line 7: destination uses unknown placeholder :id',
        'line 8: proxying (200) is only supported for paths on the same site',
        'line 9: expected "source destination [status]"',
      ])
        assert.ok(message.includes(expected), `${expected}\n${message}`);
    }
  });
  it('detects cycles and warns about chains, ordering and trailing slashes', () => {
    assert.throws(
      () => checkRedirects('/a /b\n/b /c\n/c /a\n'),
      /redirect cycle \/a -> \/b -> \/c -> \/a/,
    );
    const report = checkRedirects('/a /b 301\n/b /c 301\n/d/* /e 301\n/f /g/ 301\n', {
      trailingSlash: 'never',
    });
    assert.ok(report.warnings.some((w) => w.includes('/a needs 2 hops')));
    assert.ok(report.warnings.some((w) => w.includes('static redirect after a dynamic one')));
    assert.ok(
      report.warnings.some((w) => w.includes('/g/ ends with "/" but trailingSlash is "never"')),
    );
    const always = checkRedirects('/a /b 301\n/c /file.pdf 301\n', { trailingSlash: 'always' });
    assert.equal(always.warnings.length, 1);
  });
  it('enforces Cloudflare limits', () => {
    const many = Array.from({ length: 2001 }, (_, i) => `/s${i} /t 301`).join('\n');
    assert.throws(() => checkRedirects(many), /2001 static redirects exceed/);
    const dynamic = Array.from({ length: 101 }, (_, i) => `/d${i}/* /t 301`).join('\n');
    assert.throws(() => checkRedirects(dynamic), /101 dynamic redirects exceed/);
    assert.throws(() => checkRedirects(`/a /${'x'.repeat(1000)}`), /exceeds 1000 characters/);
  });
});

describe('generateStaticWrangler', () => {
  it('produces a configuration valid against the installed Wrangler JSON schema', () => {
    const config = generateStaticWrangler(site(), {
      projectDir: '/project',
      configDir: '/project',
    });
    assert.ok(validateWrangler(config), JSON.stringify(validateWrangler.errors));
    assert.deepEqual(config.routes, [
      { pattern: 'example.com', custom_domain: true },
      { pattern: 'dev.example.com', custom_domain: true, previews_enabled: true, enabled: false },
    ]);
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.equal(config.assets.directory, './dist');
  });
  it('makes paths relative to the output file', () => {
    const config = generateStaticWrangler(site(), {
      projectDir: '/project',
      configDir: '/project/.generated',
    });
    assert.equal(config.assets.directory, '../dist');
    assert.equal(config.$schema, '../node_modules/wrangler/config-schema.json');
  });
  it('requires an explicit name and compatibility date', () => {
    assert.throws(
      () => generateStaticWrangler(site({ cloudflare: { workerName: null } })),
      /workerName is required/,
    );
    assert.throws(
      () => generateStaticWrangler(site({ cloudflare: { compatibilityDate: null } })),
      /compatibilityDate is required/,
    );
  });
  it('is accepted by `wrangler deploy --dry-run`', { timeout: 120_000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ws-wrangler-'));
    try {
      await mkdir(join(dir, 'dist'));
      await writeFile(join(dir, 'dist/index.html'), '<!doctype html><title>x</title>');
      await mkdir(join(dir, '.generated'));
      const config = generateStaticWrangler(site(), {
        projectDir: dir,
        configDir: join(dir, '.generated'),
      });
      config.$schema = join(process.cwd(), 'node_modules/wrangler/config-schema.json');
      await writeFile(join(dir, '.generated/wrangler.json'), JSON.stringify(config));
      const out = execFileSync(
        process.execPath,
        [
          join(process.cwd(), 'node_modules/wrangler/bin/wrangler.js'),
          'deploy',
          '--dry-run',
          '--config',
          '.generated/wrangler.json',
          '--outdir',
          'out',
        ],
        {
          cwd: dir,
          encoding: 'utf8',
          env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      assert.match(out, /dry-run: exiting now/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('checkWranglerConfig', () => {
  const good = {
    name: 'example-site',
    compatibility_date: '2026-10-26',
    workers_dev: false,
    preview_urls: false,
    previews: {},
    assets: {
      directory: './dist',
      html_handling: 'drop-trailing-slash',
      not_found_handling: '404-page',
    },
    routes: [
      { pattern: 'example.com', custom_domain: true },
      { pattern: 'dev.example.com', custom_domain: true, previews_enabled: true, enabled: false },
    ],
  };
  const opts = { projectDir: '/p', configDir: '/p' };
  it('accepts a matching configuration', () => {
    assert.deepEqual(checkWranglerConfig(site(), good, opts), { errors: [], warnings: [] });
  });
  it('reports drift without modifying anything', () => {
    const bad = {
      ...good,
      name: 'other',
      workers_dev: true,
      assets: { directory: './build' },
      routes: [{ pattern: 'dev.example.com', custom_domain: true, previews_enabled: true }],
    };
    const { errors, warnings } = checkWranglerConfig(site(), bad, opts);
    for (const expected of [
      'name is "other"',
      'workers_dev must be explicitly false',
      'assets.directory resolves to /p/build',
      'html_handling is "auto-trailing-slash" (default)',
      'no route for the production host example.com',
    ])
      assert.ok(
        errors.some((e) => e.includes(expected)),
        expected,
      );
    assert.ok(warnings.some((w) => w.includes('also serves production')));
    assert.equal(bad.name, 'other');
  });
  it('warns that Worker responses bypass _headers', () => {
    const { warnings } = checkWranglerConfig(site(), { ...good, main: './worker/index.ts' }, opts);
    assert.ok(warnings.some((w) => w.includes('applyHeaders()')));
  });
  it('reads TOML and JSONC files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ws-wrangler-read-'));
    try {
      await writeFile(
        join(dir, 'wrangler.jsonc'),
        '{\n // comment\n "name": "x", /* c */ "routes": [1,],\n}',
      );
      assert.deepEqual(await readWranglerConfig(join(dir, 'wrangler.jsonc')), {
        name: 'x',
        routes: [1],
      });
      await writeFile(join(dir, 'wrangler.toml'), 'name = "x"\n[assets]\ndirectory = "./dist"\n');
      assert.deepEqual(
        JSON.parse(JSON.stringify(await readWranglerConfig(join(dir, 'wrangler.toml')))),
        { name: 'x', assets: { directory: './dist' } },
      );
      await writeFile(join(dir, 'broken.toml'), 'name = ');
      await assert.rejects(
        readWranglerConfig(join(dir, 'broken.toml')),
        /cannot parse Wrangler configuration/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    assert.deepEqual(parseJsonc('{"url": "https://a.test//x", "s": "a,}"}'), {
      url: 'https://a.test//x',
      s: 'a,}',
    });
  });
});
