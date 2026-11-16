// Bilingual site with directory URLs and a trailing slash, HSTS, static search, Cloudflare Web
// Analytics, and a third-party booking widget allowed only on the two pages that embed it.
// tests/migration.test.mjs proves it reproduces tests/fixtures/handwritten/_headers.
const widget = 'https://booking.example.org';
// Same override for both language versions of the page.
const widgetCsp = {
  'script-src': { $append: [widget] },
  'connect-src': { $append: [widget] },
  'img-src': { $append: [widget] },
  'frame-src': [widget],
  'form-action': { $append: [widget] },
};

/** @type {import('@valentinbrclz/web-standards/config').SiteOverrides} */
export default {
  identity: {
    name: 'Example Foundation',
    productionUrl: 'https://www.example.org',
    previewDomain: 'dev.example.org',
    language: 'fr',
  },
  astro: { buildFormat: 'directory', trailingSlash: 'always' },
  cloudflare: {
    workerName: 'org-example',
    compatibilityDate: '2026-10-26',
    htmlHandling: 'auto-trailing-slash',
  },
  security: {
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin' },
    csp: {
      // 'wasm-unsafe-eval': Pagefind search runs WebAssembly.
      'script-src': ["'self'", "'wasm-unsafe-eval'", 'https://static.cloudflareinsights.com'],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'", 'https://cloudflareinsights.com'],
      'upgrade-insecure-requests': [],
    },
    hsts: 'max-age=31536000',
    previewRobotsTag: 'noindex, nofollow',
    extraRules: [
      { path: '/llms.txt', headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      { path: '/documents/*', headers: { 'Cache-Control': 'public, max-age=86400' } },
      {
        path: '/pagefind/fragment/*',
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      },
      {
        path: '/pagefind/index/*',
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      },
      { path: '/fr/reserver/', csp: widgetCsp },
      { path: '/en/book/', csp: widgetCsp },
    ],
  },
  aio: { llmsTxt: true },
  analytics: {
    cloudflareWebAnalytics: { enabled: true },
  },
};
