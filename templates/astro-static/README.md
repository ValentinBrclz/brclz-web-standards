# Astro static site template

Source files for `brclz init` (not meant to be copied by hand). `init` generates
`site.config.mjs`, `astro.config.mjs`, `wrangler.toml`, `package.json`, `src/styles/global.css`
and `src/pages/index.astro` from its arguments, and copies the rest:

| File | Purpose |
| --- | --- |
| `package.json` | Dependency catalogue (pinned versions, kept current by Dependabot); `init` picks the core plus the selected `--features` |
| `src/layouts/BaseLayout.astro` | Head metadata checked by `audit-dist` (lang, title, description, canonical, Open Graph), skip link |
| `src/pages/404.astro`, `src/pages/robots.txt.ts` | 404 page; production robots.txt with sitemap URL |
| `src/pages/search.astro`, `tests/e2e/search.spec.ts` | Feature `search` (Pagefind) |
| `src/components/Analytics.astro`, `src/scripts/analytics.ts` | Feature `posthog` (consent-gated, disabled until configured) |
| `playwright.config.ts`, `tests/e2e/site.spec.ts` | axe (WCAG 2.2 AA), overflow at 320 px, CSP and 404 checks against `wrangler dev` |
| `biome.json`, `tsconfig.json`, `.vscode/`, `gitignore`, `.node-version` | Tooling (`gitignore` is renamed `.gitignore`, which npm would drop from the package) |

`scripts/smoke.mjs` creates a project with every feature and runs its checks, build, e2e tests,
`wrangler deploy --dry-run` and browser checks.
