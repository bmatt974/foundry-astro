/**
 * Text block — title + markdown body. Pure TS, no Astro markup.
 * Each theme's `Text.astro` imports from here and renders its own
 * CMS-authentic shape.
 */
import type { PageBlock } from '../foundry';
import { slugify } from '../toc';

export interface TextContent {
    title?: string;
    body?: string;
    /** Anchor id for jump-link navigation. Derived from the title. */
    anchorId?: string;
}

export function parseText(block: PageBlock): TextContent {
    const content = (block.content ?? {}) as Record<string, unknown>;
    const title = typeof content.title === 'string' && content.title !== '' ? content.title : undefined;
    const body = typeof content.body === 'string' && content.body !== '' ? content.body : undefined;

    return {
        title,
        body,
        anchorId: title ? slugify(title) : undefined,
    };
}
