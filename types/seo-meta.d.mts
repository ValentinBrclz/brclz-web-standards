/**
 * Pure helpers for page metadata and JSON-LD. They never invent values: every field comes from
 * the caller, and URLs are forced onto the production origin with the site's trailing-slash
 * policy so canonical URLs match what Cloudflare serves.
 */
/**
 * Canonical URL of `path` on the production origin.
 * @param {{ identity: { productionUrl: string | null }, astro?: { trailingSlash?: string }, cloudflare?: { htmlHandling?: string } } | string} siteOrOrigin
 *   a resolved site (applies `astro.trailingSlash` and drops `.html`, as Workers Static Assets
 *   does) or a bare production origin (path kept as is)
 * @param {string} [path]
 */
export declare function canonicalUrl(siteOrOrigin: {
    identity: {
        productionUrl: string | null;
    };
    astro?: {
        trailingSlash?: string;
    };
    cloudflare?: {
        htmlHandling?: string;
    };
} | string, path?: string): string;
/**
 * Title, description, canonical URL, robots and Open Graph fields for a page. Nothing is
 * defaulted from the content: `title` and `description` are required.
 * @param {{ productionUrl?: string, site?: Parameters<typeof canonicalUrl>[0], path?: string, title: string, description: string, robots?: string, image?: string, type?: string, locale?: string }} options
 */
export declare function buildPageMeta({ productionUrl, site, path, title, description, robots, image, type, locale, }: {
    productionUrl?: string;
    site?: Parameters<typeof canonicalUrl>[0];
    path?: string;
    title: string;
    description: string;
    robots?: string;
    image?: string;
    type?: string;
    locale?: string;
}): {
    title: string;
    description: string;
    canonical: string;
    robots: string;
    og: Record<string, string>;
};
/**
 * schema.org Organization built only from explicit facts.
 * @param {{ name: string, url: string, id?: string, description?: string, logo?: string, sameAs?: string[] }} facts
 */
export declare function organizationJsonLd({ name, url, id, description, logo, sameAs }: {
    name: string;
    url: string;
    id?: string;
    description?: string;
    logo?: string;
    sameAs?: string[];
}): {
    '@context': string;
    '@type': string;
    '@id'?: string | undefined;
    name: string;
    url: string;
    description?: string | undefined;
    logo?: string | undefined;
    sameAs?: string[] | undefined;
};
/**
 * Serialises JSON-LD for `<script type="application/ld+json" set:html={...}>`, escaping "<"
 * so the payload can never close the script element.
 * @param {unknown} data
 */
export declare function jsonLdScript(data: unknown): string;
