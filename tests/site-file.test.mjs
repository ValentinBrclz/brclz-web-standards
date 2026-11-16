import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { findAstroConfigConflicts } from '../src/astro.mjs';
import { httpsOrigin, readSiteFile, syncSiteFile } from '../src/site-file.mjs';

const dirs = [];
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));
async function fileWith(name, text) {
  const dir = await mkdtemp(join(tmpdir(), 'ws-sitefile-'));
  dirs.push(dir);
  const path = join(dir, name);
  await writeFile(path, text);
  return path;
}

describe('readSiteFile', () => {
  it('reads YAML, JSON and TOML', async () => {
    const yaml = await readSiteFile(
      await fileWith('site.yaml', 'domain: www.example.com\nname: Example\n'),
    );
    assert.deepEqual(yaml, { domain: 'www.example.com', name: 'Example' });
    assert.equal(readSiteFile(await fileWith('s.yml', 'domain: a.example\n')).domain, 'a.example');
    assert.equal(
      readSiteFile(await fileWith('s.json', '{"domain":"b.example"}')).domain,
      'b.example',
    );
    assert.equal(
      readSiteFile(await fileWith('s.toml', 'domain = "c.example"\n')).domain,
      'c.example',
    );
  });
  it('explains unreadable, invalid and unsupported files', async () => {
    assert.throws(() => readSiteFile('/nonexistent/site.yaml'), /cannot read the site file/);
    assert.throws(
      () => readSiteFile(join(tmpdir(), 'site.ini')),
      /unsupported site file type ".ini"/,
    );
    const bad = await fileWith('bad.yaml', 'a: [unclosed\n');
    const list = await fileWith('list.yaml', '- a\n- b\n');
    assert.throws(() => readSiteFile(bad), /invalid yaml/);
    assert.throws(() => readSiteFile(list), /top level must be a mapping/);
  });
});

describe('syncSiteFile', () => {
  it('writes the JSON copy, then reports unchanged, stale and missing in check mode', async () => {
    const from = await fileWith('site.yaml', 'name: Example\ndomain: www.example.com\n');
    const to = join(from, '..', 'site.generated.json');
    assert.equal(syncSiteFile({ from, to, check: true }).status, 'missing');
    assert.equal(syncSiteFile({ from, to }).status, 'written');
    assert.equal(JSON.parse(await readFile(to, 'utf8')).domain, 'www.example.com');
    assert.equal(syncSiteFile({ from, to }).status, 'unchanged');
    await writeFile(from, 'name: Example\ndomain: www.example.org\n');
    assert.equal(syncSiteFile({ from, to, check: true }).status, 'stale');
    assert.equal(
      JSON.parse(await readFile(to, 'utf8')).domain,
      'www.example.com',
      'check writes nothing',
    );
    assert.equal(syncSiteFile({ from, to }).status, 'written');
  });
});

describe('httpsOrigin', () => {
  it('turns a domain or an https URL into the bare origin', () => {
    assert.equal(httpsOrigin('www.example.com'), 'https://www.example.com');
    assert.equal(httpsOrigin(' https://www.example.com/ '), 'https://www.example.com');
  });
  it('refuses values that would be silently trimmed', () => {
    for (const bad of [
      'http://example.com',
      'https://example.com/fr',
      'example.com:8443',
      '',
      null,
      42,
    ])
      assert.throws(() => httpsOrigin(bad), /site domain/, String(bad));
  });
});

describe('findAstroConfigConflicts', () => {
  const clean = `import { defineConfig } from 'astro/config';
const base = baseAstroConfig(defineSite(siteOverrides));
export default defineConfig({
  ...base,
  integrations: [sitemap({ filter: (page) => page !== '/x' })],
  vite: { ...base.vite, plugins: [] },
});
`;
  it('accepts a config that only spreads the derived base', () => {
    assert.deepEqual(findAstroConfigConflicts(clean), []);
  });
  it('reports a second site, trailingSlash and build.format with line numbers', () => {
    const source = clean.replace(
      '  ...base,\n',
      "  ...base,\n  site: 'https://other.example',\n  trailingSlash: 'always',\n  build: {\n    format: 'file',\n  },\n",
    );
    assert.deepEqual(
      findAstroConfigConflicts(source).map((c) => `${c.line}:${c.key}`),
      ['5:site', '6:trailingSlash', '8:build.format'],
    );
  });
  it('ignores comments and nested integration options', () => {
    const source = clean
      .replace(
        '  ...base,\n',
        "  ...base,\n  // site: 'https://old.example',\n  /* trailingSlash: 'never' */\n",
      )
      .replace('sitemap({', 'sitemap({ site: 1,')
      .replace('sitemap({ site: 1,', 'sitemap({\n      site: 1,');
    assert.deepEqual(findAstroConfigConflicts(source), []);
  });
});
