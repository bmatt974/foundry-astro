/**
 * Comparison block parser — the unit responsible for translating the
 * CMS-side row payload into the shape themes render. Most assertions
 * here pin the `ctaHref` resolution since that's the affiliate-router
 * entry point: every click on a Comparison row should go through
 * `/go/{code}?p=comparison_table` when an AffiliateLink has been
 * minted (the `?p=` names this block's placement for the click
 * beacon), and fall back to the raw partner URL only when the CMS
 * hasn't onboarded the link yet. Frozen translations drafted before
 * the code rename still ship `click_id` — same value, older key —
 * and must stay clickable until re-draft.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseComparison } from '../src/lib/blocks/comparison.ts';

test('ctaHref: routes through /go/{code}?p=comparison_table by default', () => {
    const out = parseComparison(
        {
            groups: [
                {
                    key: 'standard',
                    label: 'Standard',
                    title: 'Colosseum skip-the-line',
                    partner_url: 'https://viator.com/...',
                    code: 'edf0bf830883',
                },
            ],
        },
        'fr',
    );
    assert.equal(out.rows[0].ctaHref, '/go/edf0bf830883?p=comparison_table');
});

test('ctaHref: frozen content still shipping click_id keeps working', () => {
    const out = parseComparison(
        {
            groups: [
                {
                    key: 'standard',
                    label: 'Standard',
                    title: 'Colosseum skip-the-line',
                    click_id: 'edf0bf830883',
                },
            ],
        },
        'fr',
    );
    assert.equal(out.rows[0].ctaHref, '/go/edf0bf830883?p=comparison_table');
});

test('ctaHref: code wins over click_id when a payload carries both', () => {
    const out = parseComparison(
        {
            groups: [
                {
                    key: 'standard',
                    label: 'Standard',
                    title: 'Colosseum',
                    code: 'newcode00001',
                    click_id: 'oldcode00001',
                },
            ],
        },
        'fr',
    );
    assert.equal(out.rows[0].ctaHref, '/go/newcode00001?p=comparison_table');
});

test('ctaHref: honours tenant link_proxy_path override', () => {
    const out = parseComparison(
        {
            groups: [
                {
                    key: 'standard',
                    label: 'Standard',
                    title: 'Colosseum',
                    code: 'edf0bf830883',
                },
            ],
        },
        'fr',
        'visit',
    );
    assert.equal(out.rows[0].ctaHref, '/visit/edf0bf830883?p=comparison_table');
});

test('ctaHref: any of the six allowed prefix values plug in', () => {
    const cases: Array<['view' | 'details' | 'info' | 'visit' | 'out' | 'go', string]> = [
        ['details', '/details/abc?p=comparison_table'],
        ['info', '/info/abc?p=comparison_table'],
        ['view', '/view/abc?p=comparison_table'],
        ['out', '/out/abc?p=comparison_table'],
    ];
    for (const [prefix, expected] of cases) {
        const out = parseComparison(
            { groups: [{ key: 'k', label: 'l', title: 't', code: 'abc' }] },
            'fr',
            prefix,
        );
        assert.equal(out.rows[0].ctaHref, expected);
    }
});

test('ctaHref: falls back to partner_url when no code was minted (legacy content)', () => {
    const out = parseComparison(
        {
            groups: [
                {
                    key: 'standard',
                    label: 'Standard',
                    title: 'Colosseum skip-the-line',
                    partner_url: 'https://viator.com/legacy',
                },
            ],
        },
        'fr',
    );
    assert.equal(out.rows[0].ctaHref, 'https://viator.com/legacy');
});

test('ctaHref: null when both code and partner_url are missing', () => {
    const out = parseComparison(
        {
            groups: [{ key: 'standard', label: 'Standard', title: 'Sans CTA' }],
        },
        'fr',
    );
    assert.equal(out.rows[0].ctaHref, null);
});

test('ctaHref: prefers code over partner_url when both present', () => {
    const out = parseComparison(
        {
            groups: [
                {
                    key: 'standard',
                    label: 'Standard',
                    title: 'Both',
                    partner_url: 'https://viator.com/direct',
                    code: 'abc123def456',
                },
            ],
        },
        'fr',
    );
    assert.equal(out.rows[0].ctaHref, '/go/abc123def456?p=comparison_table');
    assert.equal(
        out.rows[0].ctaHref?.startsWith('/go/'),
        true,
        'must be same-origin path, not partner host',
    );
});

/**
 * Offers-model additions (2026-08-12): the payload ships the shelf
 * SLUG (`bucket`) and the theme's dictionary resolves the header —
 * bucket names are UI chrome. Legacy frozen payloads keep their
 * ready-made `label`, and a dictionary MISS (the resolver returns its
 * own key path) must fall back to it rather than leak a key.
 */
