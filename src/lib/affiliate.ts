/**
 * Affiliate-link resolver helpers used by `lib/affiliate-redirect.ts`.
 *
 * The `links.json` file is produced per-site by Foundry's
 * `affiliate:push-link-maps` artisan command (see CMS-side
 * LinkMapBuilder / LinkMapPublisher) and served same-origin at
 * `/_data/links.json`. The redirect endpoint reads it, matches the
 * public `code` segment, applies geo routing if present, mints the
 * click ULID, injects it as the partner subid, and 302s to the
 * resolved partner URL.
 *
 * Same-origin storage is what keeps the affiliate stack adapter-
 * agnostic: any provider that serves static files plus a thin SSR
 * endpoint (Cloudflare Pages Functions, Vercel Edge, Netlify
 * Functions, Node) can do this without provider-specific KV bindings.
 */

export interface LinkTarget {
    /** Foundry affiliate account id used to resolve this URL —
     *  surfaced to the collector so the dashboard can pivot by
     *  program/account. Optional: v1 maps carried `platform_id`
     *  instead, which this consumer deliberately ignores. */
    account_id?: number | null;
    /** Fully resolved deep link, template placeholders already filled
     *  per-site at LinkMapBuilder time — except `{subid}`, which the
     *  redirector fills per click (see `injectSubId`). */
    url: string;
}

export interface LinkGeoRule extends LinkTarget {
    /** Uppercase ISO 3166-1 alpha-2 codes the rule matches. */
    match: string[];
}

export interface LinkEntry {
    default: LinkTarget;
    geo_rules?: LinkGeoRule[];
}

export interface LinkMap {
    /** 2 for maps keyed by `code` with `account_id` targets. Absent on
     *  legacy v1 maps — tolerated, the shared fields still resolve. */
    version?: number;
    generated_at?: string;
    site: { slug: string; id: number };
    links: Record<string, LinkEntry>;
}

/**
 * Stale-while-error cache. One map per Node worker; the file is small
 * and the CDN cache absorbs the load, so N independent caches in a
 * multi-worker deploy are fine.
 *
 *   - fresh (< 60s): served without a network round-trip;
 *   - expired: one refresh attempt — on failure the LAST VALID map
 *     keeps being served and refreshes pause for 15s (a broken deploy
 *     or a CDN hiccup must not turn every click into a 503);
 *   - cold start with no valid map: null → caller answers 503, retry
 *     also throttled to one attempt per 15s.
 */
let cached: { data: LinkMap; freshUntil: number } | null = null;
let retryAt = 0;

const CACHE_TTL_MS = 60_000;
const RETRY_AFTER_ERROR_MS = 15_000;

export async function loadLinkMap(origin: string): Promise<LinkMap | null> {
    const now = Date.now();
    if (cached && cached.freshUntil > now) {
        return cached.data;
    }
    if (retryAt > now) {
        return cached?.data ?? null;
    }

    try {
        const r = await fetch(`${origin}/_data/links.json`, { cache: 'no-store' });
        if (!r.ok) {
            throw new Error(`links.json returned ${r.status}`);
        }
        const data = parseLinkMap(await r.json());
        cached = { data, freshUntil: now + CACHE_TTL_MS };
        retryAt = 0;
        return data;
    } catch {
        retryAt = now + RETRY_AFTER_ERROR_MS;
        return cached?.data ?? null;
    }
}

/**
 * Minimal shape validation — a response that is not a plausible link
 * map (error page cached by a proxy, truncated JSON, …) must never
 * clobber the last valid map, so it throws into the stale-while-error
 * path above. Unknown extra fields pass through untouched: the map is
 * produced by a newer backend more often than this worker redeploys.
 */
