/**
 * Single source of truth for the affiliate proxy path prefixes.
 *
 * Two consumers, one list:
 *   - `src/lib/affiliate-redirect.ts` matches incoming URLs against it
 *     in the middleware dispatcher;
 *   - `astro.config.mjs` derives the Cloudflare `_routes.json` include
 *     patterns from it, so the worker only ever runs on these paths.
 *
 * Keeping both behind one module means adding a localised prefix
 * (`voir`, `infos`, `visite`, …) is a one-line change that cannot
 * desynchronise the router from the CDN routing table.
 *
 * MUST stay dependency-free: `astro.config.mjs` imports it before the
 * Vite pipeline exists, and the Cloudflare worker bundles it.
 *
 * Each value is one of the CMS `LinkProxyPath` options picked per
 * website — the redirector accepts ANY of them so a site whose
 * `link_proxy_path` changed mid-deploy keeps resolving clicks from
 * cached pages carrying the old prefix.
 */

export const AFFILIATE_PROXY_PREFIXES = [
    'view',
    'details',
    'info',
    'visit',
    'out',
    'go',
] as const;

export type AffiliateProxyPrefix = (typeof AFFILIATE_PROXY_PREFIXES)[number];

export function isAffiliateProxyPrefix(segment: string): segment is AffiliateProxyPrefix {
    return (AFFILIATE_PROXY_PREFIXES as readonly string[]).includes(segment);
}

/**
 * `_routes.json` include patterns for the Cloudflare adapter —
 * `['/view/*', '/details/*', …]`. Everything outside these patterns
 * is served as pure static from the edge without invoking the worker.
 */
export function affiliateRouteIncludes(): string[] {
    return AFFILIATE_PROXY_PREFIXES.map((prefix) => `/${prefix}/*`);
}
