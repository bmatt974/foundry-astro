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
 * A code absent from `links.json` gets a second chance against the
 * per-site `search-map.json` (meta-search deeplinks, same 2-segment
 * URL space): the click's query string then carries the visitor's
 * search form, filled into the partner's tracked template by
 * `fillSearchTemplate` (lib/meta-search.ts). A code in neither map is
 * a 404, exactly as before meta-search existed.
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
    type ClickEventPayload,
} from './affiliate.ts';
import { isAffiliateProxyPrefix } from './affiliate-prefixes.ts';
import { lookupCountry, parseClientIp } from './geoip.ts';
import { fillSearchTemplate, parseSearchQuery } from './meta-search.ts';
import { loadSearchMap } from './search-map.ts';

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
        // Not a classic click — try the meta-search space. The search
        // map is only ever loaded on this branch: the massively
        // dominant classic click pays zero extra cost.
        return redirectSearchClick(args);
    }

    const country = await resolveCountry(request, clientAddress);
    const target = pickTarget(entry, country);

    return clickResponse({
        request,
        waitUntil,
        partnerUrl: target.url,
        country,
        beacon: {
            code,
            website_id: linkMap.site.id,
            account_id: target.account_id ?? null,
            placement: parsePlacement(url.searchParams.get(PLACEMENT_PARAM)),
            geo_rule_idx: target.geo_rule_idx,
        },
    });
}

/**
 * Resolve a meta-search click: the code names a search profile in the
 * per-site `search-map.json` (same 2-segment URL space as classic
 * clicks, resolved second), the query string carries the visitor's
 * form (`d`, `ci`, `co`, `a`, `ca`, …) which the filler projects into
 * the partner's tracked URL template. A `required` slot the query
 * cannot satisfy resolves to the entry's `fallback_url` — a broken
 * query is still a monetized click toward the partner homepage, never
 * a 400.
 *
 *   - code in neither map → 404 (the pre-meta-search behavior);
 *   - search map unloadable on a cold start → 503 — but a site that
 *     never published a search-map.json (HTTP 404) counts as an empty
 *     map, so its unknown codes keep answering 404.
 */
async function redirectSearchClick(args: {
    code: string;
    request: Request;
    url: URL;
    clientAddress?: string | null;
    waitUntil?: ((promise: Promise<unknown>) => void) | null;
}): Promise<Response> {
    const { code, request, url, clientAddress, waitUntil } = args;

    const searchMap = await loadSearchMap(url.origin);
    if (!searchMap) {
        return new Response('Search map unavailable', { status: 503 });
    }

    const entry = searchMap.entries[code];
    if (!entry) {
        return new Response('Not found', { status: 404 });
    }

    const partnerUrl = fillSearchTemplate(entry, parseSearchQuery(url.searchParams));
    if (partnerUrl === '') {
        return new Response('Not found', { status: 404 });
    }

    const country = await resolveCountry(request, clientAddress);

    return clickResponse({
        request,
        waitUntil,
        partnerUrl,
        country,
        beacon: {
            code,
            website_id: searchMap.site.id,
            account_id: entry.account_id ?? null,
            // A search entry always carries a placement: the form's
            // hidden `p` when present and valid, `meta_search` — the
            // only surface these codes render on — otherwise.
            placement: parsePlacement(url.searchParams.get(PLACEMENT_PARAM)) ?? 'meta_search',
        },
    });
}

/** CDN geo headers first, local GeoIP db as the self-hosted fallback. */
async function resolveCountry(request: Request, clientAddress?: string | null): Promise<string | null> {
    return getVisitorCountry(request.headers)
        ?? await lookupCountry(parseClientIp(request.headers, clientAddress));
}

/**
 * The shared tail of every resolved click, classic or search: mint the
 * ULID, inject it as the partner `{subid}`, fire the collector beacon,
 * 302. One ULID per click — the subid the partner echoes back at
 * conversion time IS the click's PK in Foundry, so the value in the
 * Location header and the one in the beacon must be the same string,
 * minted exactly once.
 */
function clickResponse(args: {
    request: Request;
    waitUntil?: ((promise: Promise<unknown>) => void) | null;
    partnerUrl: string;
    country: string | null;
    beacon: Omit<ClickEventPayload, 'click_id' | 'country' | 'ua_family' | 'referer_host' | 'referer_path'>;
}): Response {
    const { request, waitUntil, partnerUrl, country } = args;

    const clickId = generateClickUlid();
    const location = injectSubId(partnerUrl, clickId);

    const collectorUrl = resolveCollectorUrl();
    if (collectorUrl) {
        const referer = parseReferer(request.headers.get('referer'));
        const beacon = sendClickEvent(collectorUrl, {
            ...args.beacon,
            click_id: clickId,
            country,
            ua_family: parseUaFamily(request.headers.get('user-agent')),
            referer_host: referer?.host ?? null,
            referer_path: referer?.path ?? null,
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
