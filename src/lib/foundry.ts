/**
 * Foundry headless CMS client.
 *
 * The Laravel backend exposes two endpoints under /api/v1:
 *   - GET /websites/{slug}                          → site metadata
 *   - GET /websites/{slug}/{locale}/pages/{path}    → page + blocks
 *
 * Configure the base URL via the FOUNDRY_API_URL env var. The serving
 * website is resolved per-request from the HTTP Host header by the
 * Astro middleware — every fetch in this file takes the resolved
 * `slug` as an argument; there is no single-tenant fallback.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type BlockType =
    | 'text'
    | 'key_facts'
    | 'faq'
    | 'quote'
    | 'summary'
    | 'image'
    | 'gallery'
    | 'youtube'
    | 'audio'
    | 'cta'
    | 'comparison'
    | 'top_list'
    | 'product_card'
    | 'section'
    | 'divider';

export interface PageBlock {
    id: number;
    block_type: BlockType;
    /** Opaque per-theme variant identifier — picks which visual rendering
     *  of `block_type` to use (e.g. `editorial-split` vs `immersive-cover`
     *  for a `hero` block). `null` falls back to the theme's default
     *  variant. Theme components are responsible for accepting unknown
     *  variants gracefully (default rendering). */
    variant: string | null;
    cluster_block_key: string | null;
    related_page_id: number | null;
    position: number;
    settings: Record<string, unknown> | null;
    media: Record<string, unknown> | null;
    /** Free-form, shape depends on block_type — see PageBlockType::contentSchema() on the Laravel side. */
    content: Record<string, unknown> | null;
    children: PageBlock[];
}

export interface PageTranslation {
    locale: string;
    slug: string | null;
    eyebrow: string | null;
    title: string;
    subtitle: string | null;
    intro: string | null;
    body: string | null;
    conclusion: string | null;
    highlights: unknown[] | null;
    snippet: string | null;
    meta_title: string | null;
    meta_description: string | null;
    published_at: string | null;
}

export interface NavNode {
    id: number;
    slug: string | null;
    title: string;
    page_type: string | null;
    position: number;
}

export type Sourceable =
    | {
          type: 'destination';
          id: number;
          name: string;
          canonical_name: string;
          destination_type: string | null;
          coordinates: { lat: number; lon: number } | null;
          country: { iso_code: string; name: string } | null;
          population: number | null;
          cover_image: string | null;
      }
    | {
          type: 'place';
          id: number;
          name: string;
          canonical_name: string;
          place_type: string | null;
          coordinates: { lat: number; lon: number } | null;
          country_code: string | null;
          website: string | null;
          cover_image: string | null;
      }
    | {
          type: 'destination_country';
          id: number;
          iso_code: string;
          name: string;
          continent: string | null;
      };

export interface AvailableLocale {
    locale: string;
    slug: string | null;
}

export interface Page {
    id: number;
    website_id: number;
    page_type: string | null;
    template: string | null;
    is_indexable: boolean;
    cover_image: string | null;
    position: number;
    published_at: string | null;
    seo: Record<string, unknown> | null;
    settings: Record<string, unknown> | null;
    translation: PageTranslation | null;
    blocks: PageBlock[];
    sourceable: Sourceable | null;
    nav: {
        parent: NavNode | null;
        /** Full ancestor chain ordered root → direct parent (excludes
         *  current page). Empty when the page is itself a root. */
        breadcrumb: NavNode[];
        children: NavNode[];
        siblings: NavNode[];
    };
    /** Byline authors in render order (lead first). The CMS-side
     *  fallback chain (page authors → website primary author) is
     *  already applied — an empty array means truly no byline. */
    authors: Author[];
    available_locales: AvailableLocale[];
    /** Per-page custom HTML injections (hub-scoped / page-scoped /
     *  pattern-scoped). `WebsiteCustomInjection.scope_type='website'`
     *  rows are NOT included here — those ship on /resolve and
     *  stay cached host-wide. */
    injections: PageInjection[];
}

export interface PageInjection {
    position: 'head' | 'body_start' | 'body_end';
    label: string;
    body: string;
    scope_type: 'hub' | 'page' | 'pattern';
}

export type DeployProvider =
    | 'cloudflare_pages'
    | 'netlify'
    | 'vercel'
    | 'bucket_s3';

