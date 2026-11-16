/**
 * Site configuration: defaults, override semantics and validation.
 *
 * Merge rules (see docs/architecture.md):
 * - plain objects merge recursively;
 * - scalars and arrays replace the inherited value;
 * - `{ $append: [...] }` appends to an inherited array, `{ $replace: value }` replaces anything;
 * - `undefined` inherits, `null` clears (where the schema allows it).
 */
import { cspAllows, effectiveSources, serializeCsp, unknownDirective } from './csp.mjs';
import { validate } from './schema.mjs';

/**
 * @typedef {import('./csp.mjs').CspDirectives} CspDirectives
 *
 * @typedef {object} HeaderRule
 * @property {string} path `_headers` URL pattern (`/path/*` or `https://host/*`).
 * @property {Record<string, string | null>} [headers] Header values; `null` only detaches.
 * @property {boolean} [allowNoindex] Acknowledges a deliberate production `X-Robots-Tag: noindex`.
 * @property {Override<CspDirectives> | null} [csp] Override of `security.csp` for this pattern (same merge operators); `null` removes the CSP.
 *
 * @typedef {object} SiteConfig
 * @property {'astro-static'} preset
 * @property {{ name: string, productionUrl: string, previewDomain: string | null, language: string | null }} identity
 * @property {{ buildFormat: 'file' | 'directory' | 'preserve', trailingSlash: 'never' | 'always' | 'ignore' }} astro
 * @property {{ workerName: string | null, compatibilityDate: string | null, workersDev: boolean, previewUrls: boolean, assetsDirectory: string, htmlHandling: 'auto-trailing-slash' | 'force-trailing-slash' | 'drop-trailing-slash' | 'none', notFoundHandling: '404-page' | 'single-page-application' | 'none' }} cloudflare
 * @property {{ headers: Record<string, string | null>, csp: CspDirectives | null, cspReportOnly: boolean, hsts: string | null, previewNoindex: boolean, previewRobotsTag: string, immutableAstroAssets: boolean, extraRules: HeaderRule[] }} security
 * @property {{ sitemap: boolean, canonical: boolean, robotsTxt: boolean }} seo
 * @property {{ llmsTxt: boolean }} aio
 * @property {AnalyticsConfig} analytics
 *
 * @typedef {object} AnalyticsConfig
 * @property {PostHogConfig} posthog
 * @property {{ enabled: boolean, consent: 'opt-in' | 'not-required' }} ga4
 * @property {{ enabled: boolean }} cloudflareWebAnalytics
 *
 * @typedef {object} PostHogConfig
 * @property {boolean} enabled
 * @property {'opt-in' | 'cookieless'} consent
 * @property {'eu' | 'us'} region
 * @property {string | null} apiHost Custom ingestion origin (reverse proxy); defaults to the region host.
 * @property {string | null} projectKey Public project API key (`phc_…`).
 * @property {'memory' | 'localStorage' | 'localStorage+cookie'} persistence Persistence after opt-in.
 * @property {boolean} capturePageview
 * @property {string[]} events Allowed custom event names; anything else is dropped.
 *
 * @typedef {{ [K in Exclude<keyof SiteConfig, 'identity'>]?: Override<SiteConfig[K]> } & { identity: { [K in keyof SiteConfig['identity']]?: SiteConfig['identity'][K] } & { name: string, productionUrl: string } }} SiteOverrides
 *   What a project's site.config.mjs exports.
 */

/**
 * A partial value that may use the merge operators.
 * @template T
 * @typedef {T extends readonly (infer U)[] ? T | { $append: U[] } | { $replace: T } : T extends object ? { [K in keyof T]?: Override<T[K]> } | { $replace: T } : T | { $replace: T }} Override
 */

