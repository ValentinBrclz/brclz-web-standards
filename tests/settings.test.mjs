import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

/** Minimal gitignore-style match for `Read(./path)` patterns: `*` does not cross `/`. */
const matches = (rule, file) => {
  const pattern = /^Read\(\.\/(.+)\)$/.exec(rule)?.[1];
  if (!pattern) return false;
  const source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*');
  return new RegExp(`^${source}$`).test(file);
};

for (const path of ['claude/settings.json', '.claude/settings.json']) {
  describe(`${path} permissions`, () => {
    it('denies reading secret files but not the committed example files', async () => {
      const { deny, ask } = JSON.parse(
        await readFile(new URL(`../${path}`, import.meta.url), 'utf8'),
      ).permissions;
      const denied = (file) => deny.some((rule) => matches(rule, file));
      for (const secret of [
        '.env',
        '.env.local',
        '.env.production',
        '.env.staging.local',
        '.dev.vars',
        '.dev.vars.production',
      ])
        assert.ok(denied(secret), `${secret} is denied`);
      for (const example of ['.env.example', '.env.sample', '.env.template', '.dev.vars.example'])
        assert.ok(!denied(example), `${example} stays readable`);
      assert.ok(ask.includes('Bash(npx wrangler deploy *)'));
      assert.ok(!ask.includes('Bash(git push *)'));
    });
  });
}
