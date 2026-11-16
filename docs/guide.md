# Guide

Requirements: Node.js ≥ 26 and read access to this repository from CI and Cloudflare Workers
Builds. No release tag is needed: the dependency is installed from the default branch and
`package-lock.json` records the exact commit. In CI use `npx --no-install brclz`: if the
dependency were missing, plain `npx` could download an unrelated npm package of the same name.

## New site

`brclz init` (see `--help` for options) generates the configuration, copies the template, installs
the Claude Code rules and runs `npm install`. It refuses a non-empty directory. The compatibility
date is lowered to the newest one the installed Wrangler's `workerd` supports, so `wrangler dev`
starts. Then:

```bash
cd my-site && npx playwright install chromium && npm run verify
```

Connect the repository to Workers Builds (build command `npm run build`), check the Preview
(`curl -sI` shows `X-Robots-Tag: noindex`) and deploy to production after review.

## Existing Astro site

1. Create `site.config.mjs` from the closest file in `examples/`, with the site's **current**
   `buildFormat`, `trailingSlash` and `htmlHandling`. `brclz init /tmp/ref … --skip-install`
   produces reference files to compare with.
2. Move `public/_headers` into `site.config.mjs` (site-wide headers → `security.headers`, CSP →
   `security.csp`, HSTS → `security.hsts`, other blocks → `security.extraRules`; Preview rules
   come from `identity.previewDomain`). Prove equivalence before deleting the old file, as
   `tests/migration.test.mjs` does:

   ```js
   import { readFileSync } from 'node:fs';
   import { defineSite } from '@valentinbrclz/web-standards/config';
   import { parseHeadersFile, resolveHeaders } from '@valentinbrclz/web-standards/headers';
   import overrides from './site.config.mjs';

   const old = parseHeadersFile(readFileSync('public/_headers', 'utf8'));
   for (const url of ['https://www.example.com/', 'https://www.example.com/_astro/a.js'])
     console.log(url, resolveHeaders(old, url), resolveHeaders(defineSite(overrides), url));
   ```

3. `astro.config.mjs`:

   ```js
   import { baseAstroConfig } from '@valentinbrclz/web-standards/astro';
   import { defineSite } from '@valentinbrclz/web-standards/config';
   import { defineConfig } from 'astro/config';
   import siteOverrides from './site.config.mjs';

   const base = baseAstroConfig(defineSite(siteOverrides));
   export default defineConfig({ ...base, integrations: [], vite: { ...base.vite, plugins: [] } });
   ```

   Remove `site`, `trailingSlash` and `build.format` from the project part: `brclz check` fails
   while they are set, because the later value would silently win.

   **One source for the domain.** If the project already authors it (for example `site.yaml`),
   that file stays the only place to edit it. Workers and bundlers cannot read YAML, so
   `brclz sync-site-file` writes it as `site.generated.json`, which `site.config.mjs` imports.
   `brclz check` fails while the JSON is stale. A Worker must not import either file (it loads
   precompiled rules, see [architecture](architecture.md#worker-generated-responses)).

   ```js
   import { httpsOrigin } from '@valentinbrclz/web-standards/config';
   import file from './site.generated.json' with { type: 'json' };

   export default { identity: { name: file.name, productionUrl: httpsOrigin(file.domain) } };
   ```

4. Scripts: `"build": "astro build && brclz generate-headers"` (with a site file, prefix
   `brclz sync-site-file &&`), and `"verify": "astro check && biome check . && brclz check && npm run build && brclz audit-dist"`.
5. Keep `wrangler.toml` and `public/_redirects`; `brclz check` compares them with the site
   configuration. Projects with Worker code also run `brclz generate-header-rules` in the build.
6. Optional: `npx brclz install-claude` (never overwrites; `--force` refreshes the rules) and
   commitlint: `export { default } from '@valentinbrclz/web-standards/commitlint';` in
   `commitlint.config.mjs`.
7. CI: call the reusable workflow.

   ```yaml
   on:
     pull_request:
       types: [opened, edited, synchronize, reopened] # `edited` re-checks a renamed PR title
     push:
       branches: [main] # the production branch
   permissions:
     contents: read
   jobs:
     standards:
       uses: ValentinBrclz/brclz-web-standards/.github/workflows/reusable-astro-ci.yml@main
       with:
         audit-dist: true
         wrangler-dry-run: true
         commitlint: true # lints the PR title (a squash merge keeps it as the commit message)
   ```

8. Build, deploy a Preview, check headers over HTTP, then production.

## Updating a site

1. Read the "Breaking" sections of `CHANGELOG.md` between the two versions.
2. In a branch: `npm update @valentinbrclz/web-standards` and commit the lockfile.
3. Compare generated headers:
   `cp dist/_headers /tmp/before && npm run build && diff /tmp/before dist/_headers`.
4. Run `npm run verify` and `npx brclz check --strict`, check the Preview, merge. Roll back by
   reverting the dependency change.

## Versioning

Semantic versions in `package.json` and `CHANGELOG.md`. The package is not published to npm; sites
install the default branch and the lockfile pins the commit, so an update is a deliberate
`npm update`. To freeze, add `#<full-sha>` to the dependency spec (and to `brclz init
--standards`), and call the reusable workflow with a full SHA instead of `@main`. Nothing stops a
breaking change from reaching `main`: read the changelog.

- Patch: no change to generated files for valid configurations.
- Minor: new options, checks or warnings.
- Major: changed `_headers` output for an existing configuration, removed or renamed keys or
  exports. Before 1.0, breaking changes bump the minor version and are listed under "Breaking".

Supported: Node.js ≥ 26 (only version tested), Astro 6 and 7 (smoke-tested with 7.4.12), Wrangler
4.x (schema-tested with 4.162.0), Biome ≥ 2.6.8, posthog-js ≥ 1.300.

Release: `npm run verify` and `npm run test:smoke` green, update `CHANGELOG.md` and `version`,
merge (optionally tag `vX.Y.Z`).

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| `dist/_headers already exists and was not generated by brclz` | Astro copied `public/_headers`. Migrate its rules into `site.config.mjs` and delete it |
| `cloudflare.htmlHandling … does not serve Astro buildFormat …` | URL style mismatch (redirects or 404s). Use the suggested `htmlHandling` or change `astro` |
| `… is enabled but connect-src blocks …` | Analytics origins missing from the CSP. Apply the fix `brclz check` prints |
| Styles or scripts missing in production, CSP errors | Inline code under a strict CSP or a missing origin. Use `baseAstroConfig()`, run `audit-dist`, add the origin to the right directive |
| Two CSP values on one URL | A hand-written `_headers` repeats the header and Cloudflare joins them. Use `extraRules[].csp` |
| Preview indexed or no `X-Robots-Tag` | `previewDomain` unset, `generate-headers` missing from the Workers Builds command, or the response comes from Worker code (use `applyHeaders()`) |
| `canonical path /about.html differs from the served URL /about` | `Astro.url.pathname` includes `.html` with `build.format: 'file'`. Use `canonicalUrl()` / `buildPageMeta()` |
| `check-wrangler`: `assets.directory resolves to …` | Wrangler paths are relative to the Wrangler file. Fix the path or `cloudflare.assetsDirectory` |
| Biome: `Found a nested root configuration` | A copied `biome.json` inside another Biome project. Keep one root; ignore nested ones with `"!!path/biome.json"` |
| PostHog sends nothing in cookieless mode | Cookieless mode is not enabled in the PostHog project |
| Headers differ locally and on Cloudflare | `wrangler dev` ignores host-based rules. Verify with `curl -sI` on the Preview and production URLs |
