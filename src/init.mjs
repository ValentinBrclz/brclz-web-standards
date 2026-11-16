/**
 * `brclz init`: creates a new Astro site wired to the shared standards. Configuration files
 * are generated from the arguments; static files come from templates/astro-static; dependency
 * versions come from templates/astro-static/package.json (updated by Dependabot).
 */

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineSite } from './config.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templateDir = join(packageRoot, 'templates/astro-static');

/**
 * Optional features and the packages they add. The core (Astro, Tailwind, sitemap, Biome,
 * TypeScript, Wrangler, Playwright + axe) is always installed.
 */
export const FEATURES = Object.freeze({
  search: { packages: ['pagefind'], description: 'Pagefind static search' },
  mdx: { packages: ['@astrojs/mdx'], description: 'MDX pages and content' },
  icons: {
    packages: ['astro-icon', '@iconify-json/tabler'],
    description: 'Inline SVG icons, Tabler set',
  },
  typography: {
    packages: ['@tailwindcss/typography'],
    description: 'Tailwind prose styles for long text',
  },
  satteri: {
    packages: ['@astrojs/markdown-satteri'],
    description: 'Satteri Markdown processor',
  },
  posthog: {
    packages: ['posthog-js'],
    description: 'Consent-gated PostHog loader, disabled until configured',
  },
});

const CORE = [
  'astro',
  '@astrojs/sitemap',
  'tailwindcss',
  '@tailwindcss/vite',
  '@astrojs/check',
  'typescript',
  '@biomejs/biome',
  'wrangler',
  '@playwright/test',
  // @axe-core/playwright only declares an open peer range; pinning playwright-core here keeps a
  // single copy next to @playwright/test (two copies make the e2e types incompatible).
  'playwright-core',
  '@axe-core/playwright',
  '@commitlint/cli',
  '@commitlint/config-conventional',
];

/** Files copied verbatim (feature-specific ones are listed in FEATURE_FILES). */
const FEATURE_FILES = {
  'src/pages/search.astro': 'search',
  'src/components/Analytics.astro': 'posthog',
  'src/scripts/analytics.ts': 'posthog',
};
/** Template files that are not copied (catalogue and documentation). */
const SKIP = new Set(['package.json', 'README.md']);

/**
 * @typedef {object} InitOptions
 * @property {string} directory Target directory (created; must be empty if it exists).
 * @property {string} name Site name.
 * @property {string} url Production origin, e.g. https://www.example.com.
 * @property {string} [previewDomain] Defaults to "dev." + the host without "www.".
 * @property {string} [workerName] Defaults to the reversed host without "www." (example.org → org-example).
 * @property {string} [language] BCP 47 tag, default "fr-CH".
 * @property {string[]} [features] Optional features (see FEATURES).
 * @property {string} [standardsSpec] npm spec of this package for the new site (default: the repository's default branch; the lockfile pins the commit).
 * @property {string} [compatibilityDate] Default: today (UTC); `brclz init` then lowers it with
 *   `alignCompatibilityDate()` once the site's Wrangler is installed.
 */

/** @param {string} host */
const bareHost = (host) => host.replace(/^www\./, '');

/**
 * Derives defaults from the production URL.
 * @param {string} url
 */
export function deriveDefaults(url) {
  const host = new URL(url).hostname;
  return {
    previewDomain: `dev.${bareHost(host)}`,
    workerName: bareHost(host)
      .split('.')
      .reverse()
      .join('-')
      .replace(/[^a-z0-9-]/g, '-'),
  };
}

/** @param {string[]} features */
function checkFeatures(features) {
  const unknown = features.filter((f) => !(f in FEATURES));
  if (unknown.length)
    throw new Error(
      `Unknown feature(s): ${unknown.join(', ')}. Available: ${Object.keys(FEATURES).join(', ')}`,
    );
}

/** JavaScript string literal (generated files are formatted by Biome after installation). */
const js = (/** @type {unknown} */ value) => JSON.stringify(value);
/** @param {string} text */
const html = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** @param {Required<Pick<InitOptions, 'name' | 'url' | 'previewDomain' | 'workerName' | 'language' | 'compatibilityDate'>>} o @param {Set<string>} f */
function siteConfig(o, f) {
  const csp = f.has('search')
    ? `\n  security: {\n    // Pagefind runs WebAssembly.\n    csp: { 'script-src': ["'self'", "'wasm-unsafe-eval'"] },\n    extraRules: [\n      // Pagefind index shards are content-hashed.\n      { path: '/pagefind/fragment/*', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },\n      { path: '/pagefind/index/*', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },\n    ],\n  },`
    : '';
  const analytics = f.has('posthog')
    ? `\n  // To enable PostHog: set the project key and add\n  // { 'connect-src': ["'self'", 'https://eu.i.posthog.com'] } to security.csp.\n  analytics: { posthog: { enabled: false, consent: 'opt-in', events: [] } },`
    : '';
  return `// Site settings merged over the defaults of @valentinbrclz/web-standards.
// Inspect the result with \`npx brclz print-config\`; reference: docs/architecture.md (in the standards repository).

/** @type {import('@valentinbrclz/web-standards/config').SiteOverrides} */
export default {
  identity: {
    name: ${js(o.name)},
    productionUrl: ${js(o.url)},
    previewDomain: ${js(o.previewDomain)},
    language: ${js(o.language)},
  },
  cloudflare: { workerName: ${js(o.workerName)}, compatibilityDate: ${js(o.compatibilityDate)} },${csp}${analytics}
};
`;
}

