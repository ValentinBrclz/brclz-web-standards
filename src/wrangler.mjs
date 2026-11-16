/**
 * Wrangler configuration: an opt-in generator for purely static Workers, and a checker that
 * compares a project-owned wrangler.toml / wrangler.json(c) with the site configuration
 * without rewriting it. Docs: https://developers.cloudflare.com/workers/wrangler/configuration/
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { resolveSite } from './config.mjs';

/** @param {string} path */
const posix = (path) => path.split(sep).join('/');
/** @param {string} from @param {string} to */
function relativePath(from, to) {
  const rel = posix(relative(from, to));
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * Generates a Wrangler JSON configuration for a fully static site. Refuses Worker code,
 * bindings and cron triggers: those stay in a project-owned configuration.
 * @param {import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>} input
 * @param {{ configDir?: string, projectDir?: string }} [options] Directory the config will be written to,
 *   and the project root that `cloudflare.assetsDirectory` is relative to (both default to cwd).
 */
export function generateStaticWrangler(input, options = {}) {
  const site = resolveSite(input);
  const cf = site.cloudflare;
  if (!cf.workerName)
    throw new Error('cloudflare.workerName is required to generate a Wrangler configuration');
  if (!cf.compatibilityDate)
    throw new Error(
      'cloudflare.compatibilityDate is required (an explicit date keeps runtime behaviour reproducible)',
    );
  const projectDir = resolve(options.projectDir ?? '.');
  const configDir = resolve(options.configDir ?? projectDir);
  const assets = isAbsolute(cf.assetsDirectory)
    ? cf.assetsDirectory
    : resolve(projectDir, cf.assetsDirectory);
  const routes = [
    {
      pattern: new URL(/** @type {string} */ (site.identity.productionUrl)).hostname,
      custom_domain: true,
    },
  ];
  if (site.identity.previewDomain)
    routes.push(
      /** @type {any} */ ({
        pattern: site.identity.previewDomain,
        custom_domain: true,
        previews_enabled: true,
        enabled: false,
      }),
    );
  return {
    $schema: relativePath(configDir, join(projectDir, 'node_modules/wrangler/config-schema.json')),
    name: cf.workerName,
    compatibility_date: cf.compatibilityDate,
    workers_dev: cf.workersDev,
    preview_urls: cf.previewUrls,
    assets: {
      directory: relativePath(configDir, assets),
      html_handling: cf.htmlHandling,
      not_found_handling: cf.notFoundHandling,
    },
    routes,
    // Required by `wrangler preview`; Previews inherit the top-level settings.
    previews: {},
  };
}

/**
 * Strips // and /* *\/ comments and trailing commas from JSONC.
 * @param {string} text
 */
export function parseJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = /** @type {string} */ (text[i]);
    const n = text[i + 1];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && n === '*') {
      i = text.indexOf('*/', i + 2);
      if (i === -1) throw new Error('Unterminated comment');
      i++;
    } else if (c === ',' && isTrailingComma(text, i + 1)) {
      // Trailing comma: dropped.
    } else out += c;
  }
  return JSON.parse(out);
}

/** Whitespace and comments, then a closing bracket (sticky: matched in place, no string copy). */
const BEFORE_CLOSE = /(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*[}\]]/y;

/**
 * Whether only whitespace and comments separate `from` and a closing `}` or `]`.
 * @param {string} text
 * @param {number} from
 */
function isTrailingComma(text, from) {
  BEFORE_CLOSE.lastIndex = from;
  return BEFORE_CLOSE.test(text);
}

/**
 * Reads wrangler.toml, wrangler.json or wrangler.jsonc.
 * @param {string} path
 * @returns {Promise<Record<string, any>>}
 */
export async function readWranglerConfig(path) {
  const text = await readFile(path, 'utf8');
  try {
    return path.endsWith('.toml') ? parseToml(text) : parseJsonc(text);
  } catch (error) {
    throw new Error(
      `${path}: cannot parse Wrangler configuration: ${/** @type {Error} */ (error).message}`,
    );
  }
}

