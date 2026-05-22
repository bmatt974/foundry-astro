/**
 * FAQ block — title + Q/A pairs. Pure TS, no Astro markup.
 * Each theme's `Faq.astro` imports from here and renders its own
 * CMS-authentic shape (WP `wp-block-details`, Drupal field--name-faq,
 * html5up `<details>`, etc.).
 */
import type { PageBlock } from '../foundry';
import { slugify } from '../toc';

export interface FaqItem {
    question: string;
    answer: string;
}

export interface FaqContent {
    title?: string;
    items: FaqItem[];
    /** Anchor id for jump-link navigation. Derived from the title. */
    anchorId?: string;
}

/**
 * Parse FAQ content. Accepts both `questions` (canonical) and `items`
 * (legacy fallback the Laravel renderer keeps for older drafts) and
 * normalises to `items`.
 */
export function parseFaq(block: PageBlock): FaqContent {
    const content = (block.content ?? {}) as Record<string, unknown>;
    const raw = (content.questions ?? content.items ?? []) as unknown[];
    const items: FaqItem[] = [];
    for (const entry of raw) {
        if (entry === null || typeof entry !== 'object') continue;
        const obj = entry as Record<string, unknown>;
        if (typeof obj.question !== 'string' || obj.question === '') continue;
        if (typeof obj.answer !== 'string' || obj.answer === '') continue;
        items.push({ question: obj.question, answer: obj.answer });
    }

    const title = typeof content.title === 'string' && content.title !== '' ? content.title : undefined;

    return {
        title,
        items,
        anchorId: title ? slugify(title) : undefined,
    };
}
