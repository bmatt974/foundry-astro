/**
 * Text block — title + markdown body. Pure TS, no Astro markup.
 * Each theme's `Text.astro` imports from here and renders its own
 * CMS-authentic shape.
 */
import type { PageBlock } from '../foundry';
import { anchorIdFor, headingIdsFor } from '../toc';

export interface TextContent {
    title?: string;
    body?: string;
    /** Anchor id for jump-link navigation. Derived from the title. */
    anchorId?: string;
    /** Page-walk-assigned ids for the body's own h2/h3, in order. */
    bodyHeadingIds?: string[];
}

export function parseText(block: PageBlock): TextContent {
    const content = (block.content ?? {}) as Record<string, unknown>;
    const title = typeof content.title === 'string' && content.title !== '' ? content.title : undefined;
    const body = typeof content.body === 'string' && content.body !== '' ? content.body : undefined;

    const assigned = headingIdsFor(block);

    return {
        title,
        body,
        anchorId: title ? anchorIdFor(block, title) : undefined,
        bodyHeadingIds: assigned?.bodyIds,
    };
}