export interface WebsiteLocale {
    locale: string;
    is_default: boolean;
    enabled: boolean;
    hostname: string;
    /** Where this locale's static output should be deployed. Null when
     *  the editor hasn't picked a target yet (the regen worker logs and
     *  skips deployment in that case). */
    deploy_provider: DeployProvider | null;
    path_prefix: string | null;
    base_url: string;
    site_name: string | null;
    meta_title: string | null;
    meta_description: string | null;
    /** Per-site UI string overrides keyed by Astro i18n dot-notation
     *  paths. Null = no overrides, fallback to the compile-time
     *  dictionary. Anti-footprint lever: lets each site phrase the
     *  same UI element differently. */
    wording: Record<string, string> | null;
}

/**
 * One translation row of an Author, rendered on the public site
 * (byline + bio card + /authors/{slug} page).
 */
export interface AuthorTranslation {
    name: string;
    title?: string | null;
    bio_short?: string | null;
    /** Full markdown body, only present in /resolve payloads (the team[]
     *  carries it so the dedicated /authors/{slug} route doesn't need
     *  a second round-trip). Absent on `page.authors[]` rows. */
    bio?: string | null;
}

/**
 * Public-facing author. `translations` is keyed by locale so
 * components do `author.translations[locale]` without searching a
 * list. The Foundry CMS guarantees the empty case serialises as
 * `{}` (object), never `[]`.
 */
export interface Author {
    slug: string;
    photo_url: string | null;
    external_url: string | null;
    twitter_handle: string | null;
    position: number;
    translations: Record<string, AuthorTranslation>;
}

export interface Website {
    id: number;
    name: string;
    slug: string;
    type: string | null;
    theme: string | null;
    template: string | null;
    theme_config: Record<string, unknown>;
    status: number | null;
    persona: { id: number; key: string; name: string } | null;
    locales: WebsiteLocale[];
    default_locale: string | null;
    settings: Record<string, unknown> | null;
}

/**
 * Slim payload returned by `/api/v1/resolve?host=...` and consumed by
 * the Astro middleware. Only the fields the middleware / pages actually
 * read on every request — keep it small because every response is
 * cached per host.
 *
 * `website.hostname` is injected client-side (the resolved hostname,
 * either from the Host header at runtime or from WEBSITE_BUILD_HOSTNAME
 * at build time). It is what subsequent fetch calls use to key API URLs.
 */
export type Posture = 'whitehat' | 'greyhat' | 'blackhat';
export type JsonLdLevel = 'none' | 'article_only' | 'cms_standard' | 'wp_blog_full' | 'tourist_entity';
export type LinkProxyPath = 'view' | 'details' | 'info' | 'visit' | 'out' | 'go';

/**
 * Per-website experimental axes resolved server-side by Foundry's
 * `ExperimentsResolver`. Every axis is filled (either explicit
 * override or per-posture default) so the Astro side can read
 * unconditionally — no fallback logic on the frontend.
 *
 *   posture          overall SEO posture, drives defaults
 *   jsonld_level     how much schema.org JSON-LD the page emits
 *   link_proxy_path  the URL prefix the /go/ redirector lives behind,
 *                    varied per site to break cross-site fingerprint
 *                    on the affiliate stack (`/visit/{id}`,
 *                    `/details/{id}`, `/info/{id}`, …)
 */
export interface WebsiteExperiments {
    posture: Posture;
    jsonld_level: JsonLdLevel;
    link_proxy_path: LinkProxyPath;
}

export interface TenantResolution {
    website: {
        id: number;
        slug: string;
        hostname: string;
        name: string;
        template: string | null;
        /** Optional admin pin for the anti-footprint preset (head
         *  tags + favicon mode). Null = let the theme auto-pick. */
        fingerprint_preset: string | null;
        theme_config: Record<string, unknown>;
    };
    locales: WebsiteLocale[];
    default_locale: string | null;
    experiments: WebsiteExperiments;
    /** All enabled authors for this site, ordered by position. Carries
     *  the full `bio` markdown body so the /authors/{slug} route can
     *  render the public profile page without a separate fetch. */
    team: Author[];
    /** Default byline author. Used by `page.authors` fallback when the
     *  page has no explicit attribution. */
    primary_author: Author | null;
    /** Admin-supplied raw HTML snippets injected into every page of
     *  this website — verification meta tags, GTM / GA4 scripts,
     *  custom stylesheets, third-party widgets. Each entry carries a
     *  position (`head` | `body_start` | `body_end`), an admin-facing
     *  label, the raw body, and an optional locale narrowing. */
    injections: CustomInjection[];
}

