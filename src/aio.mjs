/**
 * Optional AI-discoverability helpers. llms.txt (https://llmstxt.org) is an informal proposal:
 * no search engine requires it and it guarantees no ranking or citation. Content must come from
 * the same source data as the HTML pages.
 */

/** @param {string} value @param {string} field */
function singleLine(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  if (/[\r\n]/.test(value)) throw new Error(`${field} must be a single line`);
  return value.trim();
}

/** @param {string} text */
const escapeLabel = (text) => text.replace(/[[\]\\]/g, '\\$&');

/**
 * @typedef {{ label: string, path: string, description?: string }} LlmsLink
 * @typedef {{ title: string, links: LlmsLink[] }} LlmsSection
 */

/**
 * Builds an llms.txt document (H1, summary, then sections of links) from explicit data.
 * @param {{ name: string, summary: string, productionUrl: string, details?: string, pages?: LlmsLink[], sections?: LlmsSection[], allowExternal?: boolean }} input
 */
export function generateLlmsTxt({
  name,
  summary,
  productionUrl,
  details,
  pages = [],
  sections = [],
  allowExternal = false,
}) {
  const origin = new URL(productionUrl);
  if (origin.protocol !== 'https:') throw new Error('HTTPS origin required');
  const all = [...(pages.length ? [{ title: 'Pages', links: pages }] : []), ...sections];
  const body = all.map((section, s) => {
    const title = singleLine(section.title, `sections[${s}].title`);
    const links = section.links.map((link, i) => {
      const at = `${title} link ${i + 1}`;
      const label = singleLine(link.label, `${at} label`);
      if (!link.path) throw new Error(`${at}: path is required`);
      const url = new URL(link.path, origin);
      if (url.origin !== origin.origin && !allowExternal)
        throw new Error(`External link not allowed in llms.txt: ${link.path} (set allowExternal)`);
      const description =
        link.description === undefined
          ? ''
          : `: ${singleLine(link.description, `${at} description`)}`;
      return `- [${escapeLabel(label)}](${url.toString()})${description}`;
    });
    return `## ${title}\n\n${links.join('\n')}`;
  });
  const intro = details ? `\n\n${details.trim()}` : '';
  return `# ${singleLine(name, 'name')}\n\n> ${singleLine(summary, 'summary')}${intro}\n\n${body.join('\n\n')}\n`;
}

/**
 * @typedef {object} RobotsGroup
 * @property {string[]} userAgents
 * @property {string[]} [allow]
 * @property {string[]} [disallow]
 * @property {string} [contentSignal] e.g. "search=yes, ai-input=yes, ai-train=no" (Cloudflare Content Signals proposal)
 * @property {string} [comment]
 */

/**
 * Generates a production robots.txt. Default: allow every crawler and reference the sitemap.
 * Crawler-specific policies are explicit groups: nothing is blocked implicitly.
 * @param {{ productionUrl: string, sitemapPath?: string | null, groups?: RobotsGroup[] }} options
 */
export function generateRobotsTxt({ productionUrl, sitemapPath = '/sitemap-index.xml', groups }) {
  const origin = new URL(productionUrl);
  if (origin.protocol !== 'https:') throw new Error('HTTPS origin required');
  const list = groups ?? [{ userAgents: ['*'], allow: ['/'] }];
  if (!list.some((g) => g.userAgents.includes('*')))
    throw new Error('robots.txt needs a "User-agent: *" group');
  const blocks = list.map((group, i) => {
    if (!group.userAgents.length) throw new Error(`groups[${i}]: userAgents is empty`);
    const lines = [];
    if (group.comment) lines.push(...group.comment.split('\n').map((l) => `# ${l}`));
    for (const agent of group.userAgents)
      lines.push(`User-agent: ${singleLine(agent, `groups[${i}].userAgents`)}`);
    if (group.contentSignal)
      lines.push(
        `Content-Signal: ${singleLine(group.contentSignal, `groups[${i}].contentSignal`)}`,
      );
    for (const path of group.allow ?? []) lines.push(`Allow: ${singleLine(path, 'allow')}`);
    for (const path of group.disallow ?? [])
      lines.push(`Disallow: ${singleLine(path, 'disallow')}`);
    if (!group.allow?.length && !group.disallow?.length) lines.push('Allow: /');
    return lines.join('\n');
  });
  const all = list.find((g) => g.userAgents.includes('*'));
  if (all?.disallow?.includes('/'))
    throw new Error(
      '"User-agent: *" must not disallow "/" on production; keep Previews out with X-Robots-Tag instead',
    );
  const sitemap = sitemapPath ? `\n\nSitemap: ${new URL(sitemapPath, origin).toString()}` : '';
  return `${blocks.join('\n\n')}${sitemap}\n`;
}
