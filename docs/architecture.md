# Architecture

## Scope

The package standardises what every site shares and must get right (canonical origin, security
headers, CSP, Preview isolation, Cloudflare routing settings, SEO consistency checks, analytics
privacy) and leaves content, components, integrations, Worker code and business rules to each site.

One ESM package with independent subpath exports and no build step. Browser code
(`posthog/client`) imports nothing else, so client bundles stay small; `headers/runtime` imports
nothing, so Workers stay small. One package rather than several because the modules share one
configuration object and are versioned together. JavaScript with JSDoc because consumers import
the files directly from git; `tsc` checks the implementation and generates `types/` (CI fails when
stale).

## Design decisions

| Decision | Reason | Rejected |
| --- | --- | --- |
| Native inheritance where it exists (Biome and TypeScript `extends`); Astro config spread into the project's `defineConfig()` | Debuggable with each tool's own docs; Astro's `mergeConfig()` result does not type-check with `defineConfig()` | Generating these files |
| `_headers` generated after `astro build` | No inheritance in `_headers`; CSP and Preview rules depend on site data | Hand-maintained `public/_headers` (drifts, breaks Preview `noindex`) |
| `_redirects` and Wrangler files project-owned and **checked**, not generated | They encode site history and routing; silently rewriting production routes is unsafe | Generating `wrangler.toml` (`generate-wrangler` stays opt-in for purely static Workers) |
| CSP as a directive object | Per-directive overrides and `$append`; analytics origins can be validated | Raw strings |
| Overriding a site-wide header on a path emits `! Name` + new value; overlapping custom rules setting the same header are rejected | Cloudflare joins repeated headers with `, `, so two CSPs would both be enforced | Relying on rule order (all matching rules apply) |
| `noindex` only on absolute Preview-host patterns; elsewhere needs `allowNoindex`; `/*` or the production host is refused | Production de-indexing cannot happen by accident | `robots.txt` `Disallow` (crawlers then never see `noindex`) |
| Strict schema, unknown keys are errors | A typo (`secruity`) would silently disable a setting | Permissive merge |
| Enabled analytics validated against the CSP | A provider whose origins the CSP blocks silently collects nothing | Documentation only |
| `baseAstroConfig` stops Astro inlining scripts and styles when the CSP forbids inline code | Astro inlines small assets by default | Loosening the CSP |

## Configuration semantics

Defaults are in `src/config.mjs`; `brclz print-config` shows the merged result and `brclz check`
prints warnings (`--strict` fails on them). Nothing reads environment variables, so a commit always
builds the same files. Precedence: package defaults, then `site.config.mjs`, then values derived by
`baseAstroConfig()` (project settings written after `...base` win), then per-path
`security.extraRules` for their URLs. `resolveHeaders(site, url)` returns the headers Cloudflare
would send for a URL.

| Override value | Result |
| --- | --- |
| absent / `undefined` | inherit the default |
| plain object | merged key by key, recursively |
| scalar or array | replaces the inherited value |
| `{ $append: [...] }` | appends to the inherited array (or starts one) |
| `{ $replace: value }` | replaces the inherited value, including whole objects |
| `null` | clears the value where the schema allows it |

Operators must be the only key of their object. Unknown keys, functions, class instances and
`__proto__`/`constructor`/`prototype` are rejected.

- `$append` on a CSP directive absent from the defaults starts a new list and does not copy the
  `default-src` fallback: list `'self'` explicitly the first time.
- `security.csp` is directive → sources (`[]` emits a value-less directive such as
  `upgrade-insecure-requests`); CSP and HSTS cannot be set as raw headers.
- `extraRules[].headers` replaces the site-wide value for matching URLs; `extraRules[].csp`
  overrides `security.csp` for that path with the same operators.
- HSTS is opt-in: `includeSubDomains` and `preload` affect every subdomain and are hard to undo.
- Valid `htmlHandling` per Astro URL style (the canonical URL must be served with 200;
  `preserve` and `ignore` are unchecked):

  | `buildFormat` | `trailingSlash` | `htmlHandling` |
  | --- | --- | --- |
  | `file` | `never` | `drop-trailing-slash` or `auto-trailing-slash` |
  | `file` | `always` | `force-trailing-slash` |
  | `directory` | `never` | `drop-trailing-slash` |
  | `directory` | `always` | `auto-trailing-slash` or `force-trailing-slash` |

