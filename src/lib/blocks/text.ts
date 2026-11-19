/**
 * Text block — title + markdown body. Pure TS, no Astro markup.
 * Each theme's `Text.astro` imports from here and renders its own
 * CMS-authentic shape.
 */
import type { PageBlock } from '../foundry.ts';
import { anchorIdFor, headingIdsFor } from '../toc.ts';

export interface TextContent {
    title?: string;
    body?: string;
    /** Markdown the API folds under the body (the rules read after choosing). */
    details?: string;
    /** Anchor id for jump-link navigation. Derived from the title. */
    anchorId?: string;
    /** Page-walk-assigned ids for the body's own h2/h3, in order. */
    bodyHeadingIds?: string[];
}

export function parseText(block: PageBlock): TextContent {
    const content = (block.content ?? {}) as Record<string, unknown>;
    const title = typeof content.title === 'string' && content.title !== '' ? content.title : undefined;
    const body = typeof content.body === 'string' && content.body !== '' ? content.body : undefined;

    const details = typeof content.details === 'string' && content.details !== '' ? content.details : undefined;

    const assigned = headingIdsFor(block);

    return {
        title,
        body,
        details,
        anchorId: title ? anchorIdFor(block, title) : undefined,
        bodyHeadingIds: assigned?.bodyIds,
    };
}
