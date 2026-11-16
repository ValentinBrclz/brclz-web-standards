---
paths:
  - "**/*.astro"
  - "**/*.html"
  - "**/*.css"
  - "**/*.js"
  - "**/*.mjs"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---

# UI rules

## Modern web guidance

Before writing UI, CSS or client-side JavaScript by hand or adding a dependency for it, check the
platform guidance from the Chrome team (Apache-2.0,
<https://developer.chrome.com/docs/modern-web-guidance>). Use it for dialogs, popovers, tables,
dark mode, anchor positioning, container queries, view transitions, scroll-driven animation,
forms and validation, autofill, accessibility, custom selects, Core Web Vitals (LCP, INP, CLS),
image and fetch priority, security (passkeys, sanitization), web components, dates and time
zones, and built-in AI. Skip it for backend code, infrastructure, tooling and copy changes.

1. **Search** with 2–5 words naming one capability or UI primitive, without framework or
   product names (`"light dismiss dialog"`, not `"close React settings modal"`). Split
   multi-feature tasks into separate searches.

   ```bash
   npx -y modern-web-guidance@latest search "light dismiss dialog"
   ```

2. **Retrieve** the matching guide plus the broader one that applies (`html`, `css`, `forms`,
   `accessibility`, `color`, `performance`, `security`); ids are comma-separated. Large output is
   saved to a temporary file: read it in full.

   ```bash
   npx -y modern-web-guidance@latest retrieve "dialog,accessibility"
   ```

3. **Apply** it in the project's framework: keep the modern feature and adapt the syntax
   (cast newly shipped HTML attributes instead of dropping them, guard `window` for SSR, create
   per-instance ids and `anchor-name`s, keep `:root` and `@starting-style` unscoped).
4. **Verify** against the guide: modern pattern and required fallbacks applied, nothing
   unrequested added. Then end the reply with a `### Modern Web Guidance` section: one bullet
   per applied guide id (the non-obvious choice and the pitfall it avoids, with a short verbatim
   quote), or one sentence naming the topics checked when nothing applied.

Browser support: Baseline Widely available features need no fallback; for anything newer follow
the guide's fallbacks, unless the project documents its own support policy in `AGENTS.md`.
For a broad modernization with no target feature, `npx -y modern-web-guidance@latest legacy-scan .
--json` lists legacy patterns (about 20 % of the catalogue); verify each finding before editing.
Never invent guide ids or quotes. If the CLI cannot run (offline, no registry access), say so in
one line and continue with standard Baseline-aware practice without claiming a guide was used.

## UI audit (AI-slop check)

When the change touches a screen or component, run these checks before finishing and fix what fails:

1. Delete filler badges
2. Drop redundant labels
3. Unitalicize random words
4. Mono only where needed
5. Use a design system
6. Show the actual product
7. Enlarge the main feature
8. Group with spacing
9. Make headlines specific
10. Emphasize the CTA
11. Add an accent colour
12. Keep icons consistent
13. Remove embellishments
14. Inner radius = outer − padding
15. Improve text contrast
16. Wrap headlines properly
17. Align by eye, not pixels
18. Use tabular nums
19. Add loading states
20. Animate useful feedback
