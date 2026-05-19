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
import { matchAffiliateClickPath, redirectClick } from './lib/affiliate-redirect';
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
    // Affiliate click dispatcher — short-circuits before any tenant
    // resolution so a click never pays for a CMS round-trip. Matches
    // `/{prefix}/{id}` where prefix is in the allow-list (see
    // `AFFILIATE_PROXY_PREFIXES` in lib/affiliate-redirect.ts).
    // Anything else falls through to the normal page routing.
    const affiliateMatch = matchAffiliateClickPath(context.url.pathname);
    if (affiliateMatch) {
        return redirectClick({
            id: affiliateMatch.id,
            request: context.request,
            origin: context.url.origin,
        });
    }

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

    let template = resolved.website.template ?? DEFAULT_TEMPLATE;

    // Dev-only theme override: `?theme=<name>` sets the active theme
    // for this request and persists via a session cookie so links on
    // the page keep the chosen theme. `?theme=` (empty) clears it and
    // reverts to the website's configured template. Unknown names
    // silently fall back to `basic` via the registry. Gated on DEV so
    // production builds ignore the param entirely — `astro dev` runs
    // even prerendered routes on demand, so the override reaches every
    // page locally.
    if (import.meta.env.DEV) {
        const queryOverride = context.url.searchParams.get('theme');
        if (queryOverride !== null) {
            if (queryOverride === '') {
                context.cookies.delete('foundry_dev_theme', { path: '/' });
            } else {
                context.cookies.set('foundry_dev_theme', queryOverride, {
                    path: '/',
                    httpOnly: false,
                    sameSite: 'lax',
                });
                template = queryOverride;
            }
        } else {
            const cookieOverride = context.cookies.get('foundry_dev_theme')?.value;
            if (cookieOverride) {
                template = cookieOverride;
            }
        }
    }

    context.locals.tenant = {
        website: resolved.website,
        locales: resolved.locales,
        defaultLocale: resolved.default_locale,
        template,
        themeConfig: resolved.website.theme_config ?? {},
        experiments: resolved.experiments,
        team: resolved.team,
        primaryAuthor: resolved.primary_author,
    };

    // Resolve the active locale against the tenant's locale rows,
    // matching on `path_prefix` rather than a generic 2-letter regex.
    // Supports all three Foundry routing modes uniformly:
    //
    //   1. Sub-directory with prefix on EVERY locale (`/en/…`, `/fr/…`)
    //      → longest-prefix match picks the locale from the URL.
    //   2. Sub-directory with default locale at root (`/colosseum`,
    //      `/fr/colisee`)   → only non-default locales have a prefix;
    //      paths without any matching prefix fall back to the default.
    //   3. Sub-domain or different TLD (`fr.example.com/colisee` or
    //      `example.fr/colisee`)   → no prefix on any locale; the
    //      hostname-driven tenant resolution already pinned the right
    //      website, and the locale falls back to that tenant's default.
    //
    // The previous regex-based heuristic broke modes 2-3: it treated
    // any 2-letter first segment as a locale, even when no locale row
    // actually had that prefix (e.g. `/ab` was mis-parsed as locale
    // `ab`, leaking through to the 404 fallback).
    //
    // The dev preview route prefixes URLs with `/preview/<locale>/…`,
    // so we honour that explicit hint when the first segment is
    // literally `preview`.
    const pathname = context.url.pathname;
    let activeLocale = resolved.default_locale ?? 'en';
    if (pathname.startsWith('/preview/')) {
        const previewSegments = pathname.split('/').filter(Boolean);
        const explicit = previewSegments[1];
        if (explicit !== undefined && resolved.locales.some((l) => l.locale === explicit)) {
            activeLocale = explicit;
        }
    } else {
        // Longest-prefix wins, so a deeper `/blog/fr` would beat a
        // bare `/fr` if both were configured. Today every Foundry
        // path_prefix is a single segment, but the algorithm is
        // future-proof.
        let bestLength = 0;
        for (const localeRow of resolved.locales) {
            if (!localeRow.path_prefix) {
                continue;
            }
            const prefix = localeRow.path_prefix.startsWith('/')
                ? localeRow.path_prefix
                : `/${localeRow.path_prefix}`;
            const matches = pathname === prefix || pathname.startsWith(`${prefix}/`);
            if (matches && prefix.length > bestLength) {
                activeLocale = localeRow.locale;
                bestLength = prefix.length;
            }
        }
    }
    context.locals.locale = activeLocale;

    // Surface the active locale's per-site `wording` overrides — null
    // when the locale has no overrides, or when no locale row matches
    // (the dictionary fallback then kicks in inside `useTranslations`).
    const activeLocaleRow = resolved.locales.find(
        (row) => row.locale === activeLocale,
    );
    context.locals.wording = activeLocaleRow?.wording ?? null;

    return next();
});
