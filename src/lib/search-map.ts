/**
 * Search-map loader — the meta-search sibling of `loadLinkMap`
 * (lib/affiliate.ts), deliberately the same discipline: same-origin
 * `/_data/search-map.json`, 60s stale-while-error cache, 15s retry
 * cooldown, one malformed entry rejects the whole payload so a
 * half-written file never replaces the last valid map.
 *
 * One divergence from the links loader, on purpose: on a COLD start
 * (no map ever loaded), an HTTP 404/410 is a VALID "this site has no
 * search map" answer, cached as an empty map. Most sites never enable
 * meta-search and never publish the file; an unknown code on those
 * sites must keep answering 404 (the pre-meta-search behavior), not
 * 503 — and the origin must not be re-probed on every stray click.
 * On a WARM cache the same 404 is a transient origin/CDN blip and goes
 * through the stale-while-error path instead: a missing object must
 * never wipe a map that was serving clicks a minute earlier.
 *
 * The file is produced per-site by Foundry's SearchMapPublisher and
 * consumed by `lib/affiliate-redirect.ts` when a click code is absent
 * from `links.json`. Entry semantics live in the frozen contract
 * `docs/affiliate/search-map-contract.md`.
 */
import type { SearchMapEntry } from './meta-search.ts';

export interface SearchMap {
    version?: number;
    generated_at?: string;
    site: { slug: string; id: number };
    entries: Record<string, SearchMapEntry>;
}

let cached: { data: SearchMap; freshUntil: number } | null = null;
let retryAt = 0;

const CACHE_TTL_MS = 60_000;
const RETRY_AFTER_ERROR_MS = 15_000;

export async function loadSearchMap(origin: string): Promise<SearchMap | null> {
    const now = Date.now();
    if (cached && cached.freshUntil > now) {
        return cached.data;
    }
    if (retryAt > now) {
        return cached?.data ?? null;
    }

    try {
        const response = await fetch(`${origin}/_data/search-map.json`, { cache: 'no-store' });
        if (response.status === 404 || response.status === 410) {
            if (cached) {
                // Warm cache: a transient 404 must not replace a map
                // that was serving clicks — stale-while-error instead.
                throw new Error(`search-map.json returned ${response.status} on a warm cache`);
            }
            const data: SearchMap = { site: { slug: '', id: 0 }, entries: {} };
            cached = { data, freshUntil: now + CACHE_TTL_MS };
            retryAt = 0;
            return data;
        }
        if (!response.ok) {
            throw new Error(`search-map.json returned ${response.status}`);
        }
        const data = parseSearchMap(await response.json());
        cached = { data, freshUntil: now + CACHE_TTL_MS };
        retryAt = 0;
        return data;
    } catch {
        retryAt = now + RETRY_AFTER_ERROR_MS;
        return cached?.data ?? null;
    }
}

/**
 * Shape validation of what the redirector consumes. A response that is
 * not a plausible search map (proxy error page, truncated JSON, …)
 * throws into the stale-while-error path above. Unknown extra fields
 * pass through untouched: the map is produced by a newer backend more
 * often than this worker redeploys.
 */
function parseSearchMap(raw: unknown): SearchMap {
    if (!raw || typeof raw !== 'object') {
        throw new Error('search map: not an object');
    }
    const map = raw as Record<string, unknown>;
    const site = map.site as { id?: unknown } | undefined;
    if (!site || typeof site !== 'object' || typeof site.id !== 'number') {
        throw new Error('search map: missing site.id');
    }
    if (Array.isArray(map.entries)) {
        // PHP json_encode spells an empty entries set `[]`. Zero
        // entries is a VALID map — every code answers 404, not 503.
        if (map.entries.length > 0) {
            throw new Error('search map: entries must be an object');
        }
        map.entries = {};
    }
    if (!map.entries || typeof map.entries !== 'object') {
        throw new Error('search map: missing entries object');
    }
    for (const [code, entry] of Object.entries(map.entries as Record<string, unknown>)) {
        assertSearchEntry(code, entry);
    }
    return raw as SearchMap;
}

/**
 * Entry-shape guard: only what the redirector and the filler consume
 * structurally is checked — a non-empty `url`, `vertical`/`program`
 * strings, `encode` 1|2, `params`/`ages` plain objects (their inner
 * keys are the filler's defensive business). `fallback_url` may be
 * absent or `""`: the exporter deliberately ships the degenerate empty
 * string when neither the profile nor the program has a safety net
 * (contract §2) — such an entry still serves, and a required-slot miss
 * on it 404s that one click instead of rejecting the whole map. One
 * malformed entry rejects the WHOLE payload rather than serving a map
 * that throws at click time.
 */
function assertSearchEntry(code: string, entry: unknown): void {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`search map: entry ${code} is not an object`);
    }
    const { vertical, program, url, fallback_url: fallbackUrl, encode, params, ages } = entry as {
        vertical?: unknown;
        program?: unknown;
        url?: unknown;
        fallback_url?: unknown;
        encode?: unknown;
        params?: unknown;
        ages?: unknown;
    };

    if (typeof url !== 'string' || url === '') {
        throw new Error(`search map: entry ${code} lacks a url`);
    }
    if (fallbackUrl != null && typeof fallbackUrl !== 'string') {
        throw new Error(`search map: entry ${code} has a non-string fallback_url`);
    }
    if (typeof vertical !== 'string' || typeof program !== 'string') {
        throw new Error(`search map: entry ${code} lacks vertical/program strings`);
    }
    if (encode != null && encode !== 1 && encode !== 2) {
        throw new Error(`search map: entry ${code} has an invalid encode`);
    }
    if (params != null) {
        if (typeof params !== 'object' || Array.isArray(params)) {
            throw new Error(`search map: entry ${code} params is not an object`);
        }
        for (const [slot, spec] of Object.entries(params as Record<string, unknown>)) {
            if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
                throw new Error(`search map: entry ${code} has a malformed spec for ${slot}`);
            }
        }
    }
    if (ages != null && (typeof ages !== 'object' || Array.isArray(ages))) {
        throw new Error(`search map: entry ${code} ages is not an object`);
    }
}

/** Test-only — drops the in-memory cache so each test starts clean. */
export function __resetSearchMapCache(): void {
    cached = null;
    retryAt = 0;
}

/** Test-only — expires the cached map (keeps its data) so the next
 *  call attempts a refresh, exercising the stale-while-error path. */
export function __expireSearchMapCache(): void {
    if (cached) {
        cached.freshUntil = 0;
    }
    retryAt = 0;
}
