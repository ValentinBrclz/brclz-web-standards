import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const lint = (message) =>
  spawnSync(process.execPath, [join(root, 'node_modules/@commitlint/cli/cli.js')], {
    cwd: root,
    input: message,
    encoding: 'utf8',
  });

describe('commitlint configuration', () => {
  it('accepts Conventional Commits, including scopes, breaking changes and trailers', () => {
    for (const message of [
      'feat(cli): add commitlint',
      'fix: keep the preview noindex',
      'refactor!: generic examples',
      'build(deps-dev): bump typescript from 6.0.3 to 7.0.2',
      'docs: explain the domain source\n\nBody that explains why.\n\nCo-Authored-By: A <a@example.com>\nClaude-Session: https://example.com/a/very/long/url/that/is/not/wrapped/at/all/because/trailers/are/not/prose/00000',
    ])
      assert.equal(lint(message).status, 0, `${message}\n${lint(message).stdout}`);
  });
  it('rejects free-form, capitalised and over-long subjects', () => {
    for (const [message, rule] of [
      ['Added stuff.', 'type-empty'],
      ['feat: Add the thing', 'subject-case'],
      ['feat: add the thing.', 'subject-full-stop'],
      ['wip: something', 'type-enum'],
      [`feat: ${'x'.repeat(100)}`, 'header-max-length'],
    ]) {
      const result = lint(message);
      assert.equal(result.status, 1, message);
      assert.match(result.stdout, new RegExp(`\\[${rule}\\]`), message);
    }
  });
});
