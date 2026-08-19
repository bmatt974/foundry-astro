/**
 * Section block — title + markdown body + nested children. Pure TS,
 * no Astro markup. Each theme's `Section.astro` imports from here.
 */
import type { PageBlock } from '../foundry';
import { anchorIdFor, headingIdsFor } from '../toc';

export interface SectionContent {
    title?: string;
    body?: string;
    anchorId?: string;
    /** Page-walk-assigned ids for the body's own h2/h3, in order. */
    bodyHeadingIds?: string[];
    hasChildren: boolean;
}

export function parseSection(block: PageBlock): SectionContent {
    const content = (block.content ?? {}) as Record<string, unknown>;
    const title = typeof content.title === 'string' && content.title !== '' ? content.title : undefined;
    const body = typeof content.body === 'string' && content.body !== '' ? content.body : undefined;

    return {
        title,
        body,
        anchorId: title ? anchorIdFor(block, title) : undefined,
        bodyHeadingIds: headingIdsFor(block)?.bodyIds,
        hasChildren: block.children.length > 0,
    };
}