`audit-dist` checks consistency (canonical, sitemap, robots, hreflang, JSON-LD, titles, inline
code blocked by the page's CSP, nothing indexable on the Preview domain). It is not a rendering,
structured-data or WCAG audit. `llms.txt` is optional and guarantees no ranking or AI citation.

## Generation lifecycle

1. `brclz check`: configuration, header generation, `_redirects`, Wrangler file.
2. `astro build`: Astro copies `public/` into `dist/`.
3. `brclz generate-headers`: writes `dist/_headers`, refusing to overwrite a file it did not
   generate. Workers Builds runs the project's build command, so this belongs in `npm run build`.
4. `brclz audit-dist`.
5. Preview deployment and HTTP checks, then production after approval.

## Cloudflare semantics relied upon

Verified against the official documentation on 2026-10-29:

- [`_headers`](https://developers.cloudflare.com/workers/static-assets/headers/): all matching
  rules apply; repeated names are joined with `, `; `! Name` detaches; max 100 rules, 2,000
  characters per line; placeholders do not match `.` in hosts; not applied to Worker-generated
  responses; redirects take priority.
- [`_redirects`](https://developers.cloudflare.com/workers/static-assets/redirects/): default
  status 302; 301/302/303/307/308 and 200 (same-site proxy); 2,000 static and 100 dynamic rules,
  1,000 characters per line; first match wins; no query or domain matching.
- [`html_handling`](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)
  maps `file.html` and `folder/index.html` to URLs.
- [Custom-domain Previews](https://developers.cloudflare.com/workers/previews/custom-domains/):
  `previews_enabled = true`, `enabled = false`; Cloudflare adds `X-Robots-Tag: noindex` only on
  workers.dev Previews.
- Wrangler keys are validated in tests against `wrangler/config-schema.json` (4.162.0) and with
  `wrangler deploy --dry-run`.

## Worker-generated responses

`_headers` and `_redirects` never apply to responses produced by Worker code (`main`,
`run_worker_first`). Such Workers apply the same headers from rules compiled at build time:

```json
"build": "astro build && brclz generate-headers && brclz generate-header-rules"
```

```ts
import { applyHeaders } from '@valentinbrclz/web-standards/headers/runtime';
import rules from '../.generated/header-rules.json' with { type: 'json' };

export default {
  async fetch(request, env) {
    if (isRetired(new URL(request.url))) return applyHeaders(new Response('Gone', { status: 410 }), rules, request.url);
    return env.ASSETS.fetch(request);
  },
};
```

Do not call `buildHeaderRules()` or import `site.config.mjs` or the site file in a Worker: they
pull the configuration, CSP and schema code and the whole site file into the bundle.
`brclz generate-header-rules --check` fails when the JSON is stale.

## Security and privacy

- **CSP.** The default blocks every third-party resource and inline code. Add only origins pages
  load and scope page-specific exceptions with `extraRules[].csp`; `cspReportOnly` helps staged
  rollouts. Framework islands (`client:*`) need inline bootstrap code, hence `'unsafe-inline'` or
  hashes.
- **Preview isolation.** Cloudflare adds `noindex` only to workers.dev Previews. For custom domains
  the generator emits it for `https://:preview.<previewDomain>/*` (also covering
  `<version>-<name>.<previewDomain>`) and `https://<previewDomain>/*`. Validation refuses a Preview
  domain containing the production host and `X-Robots-Tag` in site-wide headers. `noindex` is not
  access control: use Cloudflare Access for confidential Previews.
- **Analytics.** Every site has GA4 and/or Cloudflare Web Analytics. A provider is off until
  `enabled: true` and its CSP origins must be allowed. GA4 and Cloudflare keep the site's own
  loader; the standards only check origins and record the consent mode.
- **PostHog** (`posthog/client`):

  | Model | Before a decision | After `grant()` | After `deny()` |
  | --- | --- | --- | --- |
  | `opt-in` | SDK not loaded, nothing sent | SDK loaded, one `$pageview`, allow-listed events | `reset()` then opt-out; refusal remembered |
  | `cookieless` | Cookieless mode; not started under Global Privacy Control or Do Not Track | none | as above |

  Nothing runs outside the production hostname; query strings and fragments are stripped from URL
  properties; event properties are short snake_case values without e-mail-like or URL values;
  autocapture, recordings, surveys, heatmaps, feature flags and remote scripts are disabled, so
  `connect-src` needs only the ingestion host. The decision and opt-in flag live in localStorage
  (no cookies with `persistence: 'memory'`). Set in the PostHog project: region, IP discarding,
  cookieless mode when used (otherwise events are dropped), retention. posthog-js ignores
  detected bots, including automated test browsers.
- **Repository and CI.** Actions pinned to commit SHAs, `permissions: contents: read`,
  `persist-credentials: false`, inputs through environment variables, no secrets; `zizmor` and
  `actionlint` check the workflows; Dependabot uses a 7-day cooldown. The Claude Code settings
  template denies reading secret files and asks before deploys, secrets and `npm publish`; these
  rules guide the agent and are not a security boundary.
