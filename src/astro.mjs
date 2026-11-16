/**
 * Astro configuration fragment derived from the site configuration. Spread it into the
 * project's `defineConfig()`; keep the `build` and `vite` objects when adding options:
 *
 *   const base = baseAstroConfig(defineSite(siteOverrides));
 *   export default defineConfig({ ...base, integrations: [...], vite: { ...base.vite, plugins: [...] } });
 */
import { resolveSite } from './config.mjs';
import { allowsInline } from './csp.mjs';

/**
 * @typedef {object} BaseAstroConfig
 * @property {string} site
 * @property {'static'} output
 * @property {'never' | 'always' | 'ignore'} trailingSlash
 * @property {{ format: 'file' | 'directory' | 'preserve', inlineStylesheets?: 'never' }} build
 * @property {{ build?: { assetsInlineLimit: number } }} vite
 */

/**
 * @param {import('./config.mjs').SiteOverrides | Readonly<import('./config.mjs').SiteConfig>} input
 * @returns {BaseAstroConfig}
 */
export function baseAstroConfig(input) {
  const site = resolveSite(input);
  const csp = site.security.csp;
  /** @type {BaseAstroConfig} */
  const config = {
    site: /** @type {string} */ (site.identity.productionUrl),
    output: 'static',
    trailingSlash: site.astro.trailingSlash,
    build: { format: site.astro.buildFormat },
    vite: {},
  };
  // Astro inlines small stylesheets and scripts (and small assets as data: URIs). A CSP
  // without 'unsafe-inline' would block them, so emit them as files instead.
  if (csp && !allowsInline(csp, 'style')) config.build.inlineStylesheets = 'never';
  if (csp && !allowsInline(csp, 'script')) config.vite.build = { assetsInlineLimit: 0 };
  return config;
}

/**
 * Finds settings in a project's `astro.config.*` that `baseAstroConfig()` already derives from
 * `site.config.mjs`. A second copy would silently win over the spread (it comes later in the
 * object) and make Astro's canonical URLs and sitemap disagree with `_headers` and the Wrangler
 * routes. Only top-level properties of the config object are inspected (biome/prettier indent:
 * at most two spaces or one tab), so integration options named `site` are not reported.
 * @param {string} source Text of the Astro configuration file.
 * @returns {{ line: number, key: string }[]}
 */
export function findAstroConfigConflicts(source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/.*$/gm, '$1');
  /** @type {{ line: number, key: string }[]} */
  const found = [];
  code.split('\n').forEach((text, index) => {
    const top = /^(?: {0,2}|\t)(site|trailingSlash)\s*:/.exec(text);
    if (top?.[1]) found.push({ line: index + 1, key: top[1] });
    else if (/^(?: {2,4}|\t{1,2})format\s*:\s*['"](?:file|directory|preserve)['"]/.test(text))
      found.push({ line: index + 1, key: 'build.format' });
  });
  return found;
}
