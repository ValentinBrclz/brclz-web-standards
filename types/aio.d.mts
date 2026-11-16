/**
 * Optional AI-discoverability helpers. llms.txt (https://llmstxt.org) is an informal proposal:
 * no search engine requires it and it guarantees no ranking or citation. Content must come from
 * the same source data as the HTML pages.
 */
export type LlmsLink = {
    label: string;
    path: string;
    description?: string;
};
export type LlmsSection = {
    title: string;
    links: LlmsLink[];
};
/**
 * @typedef {{ label: string, path: string, description?: string }} LlmsLink
 * @typedef {{ title: string, links: LlmsLink[] }} LlmsSection
 */
/**
 * Builds an llms.txt document (H1, summary, then sections of links) from explicit data.
 * @param {{ name: string, summary: string, productionUrl: string, details?: string, pages?: LlmsLink[], sections?: LlmsSection[], allowExternal?: boolean }} input
 */
export declare function generateLlmsTxt({ name, summary, productionUrl, details, pages, sections, allowExternal, }: {
    name: string;
    summary: string;
    productionUrl: string;
    details?: string;
    pages?: LlmsLink[];
    sections?: LlmsSection[];
    allowExternal?: boolean;
}): string;
export type RobotsGroup = {
    userAgents: string[];
    allow?: string[];
    disallow?: string[];
    /**
     * e.g. "search=yes, ai-input=yes, ai-train=no" (Cloudflare Content Signals proposal)
     */
    contentSignal?: string;
    comment?: string;
};
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
export declare function generateRobotsTxt({ productionUrl, sitemapPath, groups }: {
    productionUrl: string;
    sitemapPath?: string | null;
    groups?: RobotsGroup[];
}): string;
