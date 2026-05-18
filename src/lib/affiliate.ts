/**
 * Affiliate-link resolver helpers used by `src/pages/go/[id].ts`.
 *
 * The `links.json` file is produced per-site by Foundry's
 * `affiliate:export-link-map {slug}` artisan command (see CMS-side
 * LinkMapBuilder) and deployed alongside the static bundle at
 * `public/_data/links.json`. The /go endpoint reads it same-origin,
 * matches the `click_id` segment, applies geo routing if present,
 * and 302s to the resolved partner URL.
 *
 * Same-origin storage is what keeps the affiliate stack adapter-
 * agnostic: any provider that serves static files plus a thin SSR
 * endpoint (Cloudflare Pages Functions, Vercel Edge, Netlify
 * Functions, Node) can do this without provider-specific KV bindings.
 */

export interface LinkTarget {
    /** Foundry platform id used to resolve this URL — surfaced to the
     *  collector so the dashboard can pivot by program/platform. */
    platform_id: number | null;
    /** Fully resolved deep link (template placeholders already filled
     *  per-site at LinkMapBuilder time). */
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
    generated_at: string;
    site: { slug: string; id: number };
    links: Record<string, LinkEntry>;
}

/**
 * Module-scope cache so a hot click path doesn't re-fetch the JSON
 * on every request. 60s TTL — enough to absorb traffic spikes after
 * a fresh deploy without going stale longer than one cron cycle.
 *
 * Stored per Node worker, so a multi-worker deploy keeps N
 * independent caches — fine, the file is small and the underlying
 * CDN cache absorbs the load anyway.
 */
let cachedMap: { data: LinkMap; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function loadLinkMap(origin: string): Promise<LinkMap | null> {
    if (cachedMap && cachedMap.expiresAt > Date.now()) {
        return cachedMap.data;
    }

    try {
        const r = await fetch(`${origin}/_data/links.json`, { cache: 'no-store' });
        if (!r.ok) {
            return null;
        }
        const data = (await r.json()) as LinkMap;
        cachedMap = { data, expiresAt: Date.now() + CACHE_TTL_MS };
        return data;
    } catch {
        return null;
    }
}

/** Test-only — drops the in-memory cache so each test starts clean. */
export function __resetLinkMapCache(): void {
    cachedMap = null;
}

/**
 * Resolve a visitor's country from whichever header the current
 * platform exposes. Order matters only as a tie-break — in practice
 * exactly one of these is set per provider.
 *
 *   Cloudflare Pages / Workers : cf-ipcountry
 *   Vercel Edge Functions      : x-vercel-ip-country
 *   Netlify Edge Functions     : x-nf-country
 *   AWS CloudFront / Lambda@Edge: cloudfront-viewer-country
 *
 * Returns the uppercase ISO 3166-1 alpha-2 code, or null when the
 * platform exposes nothing (dev, self-hosted, weird proxy stack).
 */
export function getVisitorCountry(headers: Headers): string | null {
    const candidates = [
        'cf-ipcountry',
        'x-vercel-ip-country',
        'x-nf-country',
        'cloudfront-viewer-country',
    ];
    for (const name of candidates) {
        const raw = headers.get(name);
        if (raw) {
            const cc = raw.trim().toUpperCase();
            if (/^[A-Z]{2}$/.test(cc)) {
                return cc;
            }
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
