// Fails when the committed declarations in types/ differ from what `npm run types` generates.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = await mkdtemp(join(tmpdir(), 'web-standards-types-'));
try {
  execFileSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.types.json', '--outDir', out],
    { stdio: 'inherit' },
  );
  const [expected, actual] = await Promise.all([readdir(out), readdir('types')]);
  const names = [...new Set([...expected, ...actual])];
  const problems = [];
  for (const name of names.sort()) {
    const [a, b] = await Promise.all([
      readFile(join(out, name), 'utf8').catch(() => null),
      readFile(join('types', name), 'utf8').catch(() => null),
    ]);
    if (a !== b) problems.push(name);
  }
  if (problems.length) {
    console.error(
      `types/ is out of date (${problems.join(', ')}). Run "npm run types" and commit the result.`,
    );
    process.exitCode = 1;
  } else console.log('types/ is up to date');
} finally {
  await rm(out, { recursive: true, force: true });
}
