/**
 * Shared sitemap helpers used by the three Astro endpoints:
 *
 *   /sitemap.xml              — sitemap index (lists all sub-files)
 *   /sitemap-<kind>-<locale>(-<n>).xml — per-(kind, locale) urlsets
 *   /robots.txt               — pointer to the index
 *
 * Each endpoint is SSR (no `prerender`) so dev mode (`npm run dev`)
 * serves them dynamically against the live CMS. In production the
 * SSR Node entry handles them at request time — crawler hits are
 * infrequent and the sitemap-urls fetch is one cheap API call.
 *
 * To avoid the index + every sub-sitemap each doing a fresh fetch
 * within the same crawl, `fetchAndGroupUrls()` memoises the result
 * for 10s per hostname in module scope. A bot crawling all sub-
 * sitemaps in sequence pays one CMS round-trip instead of N.
 */
import { fetchSitemapUrls, type SitemapUrl } from './foundry';

export interface SitemapStyleOptions {
    /** Public URL of the XSL stylesheet to declare, or `null` to skip. */
    xslHref?: string | null;
    /** XML/HTML comment inserted right after the stylesheet declaration. */
    generatorComment?: string | null;
}

const URLS_PER_SITEMAP = 10_000;
const CACHE_TTL_MS = 10_000;

const KINDS = ['page', 'author', 'landing'] as const;
type SitemapKind = (typeof KINDS)[number];

export interface SitemapGroup {
    /** URL slug used in the filename, e.g. `page-en` or `page-en-2`. */
    slug: string;
    kind: SitemapKind;
    locale: string;
    chunkIndex: number;
    urls: SitemapUrl[];
    /** Latest `lastmod` across the group's URLs, or `null` when none carry one. */
    lastmod: string | null;
}

interface CacheEntry {
    groups: SitemapGroup[];
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Fetch every URL for the website, drop redirects (those live in
 * the platform's native redirect file), group by (kind, locale),
 * and chunk each group at {@link URLS_PER_SITEMAP} entries. Results
 * are cached in module scope for {@link CACHE_TTL_MS} ms.
 */
export async function fetchAndGroupUrls(hostname: string): Promise<SitemapGroup[]> {
    const cached = cache.get(hostname);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.groups;
    }

    const urls = await fetchSitemapUrls(hostname, {});

    const buckets = new Map<string, SitemapUrl[]>();
    for (const url of urls) {
        if (url.kind === 'redirect') continue;
        const key = `${url.kind}-${url.locale}`;
        const list = buckets.get(key) ?? [];
        list.push(url);
        buckets.set(key, list);
    }

    const groups: SitemapGroup[] = [];
    for (const [key, groupUrls] of buckets) {
        const [kind, locale] = key.split('-', 2) as [SitemapKind, string];
        const chunks = chunk(groupUrls, URLS_PER_SITEMAP);
        for (let i = 0; i < chunks.length; i++) {
            const suffix = chunks.length > 1 ? `-${i + 1}` : '';
            groups.push({
                slug: `${kind}-${locale}${suffix}`,
                kind,
                locale,
                chunkIndex: i,
                urls: chunks[i],
                lastmod: latestLastmod(chunks[i]),
            });
        }
    }

    cache.set(hostname, { groups, expiresAt: Date.now() + CACHE_TTL_MS });
    return groups;
}

export function renderSitemapIndex(groups: SitemapGroup[], baseUrl: string, style: SitemapStyleOptions = {}): string {
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
    appendStylePreamble(lines, style);
    lines.push('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    for (const group of groups) {
        lines.push('  <sitemap>');
        lines.push(`    <loc>${escapeXml(`${baseUrl}/sitemap-${group.slug}.xml`)}</loc>`);
        if (group.lastmod) {
            lines.push(`    <lastmod>${escapeXml(group.lastmod)}</lastmod>`);
        }
        lines.push('  </sitemap>');
    }
    lines.push('</sitemapindex>');
    return lines.join('\n') + '\n';
}

export function renderUrlset(urls: SitemapUrl[], baseUrl: string, style: SitemapStyleOptions = {}): string {
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
    appendStylePreamble(lines, style);
    lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    for (const url of urls) {
        lines.push('  <url>');
        lines.push(`    <loc>${escapeXml(`${baseUrl}${url.path}`)}</loc>`);
        if (url.lastmod) {
            lines.push(`    <lastmod>${escapeXml(url.lastmod)}</lastmod>`);
        }
        lines.push('  </url>');
    }
    lines.push('</urlset>');
    return lines.join('\n') + '\n';
}

/** XML response with cache headers tuned for a sitemap-style endpoint. */
export function xmlResponse(body: string): Response {
    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=600, s-maxage=600',
        },
    });
}

function appendStylePreamble(lines: string[], style: SitemapStyleOptions): void {
    if (style.xslHref) {
        lines.push(`<?xml-stylesheet type="text/xsl" href="${style.xslHref}"?>`);
    }
    if (style.generatorComment) {
        lines.push(`<!--${style.generatorComment}-->`);
    }
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}

function latestLastmod(urls: SitemapUrl[]): string | null {
    let max: string | null = null;
    for (const url of urls) {
        if (url.lastmod && (max === null || url.lastmod > max)) {
            max = url.lastmod;
        }
    }
    return max;
}

function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}
