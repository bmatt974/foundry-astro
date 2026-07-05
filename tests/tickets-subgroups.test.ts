/**
 * Grouping contracts for the Bundle and Access sub-axis helpers :
 * fixed display order, null-subtype fallback into the residual
 * category (combo / standard), empty categories dropped, intra-group
 * input order preserved. These invariants drive the sub-headers
 * painted by Tickets / TicketsSimple / TicketsCompare — a regression
 * here silently reshuffles the visitor-facing sections.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { groupBundleTickets } from '../src/lib/tickets/bundle-subgroups.ts';
import { groupAccessTickets } from '../src/lib/tickets/access-subgroups.ts';
import type { ParsedTicket } from '../src/lib/blocks/tickets.ts';

/** Minimal stand-in — the helpers only read `bundleSubtype` /
 *  `accessSubtype` + object identity. */
function ticket(id: number, subtypes: Partial<Pick<ParsedTicket, 'bundleSubtype' | 'accessSubtype'>>): ParsedTicket {
    return { id, bundleSubtype: null, accessSubtype: null, ...subtypes } as ParsedTicket;
}

test('groupBundleTickets: groups follow BUNDLE_SUBTYPE_ORDER and drop empty categories', () => {
    const groups = groupBundleTickets([
        ticket(1, { bundleSubtype: 'combo' }),
        ticket(2, { bundleSubtype: 'card' }),
        ticket(3, { bundleSubtype: 'bus' }),
    ]);
    assert.deepEqual(groups.map((g) => g.subtype), ['card', 'bus', 'combo']);
    assert.deepEqual(groups.map((g) => g.tickets.length), [1, 1, 1]);
});

test('groupBundleTickets: null subtype falls back to combo', () => {
    const groups = groupBundleTickets([
        ticket(1, { bundleSubtype: null }),
        ticket(2, { bundleSubtype: 'combo' }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].subtype, 'combo');
    assert.deepEqual(groups[0].tickets.map((t) => t.id), [1, 2]);
});

test('groupBundleTickets: intra-group input order preserved', () => {
    const groups = groupBundleTickets([
        ticket(5, { bundleSubtype: 'card' }),
        ticket(3, { bundleSubtype: 'card' }),
        ticket(9, { bundleSubtype: 'card' }),
    ]);
    assert.deepEqual(groups[0].tickets.map((t) => t.id), [5, 3, 9]);
});

test('groupAccessTickets: groups follow ACCESS_SUBTYPE_ORDER and drop empty categories', () => {
    const groups = groupAccessTickets([
        ticket(1, { accessSubtype: 'priority' }),
        ticket(2, { accessSubtype: 'standard' }),
    ]);
    assert.deepEqual(groups.map((g) => g.subtype), ['standard', 'priority']);
});

test('groupAccessTickets: null subtype falls back to standard', () => {
    const groups = groupAccessTickets([
        ticket(1, { accessSubtype: null }),
        ticket(2, { accessSubtype: 'audio_guide' }),
    ]);
    assert.deepEqual(groups.map((g) => g.subtype), ['standard', 'audio_guide']);
    assert.deepEqual(groups[0].tickets.map((t) => t.id), [1]);
});

test('groupAccessTickets: empty input yields no groups', () => {
    assert.deepEqual(groupAccessTickets([]), []);
});