export interface CustomInjection {
    position: 'head' | 'body_start' | 'body_end';
    label: string;
    body: string;
    locale: string | null;
}

// ──────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────

/**
 * Trailing-slash-free API base, e.g. "http://foundry.test/api/v1".
 */
function apiBase(): string {
    const raw = import.meta.env.FOUNDRY_API_URL ?? 'http://foundry.test/api/v1';
    return raw.replace(/\/+$/, '');
}

/**
 * Preview token forwarded to the Laravel API so the same Astro instance can
 * serve drafts. Set FOUNDRY_PREVIEW_TOKEN in .env to enable.
 */
function previewToken(): string | null {
    return import.meta.env.FOUNDRY_PREVIEW_TOKEN ?? null;
}

// ──────────────────────────────────────────────
// HTTP
// ──────────────────────────────────────────────

interface ApiResponse<T> {
    data: T;
}

async function fetchJson<T>(path: string): Promise<T | null> {
    const url = `${apiBase()}${path}`;
    const headers: Record<string, string> = {
        Accept: 'application/json',
    };
    const token = previewToken();
    if (token) {
        headers['X-Preview-Token'] = token;
    }

    const response = await fetch(url, { headers });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`Foundry API ${response.status} ${response.statusText} — ${url}`);
    }

    const body = (await response.json()) as ApiResponse<T>;
    return body.data;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export async function fetchWebsite(hostname: string): Promise<Website | null> {
    return fetchJson<Website>(`/websites/${encodeURIComponent(hostname)}`);
}

/**
 * Resolve an incoming HTTP host to its serving website. Hits the
 * `/resolve` endpoint introduced in phase 1 of the multi-tenant
 * rollout. Returns null when the host is unknown — caller (typically
 * the middleware) handles the 404 response.
 */
export async function fetchWebsiteByHost(host: string): Promise<TenantResolution | null> {
    return fetchJson<TenantResolution>(`/resolve?host=${encodeURIComponent(host)}`);
}

/**
 * Optional locale filter, sourced from the env at build time. When set,
 * `getStaticPaths()` only emits paths for those locales — the unlisted
 * locales' subtrees are skipped entirely.
 *
 * Designed for the 60-locale scale: a GitHub Actions matrix (or VPS
 * worker pool) builds each locale in parallel via N jobs with
 * `WEBSITE_BUILD_LOCALES=fr`, `WEBSITE_BUILD_LOCALES=en`, etc.
 *
 * Returns `null` when unset (= include every enabled locale of the
 * website).
 */
export function buildLocalesFilter(): Set<string> | null {
    const raw = import.meta.env.WEBSITE_BUILD_LOCALES;
    if (!raw) {
        return null;
    }
    const entries = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    return entries.length > 0 ? new Set(entries) : null;
}

/**
 * Build-time tenant resolution. Used when prerendering routes:
 * Astro synthesises a request context without a real Host header so
 * `fetchWebsiteByHost` has nothing to resolve. Reading
 * `WEBSITE_BUILD_HOSTNAME` from the env keeps each static build
 * scoped to exactly one website (one build = one site).
 *
 * Returns the same shape as `fetchWebsiteByHost` — the hostname from
 * the env is injected on the resolved `website.hostname` so downstream
 * fetch calls use the same key.
 */
export async function resolveTenantForBuild(): Promise<TenantResolution | null> {
    const hostname = import.meta.env.WEBSITE_BUILD_HOSTNAME;
    if (!hostname) {
        return null;
    }

    const resolution = await fetchWebsiteByHost(hostname);
    if (!resolution) {
        return null;
    }

    resolution.website.hostname = hostname;

    return resolution;
}

/**
 * Module-scope cache for root pages — called on every article render by
 * the Layout's header/footer. Without this, a typical page does an
 * extra round-trip just to redraw the same site nav. 60s TTL matches
 * the middleware's tenant cache.
 */
const rootPagesCache = new Map<string, { data: NavNode[]; expiresAt: number }>();
const ROOT_PAGES_TTL_MS = 60_000;

