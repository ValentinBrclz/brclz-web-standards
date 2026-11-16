import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { alignCompatibilityDate, initProject, installedWorkerdDate } from '../src/init.mjs';

const dirs = [];
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

/** A generated site plus a fake Wrangler whose workerd declares `workerdDate`. */
async function site(/** @type {string} */ date, /** @type {string | null} */ workerdDate) {
  const parent = await mkdtemp(join(tmpdir(), 'ws-init-'));
  dirs.push(parent);
  const directory = join(parent, 'site');
  await initProject({
    directory,
    name: 'Example',
    url: 'https://www.example.com',
    compatibilityDate: date,
  });
  if (workerdDate) {
    const modules = join(directory, 'node_modules');
    await mkdir(join(modules, 'wrangler'), { recursive: true });
    await writeFile(join(modules, 'wrangler/package.json'), '{"name":"wrangler"}');
    await mkdir(join(modules, 'workerd'), { recursive: true });
    await writeFile(join(modules, 'workerd/package.json'), '{"name":"workerd","main":"main.js"}');
    await writeFile(
      join(modules, 'workerd/main.js'),
      `module.exports = { compatibilityDate: ${JSON.stringify(workerdDate)} };`,
    );
  }
  return directory;
}

/** @param {string} directory */
const dates = async (directory) => ({
  wrangler: (await readFile(join(directory, 'wrangler.toml'), 'utf8')).match(
    /compatibility_date = "([^"]+)"/,
  )?.[1],
  config: (await readFile(join(directory, 'site.config.mjs'), 'utf8')).match(
    /compatibilityDate: "([^"]+)"/,
  )?.[1],
});

describe('init compatibility date', () => {
  it('lowers a date newer than the installed workerd supports', async () => {
    const directory = await site('2026-11-02', '2026-10-23');
    assert.equal(installedWorkerdDate(directory), '2026-10-23');
    assert.deepEqual(await alignCompatibilityDate(directory, '2026-11-02'), {
      date: '2026-10-23',
      changed: true,
    });
    assert.deepEqual(await dates(directory), { wrangler: '2026-10-23', config: '2026-10-23' });
  });

  it('never raises the date', async () => {
    const directory = await site('2026-10-01', '2026-10-23');
    assert.deepEqual(await alignCompatibilityDate(directory, '2026-10-01'), {
      date: '2026-10-01',
      changed: false,
    });
    assert.deepEqual(await dates(directory), { wrangler: '2026-10-01', config: '2026-10-01' });
  });

  it('leaves the files alone when Wrangler is not installed', async () => {
    const directory = await site('2026-11-02', null);
    assert.equal(installedWorkerdDate(directory), null);
    assert.equal(await alignCompatibilityDate(directory, '2026-11-02'), null);
    assert.deepEqual(await dates(directory), { wrangler: '2026-11-02', config: '2026-11-02' });
  });
});
