// Generates the shared "general rules" block of both AGENTS.md files from
// claude/rules/general.md, the single source of truth (Claude Code reads the rule file; other
// agents read AGENTS.md). `--check` writes nothing and fails when a file is out of date.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const START = '<!-- brclz:general:start -->';
const END = '<!-- brclz:general:end -->';
const NOTE =
  '<!-- generated from claude/rules/general.md by `npm run agents`; do not edit here -->';
const targets = ['AGENTS.md', 'claude/AGENTS.md'];

const source = await readFile(resolve(root, 'claude/rules/general.md'), 'utf8');
// Drop the title and the maintainer paragraph; keep the `##` sections.
const body = source.slice(source.indexOf('\n## ')).trim();
const block = `${START}\n${NOTE}\n\n${body}\n\n${END}`;

const check = process.argv.includes('--check');
const stale = [];
for (const name of targets) {
  const path = resolve(root, name);
  const text = await readFile(path, 'utf8');
  const from = text.indexOf(START);
  const to = text.indexOf(END);
  if (from === -1 || to === -1 || to < from)
    throw new Error(`${name}: missing ${START} … ${END} markers`);
  const next = text.slice(0, from) + block + text.slice(to + END.length);
  if (next === text) continue;
  stale.push(name);
  if (!check) await writeFile(path, next);
}
if (check && stale.length) {
  console.error(
    `${stale.join(', ')} out of date with claude/rules/general.md. Run "npm run agents" and commit the result.`,
  );
  process.exitCode = 1;
} else
  console.log(
    check ? 'AGENTS.md files are up to date' : `AGENTS.md files updated (${stale.length} changed)`,
  );
