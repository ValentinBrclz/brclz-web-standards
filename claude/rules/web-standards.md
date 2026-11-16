# Web standards

- The domain has one source. If the project already authors it (for example `site.yaml`), run
  `brclz sync-site-file` and import the generated `site.generated.json` in `site.config.mjs`
  with `httpsOrigin()` from `@valentinbrclz/web-standards/config`: Workers bundle that file and
  cannot read YAML, so never call `readSiteFile()` there. Do not copy the domain, and do not set
  `site`, `trailingSlash` or `build.format` in `astro.config.*` (`brclz check` fails on them, and
  on a stale `site.generated.json`).
- Change headers, CSP, HSTS and Preview settings in `site.config.mjs`. `dist/_headers` is
  generated after `astro build`; never add `public/_headers`.
- Add a CSP origin only for a resource the site loads, and scope page-specific exceptions with
  `security.extraRules[].csp`.
- Preview hosts get `X-Robots-Tag: noindex` from the generated `_headers`; production must
  stay indexable. Never hide Previews with `Disallow: /` in robots.txt.
- `_headers` and `_redirects` do not apply to responses produced by Worker code: use
  `applyHeaders()` from `@valentinbrclz/web-standards/headers/runtime` there, with the rules
  written by `brclz generate-header-rules`. Never call `buildHeaderRules()` in a Worker.
- `wrangler.toml` is project-owned: keep `workers_dev = false`, Preview routes with
  `previews_enabled = true` and `enabled = false`. Never deploy to production without approval.
- Analytics (GA4 and/or Cloudflare Web Analytics at least) is part of every site: enable the
  provider in `site.config.mjs` and keep its CSP origins in sync; send only allow-listed events
  without personal data.