/** @param {Set<string>} f */
function astroConfig(f) {
  const imports = [
    f.has('mdx') && "import mdx from '@astrojs/mdx';",
    f.has('satteri') && "import { satteri } from '@astrojs/markdown-satteri';",
    "import sitemap from '@astrojs/sitemap';",
    "import tailwindcss from '@tailwindcss/vite';",
    "import { baseAstroConfig } from '@valentinbrclz/web-standards/astro';",
    "import { defineSite } from '@valentinbrclz/web-standards/config';",
    f.has('icons') && "import icon from 'astro-icon';",
    "import { defineConfig } from 'astro/config';",
    "import siteOverrides from './site.config.mjs';",
  ].filter(Boolean);
  const integrations = [
    f.has('search')
      ? "sitemap({ filter: (page) => !new URL(page).pathname.startsWith('/search') })"
      : 'sitemap()',
    f.has('mdx') && 'mdx()',
    f.has('icons') && "icon({ include: { tabler: ['*'] } })",
  ].filter(Boolean);
  return `// @ts-check
${imports.join('\n')}

// site, output, build.format and trailingSlash come from site.config.mjs; build and vite also
// carry the no-inline settings required by a strict CSP. Keep the spreads when adding options.
const base = baseAstroConfig(defineSite(siteOverrides));

export default defineConfig({
  ...base,
  integrations: [${integrations.join(', ')}],${f.has('satteri') ? '\n  markdown: { processor: satteri() },' : ''}
  vite: { ...base.vite, plugins: [tailwindcss()] },
});
`;
}

/** @param {{ workerName: string, compatibilityDate: string, url: string, previewDomain: string }} o */
function wranglerToml(o) {
  return `# Cloudflare Workers Static Assets (no Worker script). Project-owned: \`npx brclz check\`
# compares it with site.config.mjs and never rewrites it.
name = "${o.workerName}"
compatibility_date = "${o.compatibilityDate}"

# Custom domains only: no workers.dev hostname for production or Previews.
workers_dev = false
preview_urls = false

# Required by \`wrangler preview\` (Workers Builds preview command), even empty.
[previews]

[assets]
directory = "./dist"
html_handling = "drop-trailing-slash"
not_found_handling = "404-page"

[[routes]]
pattern = "${new URL(o.url).hostname}"
custom_domain = true

# Previews only, served as <preview-name>.${o.previewDomain} (noindex via generated _headers).
[[routes]]
pattern = "${o.previewDomain}"
custom_domain = true
previews_enabled = true
enabled = false
`;
}

/** @param {Set<string>} f */
function globalCss(f) {
  return `@import 'tailwindcss';${f.has('typography') ? "\n@plugin '@tailwindcss/typography';" : ''}\n`;
}

/** @param {string} name @param {Set<string>} f */
function indexPage(name, f) {
  return `---
${f.has('icons') ? "import { Icon } from 'astro-icon/components';\n" : ''}import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout title={${js(name)}} description={${js(`Site de ${name}.`)}}>
  <main id="main" class="mx-auto max-w-3xl px-4 py-16${f.has('typography') ? ' prose' : ''}">
    <h1 class="text-3xl font-bold">${f.has('icons') ? '<Icon name="tabler:home" aria-hidden="true" class="inline size-8" /> ' : ''}${html(name)}</h1>
    <p class="mt-4">Remplacer ce contenu.</p>
  </main>
</BaseLayout>
`;
}

/**
 * @param {Record<string, any>} catalogue template package.json
 * @param {{ name: string, features: Set<string>, standardsSpec: string }} o
 */
function packageJson(catalogue, o) {
  const wanted = new Set([
    ...CORE,
    ...[...o.features].flatMap((f) => FEATURES[/** @type {keyof typeof FEATURES} */ (f)].packages),
  ]);
  /** @param {Record<string, string>} deps */
  const pick = (deps) =>
    Object.fromEntries(Object.entries(deps).filter(([name]) => wanted.has(name)));
  const build = [
    'astro build',
    o.features.has('search') && 'pagefind --site dist',
    'brclz generate-headers',
  ]
    .filter(Boolean)
    .join(' && ');
  return {
    name: o.name,
    version: '0.0.0',
    private: true,
    type: 'module',
    engines: { node: '>=26.0.0' },
    scripts: {
      dev: 'astro dev',
      build,
      check: 'astro check && biome check . && brclz check',
      audit: 'brclz audit-dist',
      'test:e2e': 'playwright test',
      verify: 'npm run check && npm run build && npm run audit && npm run test:e2e',
      preview: 'npm run build && wrangler dev',
      fix: 'biome check --write .',
    },
    dependencies: pick(catalogue.dependencies),
    devDependencies: {
      ...pick(catalogue.devDependencies),
      '@valentinbrclz/web-standards': o.standardsSpec,
    },
  };
}