export async function fetchRootPages(
    locale: string,
    hostname: string,
): Promise<NavNode[]> {
    const key = `${hostname}::${locale}`;
    const cached = rootPagesCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }

    const list = await fetchJson<NavNode[]>(
        `/websites/${encodeURIComponent(hostname)}/${encodeURIComponent(locale)}/pages`,
    );
    const data = list ?? [];
    rootPagesCache.set(key, { data, expiresAt: Date.now() + ROOT_PAGES_TTL_MS });

    return data;
}

export interface SitemapNode extends NavNode {
    parent_id: number | null;
}

export type MenuItemType =
    | 'page'
    | 'page_slug'
    | 'external'
    | 'heading'
    | 'spacer'
    | 'divider';

export interface MenuItem {
    id: number;
    type: MenuItemType;
    parent_id: number | null;
    position: number;
    label: string | null;
    href: string | null;
    title_attribute: string | null;
    css_class: string | null;
    icon: string | null;
    open_in_new_tab: boolean;
    /** Forwarded untouched from the backend; the frontend evaluates them
     *  against the current page context. Null = always visible. */
    visibility_rules: Record<string, unknown> | null;
    children: MenuItem[];
}

export async function fetchSitemap(
    locale: string,
    hostname: string,
): Promise<SitemapNode[]> {
    const list = await fetchJson<SitemapNode[]>(
        `/websites/${encodeURIComponent(hostname)}/${encodeURIComponent(locale)}/pages?tree=1`,
    );
    return list ?? [];
}

/**
 * Card-friendly article shape returned by the author-detail endpoint
 * for the author profile page. Just enough fields to render a list
 * of cards without per-article round-trips. `pinned_at !== null` =
 * the article is featured (sorted at the top, most recent pin first).
 */
export interface AuthorArticle {
    id: number;
    slug: string;
    page_type: string | null;
    cover_image: string | null;
    title: string;
    snippet: string | null;
    published_at: string | null;
    pinned_at: string | null;
}

/**
 * Full author profile payload — bio (markdown) + ordered articles.
 * Fetched at build time by the `[authorsPrefix]/[slug]` route, not
 * surfaced on `/resolve` (the tenant cache stays lean — only the
 * thinner `team[]` shape ships there).
 */
export interface AuthorDetail {
    slug: string;
    photo_url: string | null;
    external_url: string | null;
    twitter_handle: string | null;
    locale: string;
    identity: {
        name: string;
        title: string | null;
        bio_short: string | null;
        bio: string | null;
    } | null;
    articles: AuthorArticle[];
}

export async function fetchAuthorDetail(
    locale: string,
    slug: string,
    hostname: string,
): Promise<AuthorDetail | null> {
    return fetchJson<AuthorDetail>(
        `/websites/${encodeURIComponent(hostname)}/${encodeURIComponent(locale)}/authors/${encodeURIComponent(slug)}`,
    );
}

/**
 * Entry from the sitemap-urls endpoint. Each row describes one
 * public URL the website serves with everything the Astro catch-all
 * route needs to dispatch rendering (no second round-trip per URL).
 *
 * `kind === 'redirect'` rows carry an extra `target` + `status` —
 * the catch-all renders these as HTTP 301/302 via Astro.redirect()
 * so existing inbound links to renamed pages keep working. Source:
 * `page_translations.previous_slugs` + `authors.previous_slugs`,
 * maintained by an Eloquent observer on slug rename.
 */
export interface SitemapUrl {
    /** Leading slash, no host — e.g. `/fr/auteurs/sophie`. */
    path: string;
    kind: 'page' | 'author' | 'landing' | 'redirect';
    locale: string;
    /** `page:<id>` | `author:<slug>` | `landing:<locale>` | `redirect:page:<id>` | `redirect:author:<slug>`. */
    ref: string;
    /** Only set when `kind === 'redirect'` — the URL to redirect to. */
    target?: string;
    /** Only set when `kind === 'redirect'` — HTTP status (default 301). */
    status?: 301 | 302 | 307 | 308;
    /** Last-modified timestamp for page / author entries — ISO8601.
     *  Used by the build's sitemap.xml generator. Absent for
     *  landings and redirects. */
    lastmod?: string;
}

