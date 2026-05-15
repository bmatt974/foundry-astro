/**
 * Multi-tenant middleware. Runs on every request, maps the HTTP
 * `Host` header to a website via the Foundry `/resolve` endpoint, and
 * stashes the resolution on `Astro.locals.tenant` for downstream pages.
 *
 * Resolution is cached in a module-scope `Map` keyed by hostname.
 * Both positive and negative results are cached (60s TTL) so a single
 * misconfigured hostname doesn't hammer the API. Module scope means
 * one cache per Node worker; in a multi-worker deploy that's N
 * independent caches, which is acceptable — the upstream `/resolve`
 * endpoint is cheap and rarely contended.
 *
 * Unknown hosts get an explicit 404 instead of falling through to
 * pages: rendering anything for a host the backend doesn't know about
 * leaks information ("this is the Astro server"). Better to look like
 * a parked domain.
 */

import { defineMiddleware } from 'astro:middleware';
import { fetchWebsiteByHost, resolveTenantForBuild, type TenantResolution } from './lib/foundry';

interface CacheEntry {
    /** null encodes a negative cache (host is known-unknown for the TTL window). */
    value: TenantResolution | null;
    expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

const DEFAULT_TEMPLATE = 'basic';

async function resolveHost(host: string): Promise<TenantResolution | null> {
    const cached = cache.get(host);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    const fresh = await fetchWebsiteByHost(host);
    cache.set(host, { value: fresh, expiresAt: Date.now() + CACHE_TTL_MS });
    return fresh;
}

export const onRequest = defineMiddleware(async (context, next) => {
    // Build-time path: Astro runs middleware for prerendered pages but
    // synthesises a request whose headers aren't usable (and trigger a
    // warning if accessed). Resolve the tenant from the env-pinned slug
    // — each static build is scoped to one site.
    let resolved: TenantResolution | null;
    if (context.isPrerendered) {
        resolved = await resolveTenantForBuild();
        if (!resolved) {
            throw new Error(
                'WEBSITE_BUILD_HOSTNAME is required for prerendered builds.',
            );
        }
    } else {
        const rawHost = context.request.headers.get('host');
        if (!rawHost) {
            return new Response('Missing Host header', { status: 400 });
        }
        // Strip the port (`:4321`) before resolving — the backend stores bare
        // hostnames in `website_locales.hostname`. Lowercase for case-insensitive
        // matching against the seeded hostnames.
        const host = rawHost.split(':')[0].toLowerCase();
        resolved = await resolveHost(host);
        if (!resolved) {
            return new Response('Website not configured', { status: 404 });
        }
        // Inject the host we used to resolve so downstream fetch calls
        // can key API URLs by the same hostname (mirrors the build-time
        // resolveTenantForBuild() behaviour).
        resolved.website.hostname = host;
    }

    context.locals.tenant = {
        website: resolved.website,
        locales: resolved.locales,
        defaultLocale: resolved.default_locale,
        template: resolved.website.template ?? DEFAULT_TEMPLATE,
        themeConfig: resolved.website.theme_config ?? {},
    };

    // Make the request locale globally available so deep components
    // (Comparison block, formatters, etc.) don't need to parse the
    // URL themselves. Falls back to the website default when the
    // route has no locale segment (e.g. /).
    const firstSegment = context.url.pathname.split('/').filter(Boolean)[0];
    const looksLikeLocale = firstSegment !== undefined
        && /^[a-z]{2}(-[a-zA-Z]{2,4})?$/.test(firstSegment);
    context.locals.locale = looksLikeLocale && firstSegment !== undefined
        ? firstSegment
        : (resolved.default_locale ?? 'en');

    return next();
});