const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
/** @param {unknown} value @returns {value is Record<string, any>} */
const isObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** @param {unknown} value @param {string} path */
function assertPlainData(value, path) {
  if (value === null || value === undefined) return;
  const t = typeof value;
  if (t === 'string' || t === 'boolean' || (t === 'number' && Number.isFinite(value))) return;
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) assertPlainData(v, `${path}[${i}]`);
    return;
  }
  if (!isObject(value))
    throw new Error(
      `${path || '(root)'}: only plain data is allowed in site configuration (got ${t === 'object' ? Object.prototype.toString.call(value) : t})`,
    );
  for (const [key, child] of Object.entries(value)) {
    if (unsafeKeys.has(key))
      throw new Error(`Unsafe configuration key: ${path ? `${path}.` : ''}${key}`);
    assertPlainData(child, path ? `${path}.${key}` : key);
  }
}

/**
 * Deep merge without mutating either argument.
 * @template T
 * @param {T} base
 * @param {unknown} override
 * @param {string} [path]
 * @returns {T}
 */
export function mergeSettings(base, override, path = '') {
  if (!path) assertPlainData(override, '');
  if (override === undefined) return structuredClone(base);
  if (isObject(override) && ('$replace' in override || '$append' in override)) {
    const keys = Object.keys(override);
    if (keys.length !== 1)
      throw new Error(`${path || '(root)'}: $replace/$append must be the only key in its object`);
    if ('$replace' in override) return structuredClone(override.$replace);
    if (!Array.isArray(override.$append))
      throw new Error(`${path || '(root)'}: $append requires an array`);
    if (base !== undefined && base !== null && !Array.isArray(base))
      throw new Error(
        `${path || '(root)'}: $append can only extend an array (inherited value is ${typeof base})`,
      );
    return /** @type {T} */ ([
      ...(Array.isArray(base) ? structuredClone(base) : []),
      ...structuredClone(override.$append),
    ]);
  }
  if (!isObject(base) || !isObject(override)) return /** @type {T} */ (structuredClone(override));
  /** @type {Record<string, any>} */
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    result[key] = mergeSettings(result[key], value, path ? `${path}.${key}` : key);
  }
  return /** @type {T} */ (result);
}

/** @template T @param {T} value @returns {T} */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** @type {Readonly<Omit<SiteConfig, 'identity'> & { identity: { name: null, productionUrl: null, previewDomain: null, language: null } }>} */
export const defaults = deepFreeze({
  preset: 'astro-static',
  identity: { name: null, productionUrl: null, previewDomain: null, language: null },
  astro: { buildFormat: 'file', trailingSlash: 'never' },
  cloudflare: {
    workerName: null,
    compatibilityDate: null,
    workersDev: false,
    previewUrls: false,
    assetsDirectory: './dist',
    htmlHandling: 'drop-trailing-slash',
    notFoundHandling: '404-page',
  },
  security: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'X-Frame-Options': 'DENY',
    },
    csp: {
      'default-src': ["'self'"],
      'base-uri': ["'self'"],
      'object-src': ["'none'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
    },
    cspReportOnly: false,
    hsts: null,
    previewNoindex: true,
    previewRobotsTag: 'noindex',
    immutableAstroAssets: true,
    extraRules: [],
  },
  seo: { sitemap: true, canonical: true, robotsTxt: true },
  aio: { llmsTxt: false },
  analytics: {
    posthog: {
      enabled: false,
      consent: 'opt-in',
      region: 'eu',
      apiHost: null,
      projectKey: null,
      persistence: 'memory',
      capturePageview: true,
      events: [],
    },
    ga4: { enabled: false, consent: 'opt-in' },
    cloudflareWebAnalytics: { enabled: false },
  },
});

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
/** @param {string} v */
const noNewline = (v) => (/[\r\n]/.test(v) ? 'must not contain line breaks' : undefined);

/** @type {import('./schema.mjs').SchemaNode} */
const headerMap = {
  type: 'map',
  values: { type: 'string', nullable: true, check: noNewline },
  check: (map) => {
    const bad = Object.keys(map).find((k) => !HEADER_NAME.test(k));
    if (bad) return `invalid header name ${JSON.stringify(bad)}`;
    const lower = Object.keys(map).map((k) => k.toLowerCase());
    const dup = lower.find((k, i) => lower.indexOf(k) !== i);
    if (dup) return `header "${dup}" is defined twice with different casing`;
    if (
      lower.includes('content-security-policy') ||
      lower.includes('content-security-policy-report-only')
    )
      return 'set the policy with security.csp (directive object), not as a raw header';
    if (lower.includes('strict-transport-security')) return 'set HSTS with security.hsts';
    return undefined;
  },
};