/**
 * Page through the sitemap-urls endpoint and return every entry as
 * a flat list. Filters (refs, paths_glob, locale) are forwarded to
 * the API. Pagination is invisible to callers — the helper loops
 * until `meta.last_page`. At ~10k entries per page, a 1M-page site
 * costs ~100 requests for a full enumeration; surgical-regen runs
 * with `refs[]` finish in a single request.
 */
export async function fetchSitemapUrls(
    hostname: string,
    options: {
        refs?: string[];
        pathsGlob?: string[];
        locale?: string;
        perPage?: number;
    } = {},
): Promise<SitemapUrl[]> {
    const perPage = options.perPage ?? 10000;
    const baseQuery = new URLSearchParams();
    for (const ref of options.refs ?? []) {
        baseQuery.append('refs[]', ref);
    }
    for (const glob of options.pathsGlob ?? []) {
        baseQuery.append('paths_glob[]', glob);
    }
    if (options.locale) {
        baseQuery.set('locale', options.locale);
    }
    baseQuery.set('per_page', String(perPage));

    const all: SitemapUrl[] = [];
    let page = 1;
    while (true) {
        const query = new URLSearchParams(baseQuery);
        query.set('page', String(page));
        const response = await fetchJson<{
            urls: SitemapUrl[];
            meta: { page: number; per_page: number; total: number; last_page: number };
        }>(
            `/websites/${encodeURIComponent(hostname)}/sitemap-urls?${query.toString()}`,
        );
        if (response === null) {
            return [];
        }
        all.push(...response.urls);
        if (page >= response.meta.last_page) {
            break;
        }
        page += 1;
    }

    return all;
}

/**
 * Surgical-regen filter sourced from the env at build time. Replaces
 * the old path-based `WEBSITE_BUILD_PATHS` with semantic entity
 * refs:
 *
 *   WEBSITE_BUILD_REFS="page:185,author:sophie,landing:fr"
 *
 * Empty / unset → no filter (full sitemap). The CMS expands each
 * ref into the full URL set (one URL per locale that has a
 * translation), robust to slug renames.
 */
export function buildRefsFilter(): string[] {
    const raw = import.meta.env.WEBSITE_BUILD_REFS;
    if (!raw) {
        return [];
    }

    return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/**
 * Wildcard-path surgical-regen filter for structural changes
 * (e.g. URL section moved). Combined with refs filter when both
 * are set.
 *
 *   WEBSITE_BUILD_PATHS_GLOB="*\/rome\/*,*\/paris\/*"
 */
export function buildPathsGlobFilter(): string[] {
    const raw = import.meta.env.WEBSITE_BUILD_PATHS_GLOB;
    if (!raw) {
        return [];
    }

    return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/**
 * Per-(host, locale, location) cache for menus — called by the Layout
 * on every page render. Hits the API at most once per minute per key.
 */
const menuCache = new Map<string, { data: MenuItem[]; expiresAt: number }>();
const MENU_TTL_MS = 60_000;

export async function fetchMenu(
    location: string,
    locale: string,
    hostname: string,
): Promise<MenuItem[]> {
    const key = `${hostname}::${locale}::${location}`;
    const cached = menuCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }

    const list = await fetchJson<MenuItem[]>(
        `/websites/${encodeURIComponent(hostname)}/${encodeURIComponent(locale)}/menus/${encodeURIComponent(location)}`,
    );
    const data = list ?? [];
    menuCache.set(key, { data, expiresAt: Date.now() + MENU_TTL_MS });

    return data;
}

export async function fetchPageById(
    locale: string,
    id: number | string,
    hostname: string,
): Promise<Page | null> {
    return fetchJson<Page>(
        `/websites/${encodeURIComponent(hostname)}/${encodeURIComponent(locale)}/preview/${encodeURIComponent(String(id))}`,
    );
}

export async function fetchPage(
    locale: string,
    path: string,
    hostname: string,
): Promise<Page | null> {
    // Path may contain slashes ("destinations/italie/rome"); each segment is
    // URL-encoded independently so accented characters survive.
    const encodedPath = path
        .split('/')
        .filter((s) => s.length > 0)
        .map((s) => encodeURIComponent(s))
        .join('/');

    return fetchJson<Page>(
        `/websites/${encodeURIComponent(hostname)}/${encodeURIComponent(locale)}/pages/${encodedPath}`,
    );
}
