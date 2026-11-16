// Plain static site: every value not listed here is the shared default (file URLs without a
// trailing slash, strict same-origin CSP, no analytics).

/** @type {import('@valentinbrclz/web-standards/config').SiteOverrides} */
export default {
  identity: {
    name: 'Example',
    productionUrl: 'https://www.example.com',
    previewDomain: 'dev.example.com',
    language: 'fr-CH',
  },
  cloudflare: { workerName: 'com-example', compatibilityDate: '2026-10-26' },
};
