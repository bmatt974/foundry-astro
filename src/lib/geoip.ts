/**
 * GeoLite2 country fallback for geo-routed affiliate links — used
 * only when no CDN header answered (`getVisitorCountry` returned
 * null, i.e. self-hosted Node deploys and local dev).
 *
 * Node-only by construction, importable everywhere: the module itself
 * has zero top-level dependencies, and the `maxmind` reader is a
 * dynamic `import()` reached only after THREE guards pass —
 *
 *   1. an ip was resolved for the request;
 *   2. the runtime is Node (Cloudflare never gets here: `cf-ipcountry`
 *      always answers first, and the CF build externalises `maxmind`
 *      so it is not even in the bundle — see astro.config.mjs);
 *   3. `GEOIP_DB_PATH` is configured (see .env.example).
 *
 * The reader is a lazy module-scope singleton: the mmdb file is
 * opened once per worker and shared by every request. An open failure
 * (missing file, corrupt db) is cached with a cooldown so a
 * misconfigured path degrades to "no geo fallback" instead of
 * hammering the filesystem on every click.
 */

import { normaliseCountry } from './affiliate.ts';

interface CountryReader {
    get(ip: string): { country?: { iso_code?: string } } | null;
}

const OPEN_FAILURE_COOLDOWN_MS = 60_000;

let readerPromise: Promise<CountryReader | null> | null = null;
let openFailedUntil = 0;

function isNodeRuntime(): boolean {
    return typeof process !== 'undefined' && typeof process.versions?.node === 'string';
}

function openReader(dbPath: string): Promise<CountryReader | null> {
    if (!readerPromise) {
        if (Date.now() < openFailedUntil) {
            return Promise.resolve(null);
        }
        readerPromise = (async () => {
            try {
                const maxmind = await import('maxmind');
                return (await maxmind.open(dbPath)) as CountryReader;
            } catch {
                openFailedUntil = Date.now() + OPEN_FAILURE_COOLDOWN_MS;
                readerPromise = null;
                return null;
            }
        })();
    }
    return readerPromise;
}

/**
 * Resolve the visitor's ISO 3166-1 alpha-2 country from the local
 * GeoLite2 database. Null on any miss — guards not met, db not
 * openable, ip unknown to the db — never throws: geo routing then
 * falls back to the link's default target, which is always safe.
 */
export async function lookupCountry(ip: string | null): Promise<string | null> {
    if (!ip) {
        return null;
    }
    if (!isNodeRuntime()) {
        return null;
    }
    // Dual-channel read: `import.meta.env` is how a var set in
    // `astro/.env` (the channel .env.example documents) reaches Vite
    // builds; `process.env` covers real deploy environments and
    // node:test runs where Vite is absent.
    const dbPath = import.meta.env?.GEOIP_DB_PATH ?? process.env.GEOIP_DB_PATH;
    if (!dbPath) {
        return null;
    }

    const reader = await openReader(dbPath);
    if (!reader) {
        return null;
    }
    try {
        return normaliseCountry(reader.get(ip)?.country?.iso_code);
    } catch {
        return null;
    }
}

/**
 * Resolve the client ip for the GeoIP lookup. `x-forwarded-for`
 * first: on the self-hosted deploys this module targets, Node sits
 * behind a reverse proxy and the socket address
 * (`context.clientAddress`) is the proxy's, not the visitor's. The
 * leftmost XFF entry is the original client.
 */
export function parseClientIp(headers: Headers, clientAddress?: string | null): string | null {
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim();
        if (first) {
            return first;
        }
    }
    const direct = clientAddress?.trim();
    return direct || null;
}

/** Test-only — drops the reader singleton and the failure cooldown. */
export function __resetGeoIpReader(): void {
    readerPromise = null;
    openFailedUntil = 0;
}
