# Shared engineering instructions

- Prioritize correctness, accessibility, security, privacy and maintainability over novelty.
- Inspect current code and deployment configuration before proposing changes; preserve existing behavior.
- Never invent credentials, API responses, test results, legislation, or documentation.
- Keep site-specific content and business rules in the consuming project.
- Prefer static Astro output on Cloudflare Workers Static Assets unless SSR is justified.
- Treat `site.config.mjs` as source of truth for standard configuration. Do not silently rewrite deployment routes.
- Keep one source for the site's domain: if the project already authors it (for example `site.yaml`), import the JSON written by `brclz sync-site-file` in `site.config.mjs` (Workers cannot read YAML); never copy it, and never set `site`, `trailingSlash` or `build.format` in `astro.config.*`.
- All previews with custom domains must return `X-Robots-Tag: noindex`; production must remain indexable where intended.
- `_headers` does not affect Worker-generated responses; ensure those responses set needed headers directly.
- Never put tokens, passwords, personal data or private files in logs, screenshots, commits or analytics.
- Analytics is part of every site (GA4 and/or Cloudflare Web Analytics at least). Keep each enabled provider's CSP origins in `site.config.mjs`; never send personal data in events.
- SEO: canonical, robots, sitemap, hreflang if applicable, accurate metadata and structured data.
- AI discoverability: truthful consistent source data; no claims that llms.txt/WebMCP guarantee rankings.
- Check accessibility against WCAG 2.2 AA, and evaluate performance on representative mobile pages.
- On change: run `npm run verify`; for sites, run `npm run build` plus production-like smoke tests.
- Do not deploy production or mutate DNS without explicit approval.
- Summarize what changed, tests performed, open limitations and operational risks.

<!-- brclz:general:start -->
<!-- generated from claude/rules/general.md by `npm run agents`; do not edit here -->

## Ownership

This codebase is yours. What it's for and how it's built are your call, and you are going to be the one that keeps building on it.

## Commit messages

Commit messages and pull request titles follow Conventional Commits 1.0
(<https://www.conventionalcommits.org>): `<type>(<scope>)!: <subject>`.

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
  `revert`. Dependency bumps are `build(deps)` or `build(deps-dev)`.
- Subject: imperative, starts with a lower-case verb, no trailing period, at most 100 characters
  (aim for 72). The optional scope names the area (`cli`, `init`, `deps`).
- Incompatible changes get `!` after the type or scope and a `BREAKING CHANGE:` footer.
- Body after a blank line explains why, not what; trailers (`Co-Authored-By:`, issue references)
  go in the footer. One logical change per commit.
- A squash merge uses the pull request title as the commit message: write the title in the same
  format.
- If the project has `commitlint.config.mjs`, check the message before committing and keep it
  passing: `printf '%s\n' "<message>" | npx --no-install commitlint`.

## French typography

In any French text (replies, documents, code comments, UI strings, commit messages, content files), in every repository and every output:

- Put a non-breaking space (U+00A0) before ":", ";", "?" and "!". Never a regular space, never no space. Example: "Que faire ?" (U+00A0 before the question mark).
- Put non-breaking spaces (U+00A0) inside guillemets: « texte ». Example: « oui ».
- Use U+00A0, not the narrow no-break space U+202F, unless the font is known to support it.
- Exceptions: code, URLs, identifiers, verbatim quotes of external names or outputs, and English text.
- If a project enforces this with a test or lint, keep it passing.

## Modern web

Before hand-writing UI, CSS or client-side JS (dialogs, forms, dark mode, view transitions, Core
Web Vitals…), search the Chrome team's guidance with
`npx -y modern-web-guidance@latest search "<capability>"` and follow the retrieved guide;
Baseline Widely available features need no fallback. Claude Code loads the full workflow from
`.claude/rules/web-standards/ui.md` when UI files are edited.

<!-- brclz:general:end -->