function parseLinkMap(raw: unknown): LinkMap {
    if (!raw || typeof raw !== 'object') {
        throw new Error('link map: not an object');
    }
    const map = raw as Record<string, unknown>;
    const site = map.site as { id?: unknown } | undefined;
    if (!site || typeof site !== 'object' || typeof site.id !== 'number') {
        throw new Error('link map: missing site.id');
    }
    if (Array.isArray(map.links)) {
        // Legacy exports spelled an empty links set `[]` (PHP array
        // json_encode). Zero links is a VALID map — every code answers
        // 404, not 503 — so accept it as the empty object.
        if (map.links.length > 0) {
            throw new Error('link map: links must be an object');
        }
        map.links = {};
    }
    if (!map.links || typeof map.links !== 'object') {
        throw new Error('link map: missing links object');
    }
    for (const [code, entry] of Object.entries(map.links as Record<string, unknown>)) {
        assertLinkEntry(code, entry);
    }
    return raw as LinkMap;
}

/**
 * Entry-shape guard for `parseLinkMap`: only what the redirector
 * consumes is checked (`default.url`; per geo_rule, `match` + `url`),
 * unknown fields pass untouched. One malformed entry rejects the WHOLE
 * payload — a half-written links.json must fail the refresh (the
 * stale-while-error cache keeps the last good map) rather than replace
 * it and start throwing inside `injectSubId` at click time.
 */
function assertLinkEntry(code: string, entry: unknown): void {
    if (!entry || typeof entry !== 'object') {
        throw new Error(`link map: entry ${code} is not an object`);
    }
    const { default: fallback, geo_rules: geoRules } = entry as {
        default?: unknown;
        geo_rules?: unknown;
    };
    if (!isLinkTarget(fallback)) {
        throw new Error(`link map: entry ${code} lacks a default.url`);
    }
    if (geoRules == null) {
        return;
    }
    if (!Array.isArray(geoRules)) {
        throw new Error(`link map: entry ${code} geo_rules is not an array`);
    }
    for (const rule of geoRules) {
        if (!isLinkTarget(rule) || !Array.isArray((rule as { match?: unknown }).match)) {
            throw new Error(`link map: entry ${code} has a malformed geo_rule`);
        }
    }
}

/** A target is usable iff it carries a non-empty string `url`. */
function isLinkTarget(target: unknown): boolean {
    if (!target || typeof target !== 'object') {
        return false;
    }
    const url = (target as { url?: unknown }).url;
    return typeof url === 'string' && url.length > 0;
}

/** Test-only — drops the in-memory cache so each test starts clean. */
export function __resetLinkMapCache(): void {
    cached = null;
    retryAt = 0;
}

/** Test-only — expires the cached map (keeps its data) so the next
 *  call attempts a refresh, exercising the stale-while-error path. */
export function __expireLinkMapCache(): void {
    if (cached) {
        cached.freshUntil = 0;
    }
    retryAt = 0;
}

/**
 * CDN geo headers, one per platform. Order matters only as a
 * tie-break — in practice exactly one of these is set per provider.
 *
 *   Cloudflare Pages / Workers : cf-ipcountry
 *   Vercel Edge Functions      : x-vercel-ip-country
 *   Netlify Edge Functions     : x-nf-country
 *   AWS CloudFront / Lambda@Edge: cloudfront-viewer-country
 */
const COUNTRY_HEADERS = [
    'cf-ipcountry',
    'x-vercel-ip-country',
    'x-nf-country',
    'cloudfront-viewer-country',
] as const;

/**
 * Normalise a raw country claim (CDN header, GeoIP db field) to an
 * uppercase ISO 3166-1 alpha-2 code, or null when it doesn't look
 * like one — the single validation both geo channels go through.
 */
export function normaliseCountry(raw: string | null | undefined): string | null {
    if (!raw) {
        return null;
    }
    const cc = raw.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(cc) ? cc : null;
}

/**
 * Resolve a visitor's country from whichever CDN geo header the
 * current platform exposes. Returns the uppercase ISO 3166-1 alpha-2
 * code, or null when the platform exposes nothing (dev, self-hosted,
 * weird proxy stack) — the caller may then fall back to the local
 * GeoIP db (lib/geoip.ts).
 */
export function getVisitorCountry(headers: Headers): string | null {
    for (const name of COUNTRY_HEADERS) {
        const country = normaliseCountry(headers.get(name));
        if (country) {
            return country;
        }
    }
    return null;
}

