/**
 * Affiliate-click redirector. Reads the per-site `links.json`
 * shipped at `public/_data/links.json`, looks up the click_id from
 * the URL segment, applies geo-routing based on the visitor's
 * country (from whichever header the current Astro adapter exposes
 * — Cloudflare, Vercel, Netlify, AWS — see `getVisitorCountry`),
 * and 302s to the resolved partner URL.
 *
 * The `Referrer-Policy: origin` response header ensures the
 * partner only sees the site's origin in `Referer`, not the
 * `/go/{id}` path — so the partner-side audit lands on the
 * actual site, not a tracker hop. We also stamp `Cache-Control:
 * no-store` so the 302 itself doesn't get cached anywhere along
 * the way.
 *
 * Beacon to the collector endpoint is fire-and-forget (sprint 4
 * will wire the actual destination). The 302 returns regardless of
 * whether the beacon succeeded, so analytics latency never blocks
 * the click.
 */
import type { APIRoute } from 'astro';
import { getVisitorCountry, loadLinkMap, pickTarget } from '../../lib/affiliate';

export const prerender = false;

export const GET: APIRoute = async ({ params, request, url }) => {
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

    // Fire-and-forget beacon to the collector. Stub for now — sprint 4
    // will swap the body for the real envelope and the URL for the
    // configured collector endpoint. Errors are swallowed so analytics
    // never blocks the redirect.
    //
    // TODO(sprint 4): emitClickEvent({...});

    return new Response(null, {
        status: 302,
        headers: {
            Location: target.url,
            'Referrer-Policy': 'origin',
            'Cache-Control': 'no-store',
        },
    });
};
