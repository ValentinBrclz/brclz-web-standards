import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const { version } = JSON.parse(await read('package.json'));
const escaped = version.replaceAll('.', '\\.');

describe('installation does not depend on a release tag', () => {
  it('documentation and workflow examples reference no tag (none may exist)', async () => {
    for (const path of ['README.md', 'docs/guide.md', '.github/workflows/reusable-astro-ci.yml']) {
      const tags = (await read(path)).match(/(?:#|@)v\d+\.\d+\.\d+\b/g) ?? [];
      assert.deepEqual(tags, [], `${path} refers to a tag`);
    }
    assert.match(
      await read('.github/workflows/reusable-astro-ci.yml'),
      /reusable-astro-ci\.yml@main/,
    );
  });
  it('keeps the documented status and the changelog on the package version', async () => {
    assert.match(await read('README.md'), new RegExp(`Status: ${escaped},`));
    assert.match(await read('CHANGELOG.md'), new RegExp(`^## \\[${escaped}\\]`, 'm'));
  });
});
