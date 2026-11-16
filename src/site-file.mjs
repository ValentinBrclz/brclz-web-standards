/**
 * Reads a project's existing site file (for example `site.yaml`) so the domain is authored once.
 *
 * `site.config.mjs` is bundled into Workers, which cannot read files at runtime, so it must not
 * call `readSiteFile()`. Instead `brclz sync-site-file` writes the site file as JSON
 * (`site.generated.json`), `site.config.mjs` imports that JSON, and `brclz check` fails when the
 * JSON is stale:
 *
 *   // site.config.mjs (Node and Worker safe)
 *   import { httpsOrigin } from '@valentinbrclz/web-standards/config';
 *   import file from './site.generated.json' with { type: 'json' };
 *   export default { identity: { name: file.name, productionUrl: httpsOrigin(file.domain) } };
 *
 * `readSiteFile()` stays available for Node-only code (scripts, an Astro-only configuration).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';

export { httpsOrigin } from './config.mjs';

/**
 * Parses a YAML (`.yaml`, `.yml`), JSON or TOML file into a plain object. Relative paths are
 * resolved against the current working directory (the project root when run by npm scripts and
 * by `brclz`).
 * @param {string} path
 * @returns {Record<string, unknown>}
 */
export function readSiteFile(path) {
  const file = resolve(path);
  const extension = extname(file).toLowerCase();
  /** @type {(text: string) => unknown} */
  let parse;
  if (extension === '.yaml' || extension === '.yml') parse = parseYaml;
  else if (extension === '.json') parse = JSON.parse;
  else if (extension === '.toml') parse = parseToml;
  else
    throw new Error(
      `${path}: unsupported site file type "${extension}" (use .yaml, .yml, .json or .toml)`,
    );
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`${path}: cannot read the site file (${/** @type {Error} */ (error).message})`);
  }
  let data;
  try {
    data = parse(text);
  } catch (error) {
    throw new Error(
      `${path}: invalid ${extension.slice(1)} (${/** @type {Error} */ (error).message})`,
    );
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new Error(`${path}: the top level must be a mapping of keys to values`);
  return /** @type {Record<string, unknown>} */ (data);
}

/** Default location of the JSON copy that `site.config.mjs` imports. */
export const SITE_JSON = 'site.generated.json';

/**
 * The project's site file: `site.yaml`, else `site.yml`, relative to the working directory.
 * @returns {string | undefined}
 */
export function findSiteFile() {
  return ['site.yaml', 'site.yml'].find((name) => existsSync(resolve(name)));
}

/**
 * Writes (or, with `check`, only compares) the JSON copy of a site file.
 * @param {{ from?: string, to?: string, check?: boolean }} [options]
 * @returns {{ from: string, to: string, status: 'written' | 'unchanged' | 'stale' | 'missing' }}
 *   `missing` = check mode and the JSON file does not exist; `stale` = it differs from the site file.
 */
export function syncSiteFile({ from, to = SITE_JSON, check = false } = {}) {
  const source = from ?? findSiteFile();
  if (!source) throw new Error('No site file found (site.yaml or site.yml); pass --from <file>');
  const json = `${JSON.stringify(readSiteFile(source), null, 2)}\n`;
  const target = resolve(to);
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (current === json) return { from: source, to, status: 'unchanged' };
  if (check) return { from: source, to, status: current === null ? 'missing' : 'stale' };
  writeFileSync(target, json);
  return { from: source, to, status: 'written' };
}
