/**
 * Section block — title + markdown body + nested children. Pure TS,
 * no Astro markup. Each theme's `Section.astro` imports from here.
 */
import type { PageBlock } from '../foundry';
import { slugify } from '../toc';

export interface SectionContent {
    title?: string;
    body?: string;
    anchorId?: string;
    hasChildren: boolean;
}

export function parseSection(block: PageBlock): SectionContent {
    const content = (block.content ?? {}) as Record<string, unknown>;
    const title = typeof content.title === 'string' && content.title !== '' ? content.title : undefined;
    const body = typeof content.body === 'string' && content.body !== '' ? content.body : undefined;

    return {
        title,
        body,
        anchorId: title ? slugify(title) : undefined,
        hasChildren: block.children.length > 0,
    };
}
