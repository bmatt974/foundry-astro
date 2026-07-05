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

/**
 * Localised labels per sub-type. Falls back to English for any
 * unrecognised lang prefix so a new locale doesn't surface raw
 * slugs in the UI.
 */
const LABELS: Record<string, Record<AccessSubtypeSlug, string>> = {
    fr: {
        standard: 'Officiel',
        audio_guide: 'Avec audio guide',
        priority: 'Coupe-file',
    },
    en: {
        standard: 'Official',
        audio_guide: 'With audio guide',
        priority: 'Skip-the-line',
    },
};

export function accessSubtypeLabel(slug: AccessSubtypeSlug | string, locale = 'fr'): string {
    const lang = locale.slice(0, 2).toLowerCase();
    const dict = LABELS[lang] ?? LABELS.en;

    return dict[slug as AccessSubtypeSlug] ?? slug;
}

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
