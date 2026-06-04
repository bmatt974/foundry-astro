/**
 * Table-of-contents extraction shared across themes. The same slugify
 * powers two operations that must produce matching outputs:
 *
 *   - `extractHeadings(markdown)` scans the markdown of a page's
 *     long-form blocks and returns a list of headings + slugs the
 *     TOC component renders as anchor links.
 *
 *   - `applyHeadingIds(marked)` injects the same slug as the `id`
 *     attribute on the rendered `<h2>` / `<h3>` tags so the anchor
 *     links actually jump to the right section.
 *
 * The SERP-audit (see `docs/strategy/seo/page-features-baseline.md`
 * in the CMS repo) flagged TOC as a tier-1 differentiator —
 * present on every top-ranked affiliate guide on the Colosseum /
 * Eiffel SERPs, absent from tier-3 ones. This module is the
 * implementation backing that gap.
 */
import type { Marked } from 'marked';

export interface Heading {
    /** 2 for h2, 3 for h3. We don't surface h4+ in the TOC. */
    level: 2 | 3;
    /** Plain text of the heading, stripped of any markdown. */
    text: string;
    /** Kebab-case slug used as the `id` attribute and anchor target. */
    slug: string;
}

/**
 * Lowercase, ASCII-only, dash-separated. Strips punctuation that
 * isn't URL-safe and collapses runs of whitespace. Matches the slug
 * the marked renderer hook below stamps on each heading, so the TOC
 * link and the heading id always pair correctly.
 *
 *   slugify('How to visit the Colosseum?')  → 'how-to-visit-the-colosseum'
 *   slugify("L'histoire du Colisée")         → 'lhistoire-du-colisee'
 *   slugify('  Multiple   Spaces  ')         → 'multiple-spaces'
 */
export function slugify(input: string): string {
    return input
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

const HEADING_RE = /^(#{2,3})\s+(.+?)\s*$/gm;

/**
 * Walk a markdown string and pull out the h2 / h3 headings in order.
 * The same slug strategy is applied here as in the marked renderer,
 * so a heading rendered with `id="foo-bar"` matches a TOC entry
 * with `href="#foo-bar"`.
 *
 * Duplicate slugs (two h2s with the same text on the same page) get
 * disambiguated with a numeric suffix in encounter order:
 *
 *   ## Tickets
 *   ## Tickets
 *   →  ids: 'tickets', 'tickets-2'
 *
 * The marked renderer applies the same disambiguation so the
 * mapping holds.
 */
export function extractHeadings(markdown: string): Heading[] {
    if (!markdown) {
        return [];
    }

    const headings: Heading[] = [];
    const slugCounts = new Map<string, number>();

    for (const match of markdown.matchAll(HEADING_RE)) {
        const level = match[1].length as 2 | 3;
        const text = match[2].replace(/\*\*|__|`/g, '').trim();
        if (!text) {
            continue;
        }
        const baseSlug = slugify(text);
        const count = slugCounts.get(baseSlug) ?? 0;
        const slug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
        slugCounts.set(baseSlug, count + 1);
        headings.push({ level, text, slug });
    }

    return headings;
}

/**
 * Block types whose `content.title` gets rendered as an `<h2>` inside
 * the block component (not via marked). The TOC must link into them
 * with the same slug each block stamps onto its own h2 id. Blocks
 * with non-`title` heading shapes (comparison `heading`, top_list
 * `intro_heading`, …) get a dedicated branch below.
 */
const TITLE_BLOCK_TYPES = new Set([
    'text',
    'section',
    'summary',
    'faq',
    'key_facts',
]);

/** Block types that also embed markdown bodies with their own h2/h3. */
const BODY_BLOCK_TYPES = new Set(['text', 'section', 'summary']);

/**
 * Collect headings across every block on a page so a single TOC at
 * the top of the article links into all sub-sections. Two sources:
 *
 *  1. Block-level `content.title` → rendered as `<h2>` directly by
 *     the block component (Text.astro et al.), not by marked.
 *  2. Headings inside the block's markdown body → rendered through
 *     marked, where the renderer hook stamps matching ids.
 *
 * No cross-block slug disambiguation: a block-level slug comes from
 * `slugify(title)` and the block component stamps the same slug as
 * its `<h2 id>`. If two blocks happen to share the same title, both
 * get the same id and the TOC link jumps to the first one — rare in
 * practice on affiliate pages.
 */
export function extractHeadingsFromBlocks(
    blocks: ReadonlyArray<{ block_type: string; content: Record<string, unknown> | null }>,
): Heading[] {
    const out: Heading[] = [];

    for (const block of blocks) {
        if (TITLE_BLOCK_TYPES.has(block.block_type)) {
            const title = block.content?.title;
            if (typeof title === 'string' && title.trim() !== '') {
                out.push({ level: 2, text: title.trim(), slug: slugify(title) });
            }
        }
        // Comparison + toplist blocks read their H2 from `content.title`
        // (Comparison.astro / TopList.astro both anchor on it). Read it
        // here so the TOC entry matches the rendered heading. Legacy
        // payloads with `content.heading` are honoured as a fallback so
        // older builds keep linking correctly.
        if (block.block_type === 'comparison' || block.block_type === 'top_list') {
            const heading = block.content?.title ?? block.content?.heading;
            if (typeof heading === 'string' && heading.trim() !== '') {
                out.push({ level: 2, text: heading.trim(), slug: slugify(heading) });
            }
        }
        if (BODY_BLOCK_TYPES.has(block.block_type)) {
            const body = block.content?.body;
            if (typeof body === 'string' && body !== '') {
                out.push(...extractHeadings(body));
            }
        }
    }

    return out;
}

/**
 * Marked renderer hook that stamps the same slug onto rendered
 * heading tags. Themes that want TOC anchors install this via
 * `marked.use({ renderer })`.
 *
 * The hook tracks per-instance slug counts in a module-scope map
 * keyed by the marked instance. This is necessary because marked
 * itself doesn't expose a parse-scope state hook — the closure
 * resets when `installHeadingIdRenderer` is called again.
 */
export function installHeadingIdRenderer(marked: Marked): void {
    const slugCounts = new Map<string, number>();

    marked.use({
        // Reset per parse() invocation via a hook on the start.
        hooks: {
            preprocess(markdown: string) {
                slugCounts.clear();
                return markdown;
            },
        },
        renderer: {
            heading({ tokens, depth }) {
                const text = this.parser.parseInline(tokens);
                // Only h2/h3 surface in the TOC — leave h1 and h4+
                // alone to avoid clashing with the page-level h1 and
                // to keep marked output minimal where it doesn't
                // matter for navigation.
                if (depth !== 2 && depth !== 3) {
                    return `<h${depth}>${text}</h${depth}>\n`;
                }
                // Strip HTML tags from the rendered inline before
                // slugging so a heading like "**Bold**" produces a
                // clean 'bold' slug.
                const plain = text.replace(/<[^>]+>/g, '').trim();
                const baseSlug = slugify(plain);
                const count = slugCounts.get(baseSlug) ?? 0;
                const slug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
                slugCounts.set(baseSlug, count + 1);
                return `<h${depth} id="${slug}">${text}</h${depth}>\n`;
            },
        },
    });
}
