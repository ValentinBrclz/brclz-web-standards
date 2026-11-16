---
name: standards-check
description: Check a change or the whole site against the shared web standards — configuration, security headers and CSP, Preview noindex, SEO consistency and accessibility — and report findings with evidence. Use before committing, when reviewing a diff, or when asked for a security or SEO audit.
allowed-tools: Read Grep Glob Bash(git diff *) Bash(git status *) Bash(npm run build) Bash(npx brclz check *) Bash(npx brclz print-config *) Bash(npx brclz audit-dist *)
---

1. Scope: read `git diff` (or the files named by the user) and the code around it.
2. Run `npx brclz check --strict`, then `npm run build` and `npx brclz audit-dist --strict`.
   Their output is the evidence for configuration, `_headers`, `_redirects`, Wrangler routes,
   canonical URLs, sitemap, robots.txt and CSP-blocked inline code.
3. Review what the tools cannot see:
   - CSP origins against the resources the changed pages actually load;
   - Worker code (`main`, `run_worker_first`): headers and Preview `noindex` set with
     `applyHeaders()` and precompiled rules (`brclz generate-header-rules`), without importing
     `site.config.mjs`;
   - analytics events and properties: allow-listed, no personal data, CSP origins matching the enabled providers;
   - accessibility of changed markup: headings, labels, focus, contrast, alt text;
   - secrets in code or client bundles.
4. Report each finding with `file:line` or command output, a concrete failure scenario and the
   fix, most severe first. State which commands ran; never claim a check passed without running
   it.
