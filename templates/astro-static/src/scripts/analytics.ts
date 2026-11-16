import { createPostHogConsent } from '@valentinbrclz/web-standards/posthog/client';

// Requires `npm install posthog-js`. Nothing is loaded before consent (opt-in model) and
// nothing runs outside the production hostname.
const element = document.getElementById('analytics-config');
if (element?.textContent) {
  const consent = createPostHogConsent(JSON.parse(element.textContent));
  // Wire these to the site's own consent banner and privacy page.
  document
    .querySelector('[data-analytics-accept]')
    ?.addEventListener('click', () => void consent.grant());
  document
    .querySelector('[data-analytics-refuse]')
    ?.addEventListener('click', () => consent.deny());
  window.dispatchEvent(new CustomEvent('analytics:ready', { detail: consent }));
}