export interface ResolvedTarget extends LinkTarget {
    /** Index into `entry.geo_rules` that matched, or -1 for default. */
    geo_rule_idx: number;
}

/**
 * Pick the right target for the visitor's country. Falls back to the
 * entry's `default` when no geo_rule matches, or when no country was
 * resolved (visitor on a dev server, unknown proxy, …).
 */
export function pickTarget(entry: LinkEntry, country: string | null): ResolvedTarget {
    if (country && entry.geo_rules) {
        for (let i = 0; i < entry.geo_rules.length; i++) {
            const rule = entry.geo_rules[i];
            if (rule.match.includes(country)) {
                return { ...rule, geo_rule_idx: i };
            }
        }
    }
    return { ...entry.default, geo_rule_idx: -1 };
}

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Mint the click id — a spec-compliant ULID (48-bit millisecond
 * timestamp + 80 bits of CSPRNG randomness, Crockford base32, 26
 * uppercase chars). This exact string is the click's PK in Foundry
 * AND the subid the partner echoes back at conversion time, which is
 * what lets Phase 3 join conversions to clicks with zero mapping
 * tables. Must satisfy Laravel's `Str::isUlid()`:
 * `/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i`.
 *
 * `globalThis.crypto` is available on Node ≥ 19 and every edge
 * runtime — no import needed, so this file stays dependency-free.
 */
export function generateClickUlid(): string {
    let time = Date.now();
    const chars = new Array<string>(26);
    for (let i = 9; i >= 0; i--) {
        chars[i] = CROCKFORD_ALPHABET[time % 32];
        time = Math.floor(time / 32);
    }

    const bytes = new Uint8Array(10);
    globalThis.crypto.getRandomValues(bytes);
    let acc = 0;
    let accBits = 0;
    let pos = 10;
    for (const byte of bytes) {
        acc = (acc << 8) | byte;
        accBits += 8;
        while (accBits >= 5) {
            chars[pos++] = CROCKFORD_ALPHABET[(acc >>> (accBits - 5)) & 31];
            accBits -= 5;
        }
    }
    return chars.join('');
}

/**
 * Replace every `{subid}` token in a partner URL with the click id.
 * Handles the literal form and the percent-encoded one (`%7Bsubid%7D`)
 * in any casing — LinkMapBuilder templates the URL, and depending on
 * where the placeholder sits (path vs query) PHP's urlencode may have
 * encoded the braces. Multi-occurrence by design: some networks want
 * the subid in two params.
 *
 * A URL without the token passes through untouched (network without
 * subid support — surfaced by the CMS Config-issues widget, not an
 * error here). Any OTHER `{placeholder}` is left alone: an unresolved
 * template is a backend bug the click must not paper over.
 */
export function injectSubId(url: string, subid: string): string {
    return url.replace(/(\{|%7B)subid(\}|%7D)/gi, subid);
}

/**
 * Pull the host and path out of a Referer header value, dropping the
 * visitor's query strings and fragments. The host feeds "which sites
 * send us traffic" dashboards without leaking the visitor's full
 * browsing context; the path names the content page that hosted the
 * click — combined with `website_id`, Foundry resolves it to a
 * `page_id` best-effort. Null on missing / malformed referer — never
 * throws.
 */
export function parseReferer(
    referer: string | null,
): { host: string | null; path: string | null } | null {
    if (!referer) {
        return null;
    }
    try {
        const url = new URL(referer);
        return { host: url.host || null, path: url.pathname || null };
    } catch {
        return null;
    }
}

/**
 * Placement slugs the click may carry (`?p=` on the shortlink) —
 * mirrors the backend `App\Enums\Affiliate\Placement` exactly. The
 * emitting block parsers know where they are on the page; six months
 * from now "does GYG convert better in the comparator than in an
 * editorial CTA?" is a query, not a rebuild.
 *
 * Anything outside the allow-list collapses to null: the param is
 * attacker-reachable (it's a public URL), so it is validated here AND
 * revalidated server-side by the collector.
 */
