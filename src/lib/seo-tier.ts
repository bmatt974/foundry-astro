/**
 * Per-page SEO tier. Anti-footprint: not every page on a real site
 * ships the same perfect SEO surface. Real publishers polish a
 * handful of money pages and let the long-tail run with basic
 * meta only. Mimicking that distribution hides the "every page is
 * perfectly optimised" AI giveaway.
 *
 * The tier is deterministic — same page on the same site always
 * lands in the same bucket — so rebuilds don't flap visible SEO
 * signals (which would itself look automated).
 *
 * Distribution (rough, can be retuned per anti-footprint testing):
 *
 *   30% featured  — full suite: JSON-LD schema, og:image,
 *                   twitter:card, canonical, hreflang
 *   50% standard  — og + canonical + hreflang, no schema
 *   20% light     — title + description + canonical, no og:image,
 *                   no twitter, no schema
 *
 * Pages that ship affiliate / conversion blocks should be pinned
 * to `featured` upstream (revenue beats anti-footprint variance).
 * That override hook lives on `Page.seo_tier` once we add it
 * server-side — for now every page is purely seed-derived.
 */
import { favHash } from './anti-footprint/util.ts';
import type { Page } from './foundry';
import type { TenantContext } from './seo';

export type SeoTier = 'featured' | 'standard' | 'light';

export function computePageTier(page: Page | null, tenant: TenantContext): SeoTier {
    if (page === null) {
        // Synthetic / landing pages — keep them at standard so
        // they don't degrade unexpectedly.
        return 'standard';
    }

    // 1. Admin override wins — `page.seo_tier` set in Filament.
    if (page.seo_tier === 'featured' || page.seo_tier === 'standard' || page.seo_tier === 'light') {
        return page.seo_tier;
    }

    // 2. Page-type defaults — Hub / Landing are top-funnel,
    //    always featured for max discoverability.
    if (page.page_type === 'hub' || page.page_type === 'landing') {
        return 'featured';
    }

    // 3. Money pages — anything carrying an affiliate Comparison
    //    block is a conversion-critical page; never degrade.
    if (page.blocks.some((b) => b.block_type === 'comparison')) {
        return 'featured';
    }

    // 4. Everything else: seeded 30/50/20 distribution.
    const slug = page.translation?.slug ?? `page-${page.id}`;
    const seed = `${tenant.website.hostname}:${slug}`;
    const hash = favHash(seed) % 100;

    if (hash < 30) return 'featured';
    if (hash < 80) return 'standard';
    return 'light';
}

export interface TierConfig {
    /** Emit the JSON-LD <script> with WebSite / Article / Breadcrumb schemas. */
    readonly emitSchema: boolean;
    /** Emit og:image + og:image:width/height. */
    readonly emitOgImage: boolean;
    /** Emit twitter:card / twitter:title / twitter:description. */
    readonly emitTwitter: boolean;
    /** Emit twitter:image specifically (separate from generic twitter tags). */
    readonly emitTwitterImage: boolean;
}

export function tierConfig(tier: SeoTier): TierConfig {
    switch (tier) {
        case 'featured':
            return {
                emitSchema: true,
                emitOgImage: true,
                emitTwitter: true,
                emitTwitterImage: true,
            };
        case 'standard':
            return {
                emitSchema: false,
                emitOgImage: true,
                emitTwitter: true,
                emitTwitterImage: false,
            };
        case 'light':
            return {
                emitSchema: false,
                emitOgImage: false,
                emitTwitter: false,
                emitTwitterImage: false,
            };
    }
}
