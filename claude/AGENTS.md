# Project instructions

Astro static site on Cloudflare Workers Static Assets, using `@valentinbrclz/web-standards`.
`site.config.mjs` is the source of truth for the production origin, Preview domain, security
headers, CSP and analytics; `npx brclz print-config` shows the resolved values.

- Make small, verified changes; keep the existing architecture and production behaviour.
- `npm run verify` must pass; never skip or weaken a test to make it pass.
- Report the commands you ran, their results and any remaining risk.
- Never put secrets or personal data in code, logs, build output or analytics events.

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