const PLACEMENTS = [
    'comparison_table',
    'ticket_shelf',
    'cta',
    'inline_link',
    'sidebar',
    'deal',
    'article',
] as const;

export type Placement = (typeof PLACEMENTS)[number];

export function parsePlacement(raw: string | null): Placement | null {
    return PLACEMENTS.find((placement) => placement === raw) ?? null;
}

/** Query-param key carrying the placement slug on a shortlink —
 *  written by `affiliateHref`, read back by the redirector. */
export const PLACEMENT_PARAM = 'p';

/**
 * The CTA href a block parser should render for a payload entry —
 * `/{proxy}/{code}?p={placement}` when the AffiliateLinkGenerator has
 * minted a tracked link, the raw `partner_url` otherwise (legacy
 * content / external links not yet onboarded), null when neither
 * exists. The proxy prefix varies per website (`view` / `details` /
 * `info` / `visit` / `out` / `go`) — set by the CMS
 * `ExperimentsResolver`, read from `tenant.experiments.link_proxy_path`
 * by the calling theme. The same-origin path stays out of the
 * partner's Referer header (paired with `referrerpolicy="origin"` on
 * the link tag), keeping the tracker invisible to crawlers.
 *
 * `?p=` names the placement the calling parser KNOWS it renders — the
 * redirector reads it for the click beacon and strips it before the
 * partner 302. `code ?? click_id`: translations frozen before the
 * rename still ship `click_id` and stay clickable until re-draft —
 * that tolerance lives HERE and nowhere else.
 */
export function affiliateHref(
    entry: { code?: unknown; click_id?: unknown; partner_url?: unknown },
    proxy: string,
    placement: Placement,
): string | null {
    const code = nonEmptyString(entry.code) ?? nonEmptyString(entry.click_id);
    if (code) {
        return `/${proxy}/${code}?${PLACEMENT_PARAM}=${placement}`;
    }
    return nonEmptyString(entry.partner_url);
}

function nonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Best-effort UA family extraction. Avoids pulling a 500KB UA-parser
 * dep into every worker — a handful of regex covers ~95% of real
 * traffic, the long tail rolls up into "Other" without hurting the
 * dashboard. Order matters: Edge ships a Chrome UA so it must match
 * first.
 */
export function parseUaFamily(ua: string | null): string | null {
    if (!ua) {
        return null;
    }
    if (/EdgA?\//.test(ua)) {
        return 'Edge';
    }
    if (/OPR\/|Opera\//.test(ua)) {
        return 'Opera';
    }
    if (/Chrome\//.test(ua)) {
        return 'Chrome';
    }
    if (/Firefox\//.test(ua)) {
        return 'Firefox';
    }
    if (/Safari\//.test(ua)) {
        return 'Safari';
    }
    if (/bot|crawl|spider|slurp/i.test(ua)) {
        return 'Bot';
    }
    return 'Other';
}

export interface ClickEventPayload {
    /** The link's immutable public code (the `/go/{code}` segment). */
    code: string;
    /** The minted ULID — Foundry's click PK AND the partner subid. */
    click_id: string;
    website_id?: number | null;
    account_id?: number | null;
    placement?: Placement | null;
    country?: string | null;
    ua_family?: string | null;
    referer_host?: string | null;
    referer_path?: string | null;
    geo_rule_idx?: number | null;
}

/**
 * Fire-and-forget beacon to the Foundry collector. Uses
 * `keepalive: true` so the request survives the 302 navigation the
 * worker is about to issue — even if the browser tears the page
 * down right after the click. The promise is intentionally not
 * awaited; the redirect must not wait on analytics. On Cloudflare the
 * caller MUST hand it to `ctx.waitUntil` or the runtime may cancel
 * the fetch when the Response returns.
 *
 * Returns the in-flight promise so the redirector can pass it to
 * `waitUntil` and tests can verify the call shape.
 */
export function sendClickEvent(
    collectorUrl: string,
    payload: ClickEventPayload,
): Promise<Response> {
    return fetch(collectorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
    });
}
