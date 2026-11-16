// Static assets plus a Worker script (for example answering retired URLs with 410 and a cron
// trigger). The project keeps its own wrangler.toml with `main`, `run_worker_first` and crons:
// `brclz generate-wrangler` refuses it and `brclz check` compares it instead. The Worker applies
// the same headers to its own responses with applyHeaders() and the rules written by
// `brclz generate-header-rules` (docs/architecture.md).

/** @type {import('@valentinbrclz/web-standards/config').SiteOverrides} */
export default {
  identity: {
    name: 'Example Event',
    productionUrl: 'https://example.net',
    previewDomain: 'dev.example.net',
    language: 'en',
  },
  cloudflare: { workerName: 'net-example', compatibilityDate: '2026-10-26' },
  security: {
    csp: {
      'img-src': ["'self'", 'data:'],
      'media-src': ["'self'", 'https://media.example.net'],
    },
    // Only after auditing every subdomain: includeSubDomains and preload are hard to undo.
    hsts: 'max-age=31536000; includeSubDomains; preload',
    extraRules: [
      {
        path: '/',
        headers: {
          Link: '</llms.txt>; rel="describedby"; type="text/plain", </sitemap.xml>; rel="sitemap"; type="application/xml"',
        },
      },
    ],
  },
};
