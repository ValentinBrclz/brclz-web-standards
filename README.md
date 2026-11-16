# Brclz Web Standards

Shared configuration and checks for **Astro static sites on Cloudflare Workers Static Assets**.
One `site.config.mjs` per site drives the Astro base configuration and the generated `_headers`
(security headers, CSP, Preview `noindex`, caching). The `brclz` CLI also validates `_redirects`
and the Wrangler file, audits the build for SEO consistency and scaffolds new sites.

Status: 0.3.0, pre-1.0. Read the limitations below before production use.

## Quick start

```bash
# New site (Node.js >= 26)
npx --yes github:ValentinBrclz/brclz-web-standards init my-site --name "My site" --url https://www.example.com

# Existing site
npm install --save-dev "github:ValentinBrclz/brclz-web-standards"
```

Run `npx brclz --help` for the commands and options, and see `examples/` for site configurations.
Exports are listed in `package.json`; types are generated from JSDoc into `types/`.

## Documentation

- [Guide](docs/guide.md): adopt in an existing site, update, versioning, CI, troubleshooting
- [Architecture](docs/architecture.md): design decisions, configuration semantics, Cloudflare
  behaviour, Worker responses, security and privacy

## Limitations

- Static output only. Worker-generated responses need `applyHeaders()` in the Worker.
- `resolveHeaders()` emulates Cloudflare's documented `_headers` rules. Host-based rules
  (Preview `noindex`) cannot be exercised by `wrangler dev`; check them on a real Preview.
- `audit-dist` is a consistency check, not an HTML parser, structured-data validator, WCAG audit
  or ranking tool.
- DNS, Redirect Rules, WAF, Access, Web Analytics and PostHog project settings stay in dashboards.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). `npm ci && npm run verify`; `npm run test:smoke` (network)
covers init, install, build, e2e and Wrangler. License: [MIT](LICENSE).
