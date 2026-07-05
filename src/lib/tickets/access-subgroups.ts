/**
 * Sub-grouping helper for the Access ("Entrée") format bucket.
 *
 * Mirrors the bundle-subgroups pattern : the aggregator classifies
 * each Access ticket by what's bundled with the admission
 * (`standard` for plain officiel, `audio_guide` for ticket + audio,
 * `priority` for ticket + skip-the-line) ; this helper buckets an
 * already-flat list so the renderer can paint a sub-header per
 * sub-type.
 *
 * Rendering rule : only fire the sub-headers when ≥ 2 sub-types
 * are present. Single-subtype buckets render flat.
 *
 * Intra-group order is preserved — `sort_by` already applied
 * upstream, this helper is non-mutating.
 */

import type { ParsedTicket, AccessSubtypeSlug } from '../blocks/tickets';

/**
 * Fixed display order : standard (officiel / plainest) → audio_guide
 * (content-rich) → priority (faster access). Matches the user's
 * scanning intent : "I want the basic entry" → "I want with audio"
 * → "I want fast entry".
 */
export const ACCESS_SUBTYPE_ORDER: ReadonlyArray<AccessSubtypeSlug> = [
    'standard',
    'audio_guide',
    'priority',
] as const;

/* Labels live in the i18n dictionaries (`tickets.accessSubtype.*`)
   so per-site wording overrides apply — render with
   `t(\`tickets.accessSubtype.${subtype}\`)`. */

export interface AccessSubgroup {
    subtype: AccessSubtypeSlug;
    tickets: ParsedTicket[];
}

/**
 * Bucket a flat list of Access tickets by `accessSubtype`. Tickets
 * with a null subtype (legacy payload before the aggregator
 * classified them) fall into `standard` — the most neutral residual
 * category for plain admissions.
 *
 * Returns sub-groups in `ACCESS_SUBTYPE_ORDER`, dropping empty
 * categories.
 */
export function groupAccessTickets(tickets: ReadonlyArray<ParsedTicket>): AccessSubgroup[] {
    const buckets = new Map<AccessSubtypeSlug, ParsedTicket[]>();
    for (const ticket of tickets) {
        const subtype: AccessSubtypeSlug = ticket.accessSubtype ?? 'standard';
        const existing = buckets.get(subtype);
        if (existing === undefined) {
            buckets.set(subtype, [ticket]);
        } else {
            existing.push(ticket);
        }
    }

    return ACCESS_SUBTYPE_ORDER
        .filter((subtype) => buckets.has(subtype))
        .map((subtype) => ({ subtype, tickets: buckets.get(subtype) ?? [] }));
}
