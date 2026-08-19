/**
 * TopList block — heading + grid of POI cards (place / attraction).
 * Pure TS, no Astro markup. Each theme's `TopList.astro` imports from
 * here and renders its own CMS-authentic shape.
 *
 * Most-used block on SERP-driven pages — the "Top 10 …" article
 * pattern.
 */
import type { PageBlock } from '../foundry';
import { anchorIdFor } from '../toc';

export interface TopListItem {
    name: string;
    /** Foreign key into `places.id` — null when the block ships an
     *  ad-hoc item without a backing Place record. */
    placeId: number | null;
    /** Snake-cased Place.type (e.g. `attraction`, `museum`,
     *  `restaurant`). Themes can pretty-print or hide. */
    type: string | null;
    image: string | null;
    description: string | null;
    /** Internal link to the place's page when one exists. Null when
     *  the place has no published page on this website. */
    url: string | null;
    /** 1-indexed rank when the source ordered the list. */
    rank: number | null;
}

export interface TopListContent {
    heading?: string;
    items: TopListItem[];
    anchorId?: string;
}

export function parseTopList(block: PageBlock): TopListContent {
    const content = (block.content ?? {}) as Record<string, unknown>;
    const raw = (content.items ?? []) as unknown[];
    const items: TopListItem[] = [];
    for (const entry of raw) {
        if (entry === null || typeof entry !== 'object') continue;
        const obj = entry as Record<string, unknown>;
        const name = typeof obj.name === 'string' ? obj.name : '';
        const placeId = typeof obj.place_id === 'number' ? obj.place_id : null;
        // Skip items that have neither a name nor a place_id — the
        // Laravel renderer applies the same filter.
        if (name === '' && placeId === null) continue;
        items.push({
            name,
            placeId,
            type: typeof obj.type === 'string' && obj.type !== '' ? obj.type : null,
            image: typeof obj.image === 'string' && obj.image !== '' ? obj.image : null,
            description: typeof obj.description === 'string' && obj.description !== '' ? obj.description : null,
            url: typeof obj.url === 'string' && obj.url !== '' ? obj.url : null,
            rank: typeof obj.rank === 'number' ? obj.rank : null,
        });
    }

    const heading = typeof content.title === 'string' && content.title !== ''
        ? content.title
        : typeof content.heading === 'string' && content.heading !== ''
            ? content.heading
            : undefined;

    return {
        heading,
        items,
        anchorId: heading ? anchorIdFor(block, heading) : undefined,
    };
}

/**
 * Humanise a snake_case place type for display (`museum_gallery`
 * → `museum gallery`). Themes call it to render the eyebrow above
 * each card.
 */
export function humaniseType(type: string): string {
    return type.replaceAll('_', ' ');
}
