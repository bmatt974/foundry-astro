/**
 * Laravel-style named-route helper. One registry holds the URL
 * builders for every route the site can produce, and every theme
 * goes through this registry — never hard-codes a path like
 * `/${locale}/${slug}`. The benefits stack:
 *
 *   - **Anti-footprint**: each locale picks its native segment
 *     ("authors" / "auteurs" / "autores" …), and per-site
 *     `wording[routes.*]` overrides rename it further so two
 *     sister sites don't share the same utility URL.
 *   - **Routing-mode aware**: respects the locale's `path_prefix`
 *     — root-mounted locales emit `/colosseum`, prefixed locales
 *     emit `/fr/colisee`, sub-domain mode emits `/colisee`. All
 *     three modes flow through the same call site.
 *   - **Single source of truth**: the CMS's `sitemap-urls`
 *     controller (`LocalisedSegments` on the PHP side) and Astro
 *     both read the same `WebsiteLocale` row. Drift is structural,
 *     not accidental.
 *   - **Refactor-safe**: changing the URL shape for a route type
 *     is one edit in `ROUTES`, picked up by every component.
 *
 * Usage in an .astro component (most common — active locale):
 *
 *   const route = Astro.locals.route;
 *   <a href={route('home')}>{websiteName}</a>
 *   <a href={route('page', { slug: 'colosseum' })}>Colosseum</a>
 *   <a href={route('author', { slug: 'sophie' })}>Sophie</a>
 *
 * Usage for hreflang / non-active locale (e.g. LocaleSwitcher):
 *
 *   const row = tenant.locales.find(l => l.locale === otherLocale);
 *   const otherRoute = useRoutes(row);
 *   otherRoute.path('page', { slug })   // path-only for pageLocales
 *
 * The factory contract is identical on both sides; the only
 * difference is whether you grab the pre-built one off
 * `Astro.locals.route` or build a fresh one per locale row.
 */
import type { WebsiteLocale } from './foundry.ts';
import { __ } from './i18n/index.ts';

/**
 * Trim slashes / whitespace and convert internal slashes to dashes
 * so an admin-supplied wording string can't break the
 * `/{locale}/{segment}/{slug}` route shape. Mirrors the PHP
 * implementation in `LocalisedSegments::wordingOverride`.
 */
function sanitiseSegment(raw: string): string {
    return raw.trim().replace(/^\/+|\/+$/g, '').replaceAll('/', '-');
}

/**
 * Normalise `path_prefix` into the leading-slash, no-trailing-slash
 * form the URL builders expect. Returns '' for root-mounted locales.
 */
function normalisePrefix(pathPrefix: string | null | undefined): string {
    if (!pathPrefix) {
        return '';
    }
    const trimmed = pathPrefix.replace(/^\/+|\/+$/g, '');
    return trimmed === '' ? '' : `/${trimmed}`;
}

/**
 * Resolve a wording override (sanitised) or return the dictionary
 * default. `wording[key]` wins when non-empty after sanitising.
 */
function segmentForKey(
    key: string,
    locale: string,
    wording: Record<string, string> | null | undefined,
): string {
    const override = wording?.[key];
    if (typeof override === 'string') {
        const clean = sanitiseSegment(override);
        if (clean !== '') {
            return clean;
        }
    }

    return __(key as Parameters<typeof __>[0], locale);
}

interface RouteContext {
    locale: string;
    prefix: string;
    wording: Record<string, string> | null | undefined;
}

/**
 * Single registry of every named route. Each entry returns a `url`
 * (full path including locale prefix). Adding a new route is one
 * entry here; the helper picks up the new name with full type safety.
 */
const ROUTES = {
    home: (ctx: RouteContext, _params: Record<string, never>) => ({
        url: ctx.prefix === '' ? '/' : `${ctx.prefix}/`,
    }),
    page: (ctx: RouteContext, params: { slug: string }) => ({
        url: ctx.prefix === '' ? `/${params.slug}` : `${ctx.prefix}/${params.slug}`,
    }),
    author: (ctx: RouteContext, params: { slug: string }) => {
        const segment = segmentForKey('routes.authorsPrefix', ctx.locale, ctx.wording);
        return {
            url: ctx.prefix === ''
                ? `/${segment}/${params.slug}`
                : `${ctx.prefix}/${segment}/${params.slug}`,
        };
    },
} as const;

export type RouteName = keyof typeof ROUTES;

type RouteParams<N extends RouteName> = Parameters<typeof ROUTES[N]>[1];

/**
 * Factory-bound route helper. Call once at the top of a component
 * frontmatter (or grab the pre-built one off `Astro.locals.route`),
 * then use `route(name, params)` or `route.path(...)` throughout
 * the markup.
 */
export interface RouteHelper {
    /** Full URL — `/{prefix}/{segment}/{slug}`. */
    <N extends RouteName>(name: N, params: RouteParams<N>): string;
    /** Path only — same as the URL but with no leading locale prefix.
     *  Used by LocaleSwitcher.pageLocales which prepends `/{locale}/`
     *  itself. For root-mounted locales the path and URL coincide
     *  apart from the leading slash. */
    path<N extends RouteName>(name: N, params: RouteParams<N>): string;
}

/**
 * Build a route helper for one locale. Pass the full `WebsiteLocale`
 * row from `tenant.locales` so URL generation respects path_prefix,
 * locale and wording overrides in one call. For the active locale,
 * prefer the pre-built helper on `Astro.locals.route`.
 */
export function useRoutes(localeRow: WebsiteLocale | null | undefined): RouteHelper {
    const ctx: RouteContext = {
        locale: localeRow?.locale ?? 'en',
        prefix: normalisePrefix(localeRow?.path_prefix),
        wording: localeRow?.wording,
    };

    const url = <N extends RouteName>(name: N, params: RouteParams<N>): string => {
        const fn = ROUTES[name] as (c: RouteContext, p: RouteParams<N>) => { url: string };
        return fn(ctx, params).url;
    };
    const path = <N extends RouteName>(name: N, params: RouteParams<N>): string => {
        const u = url(name, params);
        // The "path" form drops the prefix — used by LocaleSwitcher
        // which prepends `/{locale}/`. For root-mounted locales the
        // URL has no prefix, so we just strip the leading slash.
        if (ctx.prefix !== '' && u.startsWith(`${ctx.prefix}/`)) {
            return u.slice(ctx.prefix.length + 1);
        }
        return u.replace(/^\/+/, '');
    };

    return Object.assign(url, { path }) as RouteHelper;
}