/** @type {import('./schema.mjs').SchemaNode} */
const schema = {
  type: 'object',
  props: {
    preset: { type: 'string', enum: ['astro-static'] },
    identity: {
      type: 'object',
      props: {
        name: {
          type: 'string',
          nullable: true,
          check: (v) => (v.trim() ? undefined : 'must not be empty'),
        },
        productionUrl: { type: 'string', nullable: true },
        previewDomain: {
          type: 'string',
          nullable: true,
          pattern: HOSTNAME,
          hint: 'Use a bare lowercase hostname such as "dev.example.com"',
        },
        language: {
          type: 'string',
          nullable: true,
          pattern: /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/,
          hint: 'Use a BCP 47 tag such as "fr-CH"',
        },
      },
    },
    astro: {
      type: 'object',
      props: {
        buildFormat: { type: 'string', enum: ['file', 'directory', 'preserve'] },
        trailingSlash: { type: 'string', enum: ['never', 'always', 'ignore'] },
      },
    },
    cloudflare: {
      type: 'object',
      props: {
        workerName: {
          type: 'string',
          nullable: true,
          pattern: /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
          hint: 'Worker names use lowercase letters, digits and inner dashes (max 63)',
        },
        compatibilityDate: { type: 'string', nullable: true, check: checkDate },
        workersDev: { type: 'boolean' },
        previewUrls: { type: 'boolean' },
        assetsDirectory: {
          type: 'string',
          check: (v) => (v.trim() ? undefined : 'must not be empty'),
        },
        htmlHandling: {
          type: 'string',
          enum: ['auto-trailing-slash', 'force-trailing-slash', 'drop-trailing-slash', 'none'],
        },
        notFoundHandling: { type: 'string', enum: ['404-page', 'single-page-application', 'none'] },
      },
    },
    security: {
      type: 'object',
      props: {
        headers: headerMap,
        csp: {
          type: 'map',
          nullable: true,
          values: { type: 'array', nullable: true, values: { type: 'string' } },
          check: unknownDirective,
        },
        cspReportOnly: { type: 'boolean' },
        hsts: {
          type: 'string',
          nullable: true,
          pattern: /^max-age=\d+(?:; ?includeSubDomains)?(?:; ?preload)?$/,
          hint: 'Expected e.g. "max-age=31536000" or "max-age=63072000; includeSubDomains; preload"',
        },
        previewNoindex: { type: 'boolean' },
        previewRobotsTag: {
          type: 'string',
          pattern: /^(?=.*\bnoindex\b)[a-z0-9 ,:-]+$/i,
          hint: 'Must contain "noindex"',
        },
        immutableAstroAssets: { type: 'boolean' },
        extraRules: {
          type: 'array',
          values: {
            type: 'object',
            props: {
              path: { type: 'string' },
              headers: {
                ...headerMap,
                check: (map) =>
                  headerMap
                    .check?.(map)
                    ?.replace('security.csp (directive object)', 'the rule\'s "csp" key'),
              },
              allowNoindex: { type: 'boolean' },
              csp: {
                type: 'map',
                nullable: true,
                values: { type: 'any' },
                check: unknownDirective,
              },
            },
            check: (rule) =>
              typeof rule.path === 'string' && (rule.headers || rule.csp !== undefined)
                ? undefined
                : 'each rule needs "path" and "headers" and/or "csp"',
          },
        },
      },
    },
    seo: {
      type: 'object',
      props: {
        sitemap: { type: 'boolean' },
        canonical: { type: 'boolean' },
        robotsTxt: { type: 'boolean' },
      },
    },
    aio: { type: 'object', props: { llmsTxt: { type: 'boolean' } } },
    analytics: {
      type: 'object',
      props: {
        posthog: {
          type: 'object',
          props: {
            enabled: { type: 'boolean' },
            consent: { type: 'string', enum: ['opt-in', 'cookieless'] },
            region: { type: 'string', enum: ['eu', 'us'] },
            apiHost: { type: 'string', nullable: true },
            projectKey: {
              type: 'string',
              nullable: true,
              pattern: /^phc_[A-Za-z0-9]+$/,
              hint: 'Use the public project API key (phc_…), never a personal API key',
            },
            persistence: {
              type: 'string',
              enum: ['memory', 'localStorage', 'localStorage+cookie'],
            },
            capturePageview: { type: 'boolean' },
            events: {
              type: 'array',
              values: {
                type: 'string',
                pattern: /^[a-z][a-z0-9_]{0,63}$/,
                hint: 'Use snake_case event names',
              },
            },
          },
        },
        ga4: {
          type: 'object',
          props: {
            enabled: { type: 'boolean' },
            consent: { type: 'string', enum: ['opt-in', 'not-required'] },
          },
        },
        cloudflareWebAnalytics: { type: 'object', props: { enabled: { type: 'boolean' } } },
      },
    },
  },
};

