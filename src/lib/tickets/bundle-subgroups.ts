/**
 * Sub-grouping helper for the Bundle ("Passes & Combos") format bucket.
 *
 * The Bundle bucket can hold 15+ heterogeneous products on busy POIs —
 * city cards, sightseeing buses, day-trip excursions, river cruises,
 * venue+venue combos — that read as a wall of similar-looking cards
 * when listed flat. The aggregator (`Ticket::bundleSubtype`) classifies
 * each Bundle ticket into one of five sub-types ; this helper buckets
 * an already-flat list by that axis so the renderer can paint a
 * sub-header per sub-type.
 *
 * Rendering rule (caller-side) : only fire the sub-headers when ≥ 2
 * sub-types are present in the bucket. A bucket carrying a single
 * sub-type (e.g. only combos) shouldn't show a redundant "Combos"
 * header above a flat list.
 *
 * Intra-group order is preserved — `sort_by` already applied
 * upstream, this helper is non-mutating.
 */

import type { ParsedTicket, BundleSubtypeSlug } from '../blocks/tickets';

/**
 * Fixed display order — broad-purpose to narrow-purpose, the same
 * "what kind of experience am I scanning" rhythm the bucket headers
 * use upstream. `combo` sits last because it's the residual /
 * least-specific category (everything that doesn't fit a clearer
 * axis classifies as combo).
 */
export const BUNDLE_SUBTYPE_ORDER: ReadonlyArray<BundleSubtypeSlug> = [
    'card',
    'day_trip',
    'bus',
    'cruise',
    'combo',
] as const;

/* Labels live in the i18n dictionaries (`tickets.bundleSubtype.*`)
   so per-site wording overrides apply — render with
   `t(\`tickets.bundleSubtype.${subtype}\`)`. */

export interface BundleSubgroup {
    subtype: BundleSubtypeSlug;
    tickets: ParsedTicket[];
}

/**
 * Bucket a flat list of Bundle tickets by their `bundleSubtype`.
 * Tickets with a null subtype (legacy payload before the aggregator
 * classified them) fall into the `combo` group — the safest
 * residual category and what the aggregator returns for unclassified
 * combos anyway.
 *
 * Returns sub-groups in `BUNDLE_SUBTYPE_ORDER`, dropping empty
 * categories. Intra-group order matches the input order (the
 * caller's `sort_by` is already applied at the bucket level).
 */
export function groupBundleTickets(tickets: ReadonlyArray<ParsedTicket>): BundleSubgroup[] {
    const buckets = new Map<BundleSubtypeSlug, ParsedTicket[]>();
    for (const ticket of tickets) {
        const subtype: BundleSubtypeSlug = ticket.bundleSubtype ?? 'combo';
        const existing = buckets.get(subtype);
        if (existing === undefined) {
            buckets.set(subtype, [ticket]);
        } else {
            existing.push(ticket);
        }
    }


    return BUNDLE_SUBTYPE_ORDER
        .filter((subtype) => buckets.has(subtype))
        .map((subtype) => ({ subtype, tickets: buckets.get(subtype) ?? [] }));
}
