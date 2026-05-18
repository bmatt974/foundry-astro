/**
 * Comparison block parser — the unit responsible for translating the
 * CMS-side row payload into the shape themes render. Most assertions
 * here pin the `ctaHref` resolution since that's the affiliate-router
 * entry point: every click on a Comparison row should go through
 * `/go/{click_id}` when an AffiliateLink has been minted, and fall
 * back to the raw partner URL only when the CMS hasn't onboarded the
 * link yet.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseComparison } from '../src/lib/blocks/comparison.ts';

test('ctaHref: routes through /go/{click_id} when present', () => {
    const out = parseComparison(
        {
            groups: [
                {
                    key: 'standard',
                    label: 'Standard',
                    title: 'Colosseum skip-the-line',
                    partner_url: 'https://viator.com/...',
                    click_id: 'edf0bf830883',
                },
            ],
        },
        'fr',
    );
    assert.equal(out.rows[0].ctaHref, '/go/edf0bf830883');
});

test('ctaHref: falls back to partner_url when click_id is absent (legacy content)', () => {
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

test('ctaHref: null when both click_id and partner_url are missing', () => {
    const out = parseComparison(
        {
            groups: [{ key: 'standard', label: 'Standard', title: 'Sans CTA' }],
        },
        'fr',
    );
    assert.equal(out.rows[0].ctaHref, null);
});

test('ctaHref: prefers click_id over partner_url when both present', () => {
    const out = parseComparison(
        {
            groups: [
                {
                    key: 'standard',
                    label: 'Standard',
                    title: 'Both',
                    partner_url: 'https://viator.com/direct',
                    click_id: 'abc123def456',
                },
            ],
        },
        'fr',
    );
    assert.equal(out.rows[0].ctaHref, '/go/abc123def456');
    assert.equal(
        out.rows[0].ctaHref?.startsWith('/go/'),
        true,
        'must be same-origin path, not partner host',
    );
});