/**
 * Creates the project. Returns the relative paths written.
 * @param {InitOptions} options
 */
export async function initProject(options) {
  const target = resolve(options.directory);
  const existing = await readdir(target).catch(() => null);
  if (existing?.length) throw new Error(`${target} is not empty; choose a new directory`);
  const features = new Set(options.features ?? []);
  checkFeatures([...features]);
  const derived = deriveDefaults(options.url);
  const o = {
    name: options.name,
    url: options.url,
    previewDomain: options.previewDomain ?? derived.previewDomain,
    workerName: options.workerName ?? derived.workerName,
    language: options.language ?? 'fr-CH',
    compatibilityDate: options.compatibilityDate ?? new Date().toISOString().slice(0, 10),
  };
  // Validate before writing anything (same rules as `brclz check`).
  const config = siteConfig(o, features);
  defineSite({
    identity: {
      name: o.name,
      productionUrl: o.url,
      previewDomain: o.previewDomain,
      language: o.language,
    },
    cloudflare: { workerName: o.workerName, compatibilityDate: o.compatibilityDate },
  });
  const catalogue = JSON.parse(await readFile(join(templateDir, 'package.json'), 'utf8'));

  /** @type {string[]} */
  const written = [];
  try {
    await mkdir(target, { recursive: true });
    /** @param {string} dir */
    const copy = async (dir) => {
      for (const entry of await readdir(join(templateDir, dir), { withFileTypes: true })) {
        const rel = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await copy(rel);
          continue;
        }
        if (SKIP.has(rel)) continue;
        const feature = FEATURE_FILES[/** @type {keyof typeof FEATURE_FILES} */ (rel)];
        if (feature && !features.has(feature)) continue;
        const out = rel === 'gitignore' ? '.gitignore' : rel;
        await mkdir(dirname(join(target, out)), { recursive: true });
        if (rel === 'src/layouts/BaseLayout.astro' && !features.has('posthog')) {
          const text = await readFile(join(templateDir, rel), 'utf8');
          await writeFile(
            join(target, out),
            text
              .split('\n')
              .filter((line) => !line.includes('feature:posthog'))
              .join('\n'),
          );
        } else await cp(join(templateDir, rel), join(target, out));
        written.push(out);
      }
    };
    await copy('');
    const generated = {
      'site.config.mjs': config,
      'astro.config.mjs': astroConfig(features),
      'wrangler.toml': wranglerToml(o),
      'src/styles/global.css': globalCss(features),
      'src/pages/index.astro': indexPage(o.name, features),
      'package.json': `${JSON.stringify(
        packageJson(catalogue, {
          name: o.workerName,
          features,
          standardsSpec: options.standardsSpec ?? 'github:ValentinBrclz/brclz-web-standards',
        }),
        null,
        2,
      )}\n`,
    };
    for (const [rel, text] of Object.entries(generated)) {
      await mkdir(dirname(join(target, rel)), { recursive: true });
      await writeFile(join(target, rel), text);
      written.push(rel);
    }
  } catch (error) {
    // Leave nothing half-written in a directory we created.
    if (!existing) await rm(target, { recursive: true, force: true });
    throw error;
  }
  return { directory: target, files: written.sort(), ...o, features: [...features] };
}

/**
 * Newest compatibility date the local Workers runtime (`workerd`) installed with the site's
 * Wrangler declares, or null when Wrangler is not installed.
 * @param {string} directory
 * @returns {string | null}
 */
export function installedWorkerdDate(directory) {
  try {
    const site = createRequire(join(resolve(directory), 'package.json'));
    const wrangler = createRequire(site.resolve('wrangler/package.json'));
    const { compatibilityDate } = wrangler('workerd');
    return typeof compatibilityDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(compatibilityDate)
      ? compatibilityDate
      : null;
  } catch {
    return null;
  }
}

/**
 * Lowers the compatibility date written by `initProject()` to the one the installed `workerd`
 * supports, so `wrangler dev` starts when the release is older than today. Rewrites
 * `wrangler.toml` and `site.config.mjs` (before Biome formats them). Never raises the date.
 * @param {string} directory
 * @param {string} current Date written by `initProject()`.
 * @returns {Promise<{ date: string, changed: boolean } | null>} null when workerd is not installed.
 */
export async function alignCompatibilityDate(directory, current) {
  const supported = installedWorkerdDate(directory);
  if (!supported) return null;
  if (supported >= current) return { date: current, changed: false };
  for (const [file, pattern] of /** @type {const} */ ([
    ['wrangler.toml', `compatibility_date = "${current}"`],
    ['site.config.mjs', `compatibilityDate: "${current}"`],
  ])) {
    const path = join(resolve(directory), file);
    const text = await readFile(path, 'utf8');
    if (text.split(pattern).length !== 2)
      throw new Error(
        `${file}: expected exactly one ${pattern}; set the compatibility date by hand`,
      );
    await writeFile(path, text.replace(pattern, pattern.replace(current, supported)));
  }
  return { date: supported, changed: true };
}
