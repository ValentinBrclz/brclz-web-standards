// Generic profile with PostHog behind explicit opt-in consent (EU region). The project key is
// public by design (it can only send events); never put a personal API key here.

/** @type {import('@valentinbrclz/web-standards/config').SiteOverrides} */
export default {
  identity: {
    name: 'Example',
    productionUrl: 'https://www.example.com',
    previewDomain: 'dev.example.com',
    language: 'en',
  },
  security: {
    // posthog-js is bundled into /_astro (script-src 'self'); only its ingestion host is added.
    csp: { 'connect-src': ["'self'", 'https://eu.i.posthog.com'] },
  },
  analytics: {
    posthog: {
      enabled: true,
      consent: 'opt-in',
      projectKey: 'phc_exampleexampleexample',
      events: ['outbound_link_click', 'download_click'],
    },
  },
};
