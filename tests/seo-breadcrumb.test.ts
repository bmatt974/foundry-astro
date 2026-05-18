/**
 * BreadcrumbList JSON-LD generation. The breadcrumb chain coming back
 * from the CMS can include "hub" ancestor pages that have no
 * translation (and therefore no slug), which used to surface as
 * `item: undefined` entries that Google rejected silently. Lock the
 * skip-when-no-URL behavior so a future refactor doesn't accidentally
 * re-introduce broken ListItems.
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
        { locale: 'en', is_default: false, enabled: true, hostname: 'test.example', base_url: 'https://test.example/en', site_name: 'Test', path_prefix: '/en' },
    ] as never,
    defaultLocale: 'fr',
};

function makePage(breadcrumb: Array<{ slug: string | null; title: string }>) {
    return {
        id: 185,
        website_id: 1,
        page_type: null,
        template: null,
        is_indexable: true,
        cover_image: null,
        position: 0,
        published_at: '2026-05-15T04:19:18Z',
        seo: null,
        settings: null,
        translation: {
            locale: 'fr',
            slug: 'le-colisee',
            title: 'Le Colisée',
            meta_title: null,
            meta_description: null,
            snippet: null,
            intro: null,
            subtitle: null,
            eyebrow: null,
            published_at: '2026-05-15T04:19:18Z',
        } as never,
        blocks: [],
        sourceable: null,
        nav: {
            parent: null,
            breadcrumb: breadcrumb.map((b, i) => ({
                id: 100 + i,
                slug: b.slug,
                title: b.title,
                page_type: null,
                position: 0,
            })),
            children: [],
            siblings: [],
        },
        available_locales: [],
    } as never;
}

function findBreadcrumb(jsonLd: ReturnType<typeof buildJsonLd>) {
    const graph = (jsonLd as { '@graph': Array<Record<string, unknown>> })['@graph'];
    return graph.find((n) => n['@type'] === 'BreadcrumbList') as
        | { itemListElement: Array<{ position: number; name: string; item?: string }> }
        | undefined;
}

test('breadcrumb: ancestors with resolved URL appear as ListItems', () => {
    const page = makePage([
        { slug: 'rome', title: 'Rome' },
        { slug: 'rome/must-see', title: 'Must-see Rome' },
    ]);
    const jsonLd = buildJsonLd({
        tenant: tenant as never,
        locale: 'fr',
        page,
        canonicalUrl: 'https://test.example/fr/le-colisee',
        imageUrl: null,
    });
    const bc = findBreadcrumb(jsonLd!);
    assert.ok(bc, 'BreadcrumbList present');
    // 1 home + 2 ancestors + 1 current = 4 items
    assert.equal(bc!.itemListElement.length, 4);
    assert.equal(bc!.itemListElement[0].name, 'Test Site');
    assert.equal(bc!.itemListElement[1].name, 'Rome');
    assert.equal(bc!.itemListElement[2].name, 'Must-see Rome');
    assert.equal(bc!.itemListElement[3].name, 'Le Colisée');
    // positions are monotonic 1..4
    bc!.itemListElement.forEach((el, i) => assert.equal(el.position, i + 1));
});

test('breadcrumb: ancestors with null slug are SKIPPED (not included with undefined item)', () => {
    const page = makePage([
        { slug: 'rome', title: 'Rome' },
        { slug: null, title: 'Rome travel guide (hub, no translation)' },
        { slug: null, title: 'Must-sees of Rome (hub, no translation)' },
    ]);
    const jsonLd = buildJsonLd({
        tenant: tenant as never,
        locale: 'fr',
        page,
        canonicalUrl: 'https://test.example/fr/le-colisee',
        imageUrl: null,
    });
    const bc = findBreadcrumb(jsonLd!);
    assert.ok(bc, 'BreadcrumbList present');
    // 1 home + 1 valid ancestor + 0 hubs + 1 current = 3 items
    assert.equal(bc!.itemListElement.length, 3);
    assert.equal(bc!.itemListElement[0].name, 'Test Site');
    assert.equal(bc!.itemListElement[1].name, 'Rome');
    assert.equal(bc!.itemListElement[2].name, 'Le Colisée');
    // positions stay monotonic after skip
    bc!.itemListElement.forEach((el, i) => assert.equal(el.position, i + 1));
    // every kept item has a resolved `item` URL — none undefined
    bc!.itemListElement.slice(0, -1).forEach((el) => assert.equal(typeof el.item, 'string'));
});

test('breadcrumb: when ALL ancestors are slug-less, only home + current remain', () => {
    const page = makePage([
        { slug: null, title: 'Hub A' },
        { slug: null, title: 'Hub B' },
    ]);
    const jsonLd = buildJsonLd({
        tenant: tenant as never,
        locale: 'fr',
        page,
        canonicalUrl: 'https://test.example/fr/le-colisee',
        imageUrl: null,
    });
    const bc = findBreadcrumb(jsonLd!);
    assert.equal(bc!.itemListElement.length, 2);
    assert.equal(bc!.itemListElement[0].position, 1);
    assert.equal(bc!.itemListElement[1].position, 2);
});
