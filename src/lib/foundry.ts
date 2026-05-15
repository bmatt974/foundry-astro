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
          featured_image_url: string | null;
      }
    | {
          type: 'place';
          id: number;
          name: string;
          canonical_name: string;
          place_type: string | null;
          coordinates: { lat: number; lon: number } | null;
          country_code: string | null;
          featured_image_url: string | null;
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
    featured_image: string | null;
    position: number;
    published_at: string | null;
    seo: Record<string, unknown> | null;
    settings: Record<string, unknown> | null;
    translation: PageTranslation | null;
    blocks: PageBlock[];
    sourceable: Sourceable | null;
    nav: {
        parent: NavNode | null;
        children: NavNode[];
        siblings: NavNode[];
    };
    available_locales: AvailableLocale[];
}

export interface WebsiteLocale {
    locale: string;
    is_default: boolean;
    enabled: boolean;
    hostname: string;
    path_prefix: string | null;
    base_url: string;
    site_name: string | null;
    meta_title: string | null;
    meta_description: string | null;
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
 */
export interface TenantResolution {
    website: {
        id: number;
        slug: string;
        name: string;
        template: string | null;
        theme_config: Record<string, unknown>;
    };
    locales: WebsiteLocale[];
    default_locale: string | null;
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

export async function fetchWebsite(slug: string): Promise<Website | null> {
    return fetchJson<Website>(`/websites/${encodeURIComponent(slug)}`);
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

export async function fetchRootPages(
    locale: string,
    slug: string,
): Promise<NavNode[]> {
    const list = await fetchJson<NavNode[]>(
        `/websites/${encodeURIComponent(slug)}/${encodeURIComponent(locale)}/pages`,
    );
    return list ?? [];
}

export interface SitemapNode extends NavNode {
    parent_id: number | null;
}

export async function fetchSitemap(
    locale: string,
    slug: string,
): Promise<SitemapNode[]> {
    const list = await fetchJson<SitemapNode[]>(
        `/websites/${encodeURIComponent(slug)}/${encodeURIComponent(locale)}/pages?tree=1`,
    );
    return list ?? [];
}

export async function fetchPageById(
    locale: string,
    id: number | string,
    slug: string,
): Promise<Page | null> {
    return fetchJson<Page>(
        `/websites/${encodeURIComponent(slug)}/${encodeURIComponent(locale)}/preview/${encodeURIComponent(String(id))}`,
    );
}

export async function fetchPage(
    locale: string,
    path: string,
    slug: string,
): Promise<Page | null> {
    // Path may contain slashes ("destinations/italie/rome"); each segment is
    // URL-encoded independently so accented characters survive.
    const encodedPath = path
        .split('/')
        .filter((s) => s.length > 0)
        .map((s) => encodeURIComponent(s))
        .join('/');

    return fetchJson<Page>(
        `/websites/${encodeURIComponent(slug)}/${encodeURIComponent(locale)}/pages/${encodedPath}`,
    );
}
