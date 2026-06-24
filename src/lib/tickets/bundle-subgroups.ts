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

/**
 * Localised labels per sub-type. Two locales today (fr / en) — the
 * helper falls back to English for any unrecognised lang prefix
 * rather than printing the raw slug, so a `de-DE` visitor sees
 * "Day trips" not `day_trip`. Add a lang when a new tier-1 locale
 * lands.
 */
const LABELS: Record<string, Record<BundleSubtypeSlug, string>> = {
    fr: {
        card: 'Pass & cartes',
        day_trip: 'Excursions',
        bus: 'Bus touristique',
        cruise: 'Croisières',
        combo: 'Combos',
    },
    en: {
        card: 'Passes & cards',
        day_trip: 'Day trips',
        bus: 'Sightseeing bus',
        cruise: 'Cruises',
        combo: 'Combos',
    },
};

/**
 * Localise a bundle sub-type slug. Unknown slugs return as-is so the
 * caller can spot a contract drift in the UI (a new sub-type added
 * server-side without a matching front label).
 */
export function bundleSubtypeLabel(slug: BundleSubtypeSlug | string, locale = 'fr'): string {
    const lang = locale.slice(0, 2).toLowerCase();
    const dict = LABELS[lang] ?? LABELS.en;

    return dict[slug as BundleSubtypeSlug] ?? slug;
}

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
