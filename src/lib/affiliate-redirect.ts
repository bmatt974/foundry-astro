/**
 * Affiliate-click redirector. Dispatched from `src/middleware.ts`
 * when the incoming URL matches an allow-listed prefix (see
 * `AFFILIATE_PROXY_PREFIXES` below). The middleware-only routing
 * keeps the affiliate dispatch in one place — no per-prefix page
 * route file needed — and means adding a localised prefix later
 * (`voir`, `infos`, `visite`, …) is a one-line change to the
 * allow-list.
 *
 * The function reads the per-site `links.json` shipped at
 * `public/_data/links.json`, looks up the click_id, applies geo-
 * routing based on the visitor's country (from whichever header
 * the current Astro adapter exposes), 302s to the resolved
 * partner URL, and fires a fire-and-forget beacon to the Foundry
 * collector before returning.
 *
 * `Referrer-Policy: origin` on the 302 ensures the partner only
 * sees the site's origin in `Referer`, not the `/{prefix}/{id}`
 * path. `Cache-Control: no-store` keeps the 302 from being cached
 * along the way — every click goes through the worker, not a
 * cached redirect.
 */
import {
    getVisitorCountry,
    loadLinkMap,
    parseRefererHost,
    parseUaFamily,
    pickTarget,
    sendClickEvent,
} from './affiliate.ts';

/**
 * Path segments that route to the affiliate redirector. Each is
 * one of the values `LinkProxyPath` in the CMS picks per website
 * — the middleware accepts any so a single site's HTML uses one
 * of them, but the worker can resolve clicks for any prefix
 * (useful when an editor changes the website's `link_proxy_path`
 * mid-deploy: in-flight cached pages with the old prefix still
 * work).
 *
 * Add localised variants here (`voir`, `infos`, `visite`,
 * `sortir`, `aller` for French; `ver`, `detalles`, `enlace` for
 * Spanish; …) when the CMS enum gains them.
 */
export const AFFILIATE_PROXY_PREFIXES = new Set([
    'view',
    'details',
    'info',
    'visit',
    'out',
    'go',
] as const);

/**
 * Extract `(prefix, id)` from a URL pathname when it matches the
 * affiliate redirect shape — exactly two path segments, the first
 * being an allow-listed prefix.
 *
 * Returns null on every other URL shape so the middleware can fall
 * through to the normal page routing.
 */
export function matchAffiliateClickPath(pathname: string): { prefix: string; id: string } | null {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length !== 2) {
        return null;
    }
    const [prefix, id] = segments;
    if (!AFFILIATE_PROXY_PREFIXES.has(prefix as never)) {
        return null;
    }
    if (!id || id.length === 0) {
        return null;
    }
    return { prefix, id };
}

/**
 * Resolve a single click and produce the redirect Response.
 * Caller (middleware) has already matched the URL shape via
 * `matchAffiliateClickPath` and knows it has a valid `id`.
 */
export async function redirectClick(args: {
    id: string;
    request: Request;
    origin: string;
}): Promise<Response> {
    const { id, request, origin } = args;

    const linkMap = await loadLinkMap(origin);
    if (!linkMap) {
        return new Response('Link map unavailable', { status: 503 });
    }

    const entry = linkMap.links[id];
    if (!entry) {
        return new Response('Not found', { status: 404 });
    }

    const country = getVisitorCountry(request.headers);
    const target = pickTarget(entry, country);

    const collectorUrl = import.meta.env.FOUNDRY_API_URL
        ? `${import.meta.env.FOUNDRY_API_URL}/events/clicks`
        : null;
    if (collectorUrl) {
        sendClickEvent(collectorUrl, {
            click_id: id,
            website_id: linkMap.site.id,
            platform_id: target.platform_id,
            country,
            ua_family: parseUaFamily(request.headers.get('user-agent')),
            referer_host: parseRefererHost(request.headers.get('referer')),
            geo_rule_idx: target.geo_rule_idx,
        }).catch(() => { /* fire-and-forget */ });
    }

    return new Response(null, {
        status: 302,
        headers: {
            Location: target.url,
            'Referrer-Policy': 'origin',
            'Cache-Control': 'no-store',
        },
    });
}
