/**
 * Key Facts block — title + label/value pairs. Pure TS, no Astro
 * markup. Each theme's `KeyFacts.astro` imports from here and renders
 * its own CMS-authentic shape (WP `wp-block-table`, Drupal field
 * group, html5up `.box`, etc.).
 */
import type { PageBlock } from '../foundry';
import { slugify } from '../toc';

export interface KeyFact {
    label: string;
    value: string;
}

export interface KeyFactsContent {
    title?: string;
    facts: KeyFact[];
    /** Free-form rows the Laravel renderer used to ship when a draft
     *  carries plain strings instead of label/value pairs. Themes
     *  decide whether to render them differently from structured
     *  facts (basic shows them as a bare line, WP wraps them in a
     *  `<li>` etc.). Empty when every fact is a structured pair. */
    freeForm: string[];
    anchorId?: string;
}

/**
 * Parse KeyFacts content. Accepts a mixed array of `{label, value}`
 * objects and plain strings; the strings flow into `freeForm` so the
 * theme can render them however it wants (or skip them).
 */
export function parseKeyFacts(block: PageBlock): KeyFactsContent {
    const content = (block.content ?? {}) as Record<string, unknown>;
    const raw = (content.facts ?? []) as unknown[];
    const facts: KeyFact[] = [];
    const freeForm: string[] = [];

    for (const entry of raw) {
        if (typeof entry === 'string' && entry !== '') {
            freeForm.push(entry);
            continue;
        }
        if (entry === null || typeof entry !== 'object') continue;
        const obj = entry as Record<string, unknown>;
        if (typeof obj.label !== 'string' || obj.label === '') continue;
        if (typeof obj.value !== 'string' || obj.value === '') continue;
        facts.push({ label: obj.label, value: obj.value });
    }

    const title = typeof content.title === 'string' && content.title !== '' ? content.title : undefined;

    return {
        title,
        facts,
        freeForm,
        anchorId: title ? slugify(title) : undefined,
    };
}
