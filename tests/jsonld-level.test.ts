/**
 * Lock `buildJsonLd` behaviour at every `experiments.jsonld_level`.
 * The function modulates between five shapes — None (null), ArticleOnly
 * (single node), CmsStandard (3-node @graph), WpBlogFull (+Organization,
 * + WP/Yoast tells), TouristEntity (+TouristAttraction) — and a
 * regression in any branch leaks a fingerprint across the website
 * network. Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildJsonLd } from '../src/lib/seo.ts';
import type {
    JsonLdLevel,
    Page,
    TenantResolution,
    WebsiteLocale,
} from '../src/lib/foundry.ts';

const websiteLocale: WebsiteLocale = {
    locale: 'fr',
    is_default: true,
    enabled: true,
    hostname: 'example.test',
    deploy_provider: null,
    path_prefix: null,
    base_url: 'https://example.test/fr',
    site_name: null,
    meta_title: null,
    meta_description: null,
};

function tenant(level: JsonLdLevel): TenantResolution {
    return {
        website: {
            id: 1,
            slug: 'example',
            hostname: 'example.test',
            name: 'Example',
            template: 'basic',
            theme_config: {},
        },
        locales: [websiteLocale],
        default_locale: 'fr',
        experiments: { posture: 'whitehat', jsonld_level: level },
    };
}

const page: Page = {
    id: 100,
    website_id: 1,
    page_type: 'top_list',
    template: null,
    is_indexable: true,
    cover_image: null,
    position: 0,
    published_at: '2026-05-15T04:19:18+00:00',
    seo: null,
    settings: null,
    translation: {
        locale: 'fr',
        slug: 'le-colisee',
        eyebrow: null,
        title: 'Le Colisée',
        subtitle: null,
        intro: null,
        body: 'Le Colisée se dresse majestueusement. Il fut construit sous Vespasien.',
        conclusion: null,
        highlights: null,
        snippet: 'Amphithéâtre emblématique',
        meta_title: null,
        meta_description: 'Visite du Colisée à Rome',
        published_at: '2026-05-15T04:19:18+00:00',
    },
    blocks: [],
    sourceable: {
        type: 'place',
        id: 138642,
        name: 'Colisée',
        canonical_name: 'Colosseum',
        place_type: 'archaeological_site',
        coordinates: { lat: 41.89, lon: 12.49 },
        country_code: 'IT',
        website: null,
        cover_image: null,
    },
    nav: { parent: null, breadcrumb: [], children: [], siblings: [] },
    available_locales: [],
};

const canonicalUrl = 'https://example.test/fr/le-colisee';

function build(level: JsonLdLevel) {
    return buildJsonLd({
        tenant: tenant(level),
        locale: 'fr',
        page,
        canonicalUrl,
        imageUrl: null,
    });
}

test('jsonld_level=none returns null (no <script> emitted)', () => {
    assert.strictEqual(build('none'), null);
});

test('jsonld_level=article_only returns single Article node (no @graph)', () => {
    const out = build('article_only') as Record<string, unknown>;

    assert.strictEqual(out['@type'], 'Article');
    assert.strictEqual(out.headline, 'Le Colisée');
    assert.strictEqual(out.url, canonicalUrl);
    assert.strictEqual(out['@graph'], undefined, 'must NOT use @graph wrapper');
    assert.strictEqual(out.isPartOf, undefined, 'no WebSite link without @graph');
});

test('jsonld_level=cms_standard returns WebSite + Article + BreadcrumbList?', () => {
    const out = build('cms_standard') as { '@graph': Array<Record<string, unknown>> };
    const types = out['@graph'].map((n) => n['@type']);

    assert.deepStrictEqual(types, ['WebSite', 'Article']);
    // Page has no breadcrumb fixtures so BreadcrumbList shouldn't appear here.
    // The 3-node case is covered separately when nav.breadcrumb is populated.
});

test('jsonld_level=wp_blog_full adds Organization + WP/Yoast tells on Article', () => {
    const out = build('wp_blog_full') as { '@graph': Array<Record<string, unknown>> };
    const types = out['@graph'].map((n) => n['@type']);

    assert.ok(types.includes('Organization'), 'Organization node must be present');
    const article = out['@graph'].find((n) => n['@type'] === 'Article')!;

    assert.ok(typeof article.wordCount === 'number' && article.wordCount > 0, 'wordCount populated');
    assert.strictEqual(article.commentCount, 0);
    assert.strictEqual(article.articleSection, 'top_list');
    assert.ok(article.publisher !== undefined);
    assert.ok(article.author !== undefined);
});

test('jsonld_level=tourist_entity adds a minimal TouristAttraction node', () => {
    const out = build('tourist_entity') as { '@graph': Array<Record<string, unknown>> };
    const ta = out['@graph'].find((n) => n['@type'] === 'TouristAttraction');

    assert.ok(ta, 'TouristAttraction must be in the @graph');
    assert.strictEqual(ta!.name, 'Colisée');
    assert.strictEqual(ta!.url, canonicalUrl);
    assert.deepStrictEqual(ta!.address, { '@type': 'PostalAddress', addressCountry: 'IT' });
    // Lonely-Planet pattern: stays minimal — no geo, no openingHours, no telephone
    assert.strictEqual(ta!.geo, undefined);
    assert.strictEqual(ta!.openingHoursSpecification, undefined);
    assert.strictEqual(ta!.telephone, undefined);
});

test('every level except none returns valid JSON serialisable output', () => {
    for (const level of ['article_only', 'cms_standard', 'wp_blog_full', 'tourist_entity'] as JsonLdLevel[]) {
        const out = build(level);
        assert.ok(out, `level ${level} must return non-null`);
        assert.doesNotThrow(() => JSON.stringify(out));
    }
});
