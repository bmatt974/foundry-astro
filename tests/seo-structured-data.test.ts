/**
 * The API composes the schema.org product nodes (a tickets page's
 * AggregateOffer); the front adds them to its graph untouched.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildJsonLd } from '../src/lib/seo.ts';

const tenant = {
    website: { id: 1, slug: 'test-site', name: 'Test Site', template: 'basic', hostname: 'test.example', theme_config: {}, settings: {} } as never,
    locales: [
        { locale: 'fr', is_default: true, enabled: true, hostname: 'test.example', base_url: 'https://test.example/fr', site_name: 'Test', path_prefix: '/fr' },
    ] as never,
    defaultLocale: 'fr',
};

function graphOf(structuredData: Record<string, unknown>[] | undefined) {
    const page = {
        id: 1960,
        translation: { locale: 'fr', slug: 'arene', title: 'Arène du Colisée' },
        blocks: [],
        sourceable: null,
        nav: { parent: null, breadcrumb: [], children: [], siblings: [] },
        structured_data: structuredData,
    } as never;
    const jsonLd = buildJsonLd({ tenant: tenant as never, locale: 'fr', page, canonicalUrl: 'https://test.example/fr/arene', imageUrl: null });

    return (jsonLd as { '@graph': Array<Record<string, unknown>> })['@graph'];
}

test('structured data: the API node joins the graph as it is', () => {
    const product = {
        '@type': 'Product',
        name: 'Arène du Colisée',
        offers: { '@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: 18, highPrice: 24, offerCount: 5 },
    };

    const node = graphOf([product]).find((n) => n['@type'] === 'Product');

    assert.deepEqual(node, product);
});

test('structured data: a page without it keeps its usual graph', () => {
    assert.deepEqual(graphOf(undefined).map((n) => n['@type']), ['WebSite', 'Article']);
});

test('structured data: a page shipping an offer markup is featured, whatever its seed', async () => {
    const { computePageTier } = await import('../src/lib/seo-tier.ts');
    const page = (structuredData: Record<string, unknown>[] | undefined, seoTier: string | null = null) => ({
        id: 1960,
        page_type: 'node',
        seo_tier: seoTier,
        translation: { locale: 'fr', slug: 'arene', title: 'Arène du Colisée' },
        blocks: [],
        structured_data: structuredData,
    }) as never;
    const product = [{ '@type': 'Product', name: 'Arène du Colisée' }];

    assert.equal(computePageTier(page(product), tenant as never), 'featured');
    // The admin's explicit tier still wins.
    assert.equal(computePageTier(page(product, 'light'), tenant as never), 'light');
});

test('structured data: the article is modified when the page was last edited, not when it was published', () => {
    const page = {
        id: 1936,
        translation: { locale: 'fr', slug: 'sagrada-familia', title: 'Sagrada Família', published_at: '2026-08-01T00:00:00+00:00' },
        published_at: '2026-08-01T00:00:00+00:00',
        updated_at: '2026-11-11T22:00:00+00:00',
        blocks: [],
        sourceable: null,
        nav: { parent: null, breadcrumb: [], children: [], siblings: [] },
    } as never;
    const jsonLd = buildJsonLd({ tenant: tenant as never, locale: 'fr', page, canonicalUrl: 'https://test.example/fr/sagrada-familia', imageUrl: null });
    const article = (jsonLd as { '@graph': Array<Record<string, unknown>> })['@graph'].find((n) => n['@type'] === 'Article');

    assert.equal(article?.dateModified, '2026-11-11T22:00:00+00:00');
    assert.equal(article?.datePublished, '2026-08-01T00:00:00+00:00');
});