/** @param {string} value */
function checkDate(value) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    return 'must be a real date in YYYY-MM-DD format';
  return undefined;
}

/** Valid combinations of Astro output and Workers html_handling (canonical URL is served with 200). */
const HTML_HANDLING = {
  file: { never: ['drop-trailing-slash', 'auto-trailing-slash'], always: ['force-trailing-slash'] },
  directory: {
    never: ['drop-trailing-slash'],
    always: ['force-trailing-slash', 'auto-trailing-slash'],
  },
};

/**
 * Analytics endpoints that must be allowed by the CSP of a page that loads the provider.
 * @param {Pick<SiteConfig, 'analytics'>} site
 */
export function analyticsCspRequirements(site) {
  /** @type {{ provider: string, directive: string, url: string }[]} */
  const requirements = [];
  const { posthog, ga4, cloudflareWebAnalytics } = site.analytics;
  if (posthog.enabled)
    requirements.push({
      provider: 'posthog',
      directive: 'connect-src',
      url: posthogApiHost(posthog),
    });
  if (ga4.enabled) {
    requirements.push({
      provider: 'ga4',
      directive: 'script-src-elem',
      url: 'https://www.googletagmanager.com/gtag/js',
    });
    requirements.push({
      provider: 'ga4',
      directive: 'connect-src',
      url: 'https://region1.google-analytics.com/g/collect',
    });
  }
  if (cloudflareWebAnalytics.enabled) {
    requirements.push({
      provider: 'cloudflareWebAnalytics',
      directive: 'script-src-elem',
      url: 'https://static.cloudflareinsights.com/beacon.min.js',
    });
    requirements.push({
      provider: 'cloudflareWebAnalytics',
      directive: 'connect-src',
      url: 'https://cloudflareinsights.com/cdn-cgi/rum',
    });
  }
  return requirements;
}

/**
 * Ingestion origin: the custom `apiHost`, else the regional PostHog host.
 * @param {Pick<PostHogConfig, 'apiHost' | 'region'>} posthog
 * @returns {string}
 */
export function posthogApiHost(posthog) {
  return (
    posthog.apiHost ??
    (posthog.region === 'us' ? 'https://us.i.posthog.com' : 'https://eu.i.posthog.com')
  );
}

/**
 * Validates a fully merged configuration and throws one error listing every problem.
 * @param {unknown} config
 * @returns {SiteConfig}
 */