const SHELF_LABELS: Record<string, string> = {
    entry: 'Entrée libre',
    guided: 'Visite guidée',
    pass_combo: 'Pass & Combos',
};

function dictionary(bucket: string): string {
    return SHELF_LABELS[bucket] ?? `tickets.shelf.${bucket}`;
}

test('an offers-model group resolves its label through the dictionary', () => {
    const parsed = parseComparison(
        {
            title: 'Comparer les billets pour le Colisée',
            groups: [
                {
                    key: 'guided',
                    bucket: 'guided',
                    title: 'Colosseum Guided Tour with Arena',
                    total_count: 22,
                    display_features: { live_guide: true, free_cancellation: true },
                    price_eur: 35.5,
                    provider_label: 'Viator',
                    partner_url: 'https://www.viator.com/tours/x',
                },
            ],
        },
        'fr',
        'go',
        dictionary,
    );

    assert.equal(parsed.heading, 'Comparer les billets pour le Colisée');
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].bucket, 'guided');
    assert.equal(parsed.rows[0].label, 'Visite guidée');
    assert.equal(parsed.rows[0].title, 'Colosseum Guided Tour with Arena');
    assert.equal(parsed.rows[0].extras, 21);
    assert.equal(parsed.rows[0].features.liveGuide, true);
    assert.equal(parsed.rows[0].features.coupeFile, false);
});

test('a dictionary miss falls back to the payload label, never leaks a key', () => {
    const parsed = parseComparison(
        {
            groups: [
                { bucket: 'small_group', label: 'Petit groupe (payload)', title: 'Small Group Tour' },
            ],
        },
        'fr',
        'go',
        dictionary,
    );

    assert.equal(parsed.rows[0].label, 'Petit groupe (payload)');
});

test('a legacy frozen payload without buckets keeps its ready-made labels', () => {
    const parsed = parseComparison(
        {
            heading: 'Comparer les billets',
            groups: [
                { key: 'access|skip', label: 'Coupe-file', title: 'Entrée coupe-file + audioguide', total_count: 2 },
            ],
        },
        'fr',
        'go',
        dictionary,
    );

    assert.equal(parsed.rows[0].bucket, null);
    assert.equal(parsed.rows[0].label, 'Coupe-file');
    assert.equal(parsed.rows[0].extras, 1);
});

test('a minted link code cloaks the CTA under the site proxy path', () => {
    const parsed = parseComparison(
        {
            groups: [
                {
                    bucket: 'entry',
                    title: 'Colosseum Entry Ticket',
                    partner_url: 'https://supplier.example/product',
                    code: 'abc123def456',
                },
            ],
        },
        'fr',
        'visit',
        dictionary,
    );

    assert.equal(parsed.rows[0].ctaHref, '/visit/abc123def456?p=comparison_table');
});

test('groups with neither label nor title nor bucket are dropped', () => {
    const parsed = parseComparison(
        { groups: [{ price_eur: 10 }, { bucket: 'entry', title: 'Colosseum Entry' }] },
        'en',
        'go',
        dictionary,
    );

    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].label, 'Entrée libre');
});