/**
 * Compares a Wrangler configuration with the site configuration. Never modifies it.
 * @param {import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>} input
 * @param {Record<string, any>} config parsed Wrangler configuration
 * @param {{ configDir?: string, projectDir?: string }} [options]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkWranglerConfig(input, config, options = {}) {
  const site = resolveSite(input);
  const cf = site.cloudflare;
  const errors = [];
  const warnings = [];
  const projectDir = resolve(options.projectDir ?? '.');
  const configDir = resolve(options.configDir ?? projectDir);

  if (cf.workerName && config.name !== cf.workerName)
    errors.push(`name is "${config.name}", site config expects "${cf.workerName}"`);
  if (!config.compatibility_date) errors.push('compatibility_date is missing');
  else if (cf.compatibilityDate && config.compatibility_date !== cf.compatibilityDate)
    warnings.push(
      `compatibility_date is ${config.compatibility_date}, site config says ${cf.compatibilityDate}`,
    );
  if (config.workers_dev !== false)
    errors.push(
      'workers_dev must be explicitly false (a workers.dev hostname duplicates production)',
    );
  if (config.preview_urls !== cf.previewUrls)
    errors.push(
      `preview_urls must be ${cf.previewUrls}${config.preview_urls === undefined ? ' (it is not set; set it explicitly)' : ''}`,
    );

  const assets = config.assets;
  if (!assets?.directory) errors.push('assets.directory is missing');
  else {
    const actual = resolve(configDir, assets.directory);
    const expected = resolve(projectDir, cf.assetsDirectory);
    if (actual !== expected)
      errors.push(
        `assets.directory resolves to ${actual}, expected ${expected} (paths are relative to the Wrangler file)`,
      );
  }
  const html = assets?.html_handling ?? 'auto-trailing-slash';
  if (html !== cf.htmlHandling)
    errors.push(
      `assets.html_handling is "${html}"${assets?.html_handling ? '' : ' (default)'}, site config expects "${cf.htmlHandling}"`,
    );
  const notFound = assets?.not_found_handling ?? 'none';
  if (notFound !== cf.notFoundHandling)
    errors.push(
      `assets.not_found_handling is "${notFound}"${assets?.not_found_handling ? '' : ' (default)'}, site config expects "${cf.notFoundHandling}"`,
    );

  const routes = /** @type {any[]} */ (
    Array.isArray(config.routes) ? config.routes : config.route ? [config.route] : []
  );
  const host = new URL(/** @type {string} */ (site.identity.productionUrl)).hostname;
  const prod = routes.find(
    (r) => (typeof r === 'string' ? r : r.pattern)?.replace(/\/\*?$/, '') === host,
  );
  if (!prod) errors.push(`no route for the production host ${host}`);
  else if (typeof prod === 'object' && prod.enabled === false)
    errors.push(`the production route ${host} has enabled = false`);
  const preview = site.identity.previewDomain;
  if (preview) {
    const route = routes.find((r) => typeof r === 'object' && r.pattern === preview);
    if (!route)
      warnings.push(
        `no route for the preview domain ${preview}; custom-domain Previews will not exist`,
      );
    else {
      if (route.custom_domain !== true || route.previews_enabled !== true)
        errors.push(
          `preview route ${preview} needs custom_domain = true and previews_enabled = true`,
        );
      if (route.enabled !== false)
        warnings.push(
          `preview route ${preview} also serves production (set enabled = false to keep it Preview-only)`,
        );
    }
    if (!('previews' in config))
      warnings.push(
        'no [previews] section: `wrangler preview` (Workers Builds preview command) requires it, even empty',
      );
  }
  if (config.main || assets?.run_worker_first)
    warnings.push(
      'a Worker script handles some requests: _headers and _redirects do not apply to its responses; set headers in code (see applyHeaders() in @valentinbrclz/web-standards/headers/runtime)',
    );
  if (config.env && typeof config.env === 'object') {
    for (const [name, env] of Object.entries(config.env)) {
      if (env?.routes || env?.route)
        warnings.push(`env.${name} defines its own routes; they are not checked`);
    }
  }
  return { errors, warnings };
}