export function validateSite(config) {
  /** @type {string[]} */
  const errors = [];
  validate(schema, config, '', errors);
  const site = /** @type {SiteConfig} */ (config);
  const identity = site?.identity;
  if (!identity?.name) errors.push('identity.name: required');
  let production;
  if (!identity?.productionUrl)
    errors.push('identity.productionUrl: required (e.g. "https://example.com")');
  else if (typeof identity.productionUrl === 'string') {
    try {
      production = new URL(identity.productionUrl);
      if (
        production.protocol !== 'https:' ||
        production.username ||
        production.password ||
        production.port ||
        production.search ||
        production.hash ||
        production.pathname !== '/'
      )
        errors.push(
          'identity.productionUrl: must be a bare HTTPS origin such as "https://example.com" (no path, port, query or credentials)',
        );
      else if (identity.productionUrl.replace(/\/$/, '') !== production.origin)
        errors.push(`identity.productionUrl: use the normalised origin "${production.origin}"`);
    } catch {
      errors.push('identity.productionUrl: not a valid URL');
    }
  }
  const preview = identity?.previewDomain;
  if (production && typeof preview === 'string') {
    const host = production.hostname;
    if (preview === host || host.endsWith(`.${preview}`))
      errors.push(
        `identity.previewDomain: "${preview}" contains the production host ${host}; noindex rules would reach production`,
      );
  }
  const cf = site?.cloudflare;
  const astro = site?.astro;
  const format = /** @type {'file'} */ (astro?.buildFormat);
  const slash = /** @type {'never'} */ (astro?.trailingSlash);
  const allowed = HTML_HANDLING[format]?.[slash];
  if (allowed && cf && !allowed.includes(cf.htmlHandling))
    errors.push(
      `cloudflare.htmlHandling: "${cf.htmlHandling}" does not serve Astro buildFormat "${astro.buildFormat}" with trailingSlash "${astro.trailingSlash}" at its canonical URL; use ${allowed.map((v) => `"${v}"`).join(' or ')}`,
    );
  // Cloudflare adds noindex to workers.dev Preview URLs, but a production workers.dev host
  // serves a second, indexable copy of the site.
  if (cf?.workersDev === true)
    errors.push(
      'cloudflare.workersDev: must stay false; a public workers.dev hostname duplicates production content',
    );

  const security = site?.security;
  if (
    security?.csp &&
    typeof security.csp === 'object' &&
    !errors.some((e) => e.startsWith('security.csp'))
  ) {
    try {
      serializeCsp(security.csp);
    } catch (error) {
      errors.push(`security.csp: ${/** @type {Error} */ (error).message}`);
    }
  }

  const analytics = site?.analytics;
  if (analytics?.posthog && analytics.ga4 && analytics.cloudflareWebAnalytics) {
    const ph = analytics.posthog;
    if (ph.enabled) {
      if (!ph.projectKey)
        errors.push('analytics.posthog.projectKey: required when PostHog is enabled');
      if (ph.consent === 'cookieless' && ph.persistence !== 'memory')
        errors.push(
          'analytics.posthog.persistence: cookieless consent cannot use browser storage; use "memory"',
        );
    }
    if (typeof ph.apiHost === 'string') {
      try {
        const u = new URL(ph.apiHost);
        if (u.protocol !== 'https:' || u.search || u.hash || u.username)
          errors.push(
            'analytics.posthog.apiHost: must be an HTTPS URL without query, hash or credentials',
          );
      } catch {
        errors.push('analytics.posthog.apiHost: not a valid URL');
      }
    }
    if (!errors.length && site.security.csp && production) {
      /** @type {[string, CspDirectives | null][]} */
      const policies = [['security.csp', site.security.csp]];
      site.security.extraRules.forEach((rule, i) => {
        if (rule.csp) {
          try {
            policies.push([
              `security.extraRules[${i}].csp`,
              mergeSettings(site.security.csp, rule.csp),
            ]);
          } catch (error) {
            errors.push(`security.extraRules[${i}].csp: ${/** @type {Error} */ (error).message}`);
          }
        }
      });
      for (const [label, policy] of policies) {
        for (const req of analyticsCspRequirements(site)) {
          if (policy && !cspAllows(policy, req.directive, req.url, production.origin)) {
            const directive = req.directive === 'script-src-elem' ? 'script-src' : req.directive;
            const origin = new URL(req.url).origin;
            // $append only extends a directive that exists; otherwise the fallback's sources
            // (usually 'self') must be listed explicitly or they would be lost.
            const fix = Array.isArray(policy[directive])
              ? `{ $append: ["${origin}"] }`
              : JSON.stringify([...(effectiveSources(policy, directive) ?? []), origin]);
            errors.push(
              `${label}: ${req.provider} is enabled but ${directive} blocks ${origin}; set e.g. { "${directive}": ${fix} }`,
            );
          }
        }
      }
    }
  }
  if (errors.length) throw new Error(`Invalid site configuration:\n- ${errors.join('\n- ')}`);
  return site;
}

