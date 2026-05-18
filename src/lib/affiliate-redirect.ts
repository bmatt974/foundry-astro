/**
 * Shared SSR handler used by every per-site affiliate redirect
 * route (`/go/[id]`, `/visit/[id]`, `/details/[id]`, `/info/[id]`,
 * `/view/[id]`, `/out/[id]`). Each `src/pages/<prefix>/[id].ts`
 * re-exports `GET` from here — the actual logic lives once.
 *
 * Why one route file per prefix instead of a single catch-all
 * `/[prefix]/[id].ts`? Two reasons:
 *
 *   1. A catch-all would collide with `/[locale]/[...path]` (Astro
 *      routing priority would pick the wrong one for `/fr/anything`).
 *   2. Pre-compiled routes are faster than a runtime regex in the
 *      middleware. The set of allowed prefixes is small (6) and
 *      stable — listing them explicitly is a feature, not a
 *      maintenance cost.
 *
 * The CMS-side `ExperimentsResolver` picks one prefix per website
 * (`tenant.experiments.link_proxy_path`); the Comparison template
 * reads it to build the href. The 5 unused prefixes per site
 * 404 silently — they're never advertised in any markup the site
 * itself emits, only reachable to a scraper that guesses them.
 */
import type { APIRoute } from 'astro';
import {
    getVisitorCountry,
    loadLinkMap,
    parseRefererHost,
    parseUaFamily,
    pickTarget,
    sendClickEvent,
} from './affiliate';

export const handleAffiliateRedirect: APIRoute = async ({ params, request, url }) => {
    const id = params.id;
    if (!id) {
        return new Response('Missing click id', { status: 400 });
    }

    const linkMap = await loadLinkMap(url.origin);
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
};
