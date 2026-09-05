/**
 * Affiliate-click redirector. Dispatched from `src/middleware.ts`
 * when the incoming URL matches an allow-listed prefix (see
 * `lib/affiliate-prefixes.ts` — shared with `astro.config.mjs` so the
 * Cloudflare `_routes.json` can never drift from this matcher). The
 * middleware-only routing keeps the affiliate dispatch in one place —
 * no per-prefix page route file needed.
 *
 * Flow per click: load the per-site `links.json` (stale-while-error,
 * see `loadLinkMap`) → look up the immutable public `code` → resolve
 * the visitor's country (CDN headers first, local GeoIP db as the
 * self-hosted fallback) → pick the geo target → mint the click ULID →
 * inject it as the partner `{subid}` → fire the collector beacon →
 * 302. The `?p=` placement param feeds the beacon only — it is NEVER
 * forwarded to the partner, whose Location is built solely from the
 * link map's URL.
 *
 * `Referrer-Policy: origin` on the 302 ensures the partner only
 * sees the site's origin in `Referer`, not the `/{prefix}/{code}`
 * path. `Cache-Control: no-store` keeps the 302 from being cached
 * along the way — every click goes through the worker (each must
 * mint its own subid), not a cached redirect.
 */
import {
    generateClickUlid,
    getVisitorCountry,
    injectSubId,
    loadLinkMap,
    parsePlacement,
    parseReferer,
    parseUaFamily,
    pickTarget,
    PLACEMENT_PARAM,
    sendClickEvent,
} from './affiliate.ts';
import { isAffiliateProxyPrefix } from './affiliate-prefixes.ts';
import { lookupCountry, parseClientIp } from './geoip.ts';

/**
 * Extract `(prefix, code)` from a URL pathname when it matches the
 * affiliate redirect shape — exactly two path segments, the first
 * being an allow-listed prefix.
 *
 * Returns null on every other URL shape so the middleware can fall
 * through to the normal page routing.
 */
export function matchAffiliateClickPath(pathname: string): { prefix: string; code: string } | null {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length !== 2) {
        return null;
    }
    const [prefix, code] = segments;
    if (!isAffiliateProxyPrefix(prefix)) {
        return null;
    }
    if (!code) {
        return null;
    }
    return { prefix, code };
}

/**
 * Resolve a single click and produce the redirect Response.
 * Caller (middleware) has already matched the URL shape via
 * `matchAffiliateClickPath` and knows it has a valid `code`.
 *
 * `url` is the request URL the middleware already parsed
 * (`context.url`) — passed as the object so the hot path never pays
 * for a redundant `new URL(request.url)` per click. `clientAddress`
 * feeds the GeoIP fallback on self-hosted Node (adapters may throw on
 * access, so the middleware passes it pre-caught). `waitUntil` is
 * Cloudflare's `ctx.waitUntil` — REQUIRED there: without it the
 * runtime may cancel the beacon fetch the moment the 302 returns,
 * silently dropping the click row.
 */
export async function redirectClick(args: {
    code: string;
    request: Request;
    url: URL;
    clientAddress?: string | null;
    waitUntil?: ((promise: Promise<unknown>) => void) | null;
}): Promise<Response> {
    const { code, request, url, clientAddress, waitUntil } = args;

    const linkMap = await loadLinkMap(url.origin);
    if (!linkMap) {
        return new Response('Link map unavailable', { status: 503 });
    }

    const entry = linkMap.links[code];
    if (!entry) {
        return new Response('Not found', { status: 404 });
    }

    let country = getVisitorCountry(request.headers);
    if (!country) {
        country = await lookupCountry(parseClientIp(request.headers, clientAddress));
    }
    const target = pickTarget(entry, country);

    // One ULID per click — the subid the partner echoes back at
    // conversion time IS the click's PK in Foundry, so the value in
    // the Location header and the one in the beacon must be the same
    // string, minted exactly once.
    const clickId = generateClickUlid();
    const location = injectSubId(target.url, clickId);

    const collectorUrl = resolveCollectorUrl();
    if (collectorUrl) {
        const referer = parseReferer(request.headers.get('referer'));
        const beacon = sendClickEvent(collectorUrl, {
            code,
            click_id: clickId,
            website_id: linkMap.site.id,
            account_id: target.account_id ?? null,
            placement: parsePlacement(url.searchParams.get(PLACEMENT_PARAM)),
            country,
            ua_family: parseUaFamily(request.headers.get('user-agent')),
            referer_host: referer?.host ?? null,
            referer_path: referer?.path ?? null,
            geo_rule_idx: target.geo_rule_idx,
        }).catch(() => { /* fire-and-forget */ });
        if (waitUntil) {
            waitUntil(beacon);
        }
    }

    return new Response(null, {
        status: 302,
        headers: {
            Location: location,
            'Referrer-Policy': 'origin',
            'Cache-Control': 'no-store',
        },
    });
}

/**
 * `import.meta.env` is Vite's channel (populated in builds and dev);
 * `process.env` is the fallback for plain-Node contexts (node:test
 * runs these modules with types stripped, no Vite involved). The
 * optional chain keeps the module loadable in both.
 */
function resolveCollectorUrl(): string | null {
    const apiBase = import.meta.env?.FOUNDRY_API_URL
        ?? (typeof process !== 'undefined' ? process.env.FOUNDRY_API_URL : undefined);
    return apiBase ? `${apiBase}/events/clicks` : null;
}