const RESOLVED = Symbol.for('@valentinbrclz/web-standards/site');

/**
 * Applies `defaults`, then the site overrides, validates, and returns a deeply frozen config.
 * @param {SiteOverrides} overrides
 * @returns {Readonly<SiteConfig>}
 */
export function defineSite(overrides) {
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides))
    throw new Error(
      'Invalid site configuration:\n- (root): site.config must export a plain object',
    );
  const site = validateSite(mergeSettings(defaults, overrides));
  Object.defineProperty(site, RESOLVED, { value: true });
  return deepFreeze(site);
}

/**
 * Accepts either the result of `defineSite()` or raw overrides.
 * @param {SiteOverrides | Readonly<SiteConfig>} input
 * @returns {Readonly<SiteConfig>}
 */
export function resolveSite(input) {
  return input && /** @type {any} */ (input)[RESOLVED]
    ? /** @type {Readonly<SiteConfig>} */ (input)
    : defineSite(/** @type {SiteOverrides} */ (input));
}

/**
 * Non-fatal findings worth reviewing (printed by `brclz check`).
 * @param {Readonly<SiteConfig>} site
 * @returns {string[]}
 */
export function lintSite(site) {
  const warnings = [];
  if (!site.identity.previewDomain)
    warnings.push(
      'identity.previewDomain is not set: no preview noindex rule is generated. Set it if Previews use a custom domain.',
    );
  if (!site.security.previewNoindex && site.identity.previewDomain)
    warnings.push('security.previewNoindex is false: custom-domain Previews will be indexable.');
  if (!site.security.csp)
    warnings.push('security.csp is null: no Content-Security-Policy is sent.');
  if (site.security.cspReportOnly)
    warnings.push('security.cspReportOnly is true: the CSP is not enforced.');
  if (site.astro.trailingSlash === 'ignore')
    warnings.push(
      'astro.trailingSlash "ignore" lets both URL forms resolve; canonical URLs must pick one.',
    );
  const csp = site.security.csp;
  if (csp) {
    const text = JSON.stringify(csp);
    const unused = [
      ['posthog', /posthog\.com/, site.analytics.posthog.enabled],
      ['ga4', /googletagmanager|google-analytics/, site.analytics.ga4.enabled],
      [
        'cloudflareWebAnalytics',
        /cloudflareinsights/,
        site.analytics.cloudflareWebAnalytics.enabled,
      ],
    ].filter(([, re, on]) => !on && /** @type {RegExp} */ (re).test(text));
    for (const [name] of unused)
      warnings.push(`security.csp allows ${name} origins but analytics.${name}.enabled is false.`);
    if (JSON.stringify(csp).includes("'unsafe-eval'"))
      warnings.push("security.csp contains 'unsafe-eval'.");
  }
  return warnings;
}

/**
 * Turns a domain or an HTTPS URL from a site file into the bare HTTPS origin that
 * `identity.productionUrl` expects: "example.com" and "https://example.com/" both give
 * "https://example.com". Anything else (HTTP, a path, a port, credentials) is refused so the
 * mismatch is visible instead of being silently trimmed.
 * @param {unknown} value
 * @returns {string}
 */
export function httpsOrigin(value) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`site domain: expected a non-empty string, got ${JSON.stringify(value)}`);
  const text = value.trim();
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new Error(`site domain: "${text}" is not a valid domain or URL`);
  }
  if (url.protocol !== 'https:') throw new Error(`site domain: "${text}" must use https`);
  if (url.pathname !== '/' || url.search || url.hash || url.port || url.username || url.password)
    throw new Error(
      `site domain: "${text}" must be a bare origin (no path, query, port or credentials)`,
    );
  return url.origin;
}
