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
import { Lexer } from 'marked';

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
/**
 * Raw h2/h3 scan, no slugs — slug assignment is the caller's scope.
 *
 * Uses marked's OWN lexer so the walk sees exactly the headings the
 * renderer will emit — a regex on `^##` missed setext headings
 * (`Text\n---` renders as an h2) and blockquoted ones, so the ids
 * zipped onto the rendered HTML were one heading off.
 */
function scanHeadings(markdown: string): Array<{ level: 2 | 3; text: string }> {
    if (!markdown) {
        return [];
    }

    const out: Array<{ level: 2 | 3; text: string }> = [];
    collectHeadingTokens(Lexer.lex(markdown), out);

    return out;
}

/** Depth-first over block tokens — the renderer's emission order. */
function collectHeadingTokens(
    tokens: ReadonlyArray<Record<string, unknown>>,
    out: Array<{ level: 2 | 3; text: string }>,
): void {
    for (const token of tokens) {
        if (token.type === 'heading' && (token.depth === 2 || token.depth === 3)) {
            const text = String(token.text ?? '').replace(/\*\*|__|`/g, '').trim();
            if (text) {
                out.push({ level: token.depth as 2 | 3, text });
            }
            continue; // a heading's own tokens are inline, never h2/h3
        }
        if (Array.isArray(token.tokens)) {
            collectHeadingTokens(token.tokens, out);
        }
        if (Array.isArray(token.items)) {
            for (const item of token.items) {
                if (Array.isArray((item as Record<string, unknown>).tokens)) {
                    collectHeadingTokens((item as Record<string, unknown>).tokens as [], out);
                }
            }
        }
    }
}

/**
 * Duplicate-slug disambiguation with one scope per instance: the
 * first "tickets" keeps the bare slug, the next becomes "tickets-2".
 * `extractHeadings` scopes it to one markdown body; the page walk in
 * `extractHeadingsFromBlocks` scopes it to the WHOLE page, which is
 * what makes ids unique across blocks.
 */
class SlugRegistry {
    private counts = new Map<string, number>();

    claim(text: string): string {
        const base = slugify(text);
        const count = this.counts.get(base) ?? 0;
        this.counts.set(base, count + 1);

        return count === 0 ? base : `${base}-${count + 1}`;
    }
}

/** Heading ids assigned to one block by the page walk, in DOM order. */
export interface BlockHeadingIds {
    /** id of the h2 the block component renders from `content.title`. */
    titleId?: string;
    /** ids of the h2/h3 inside the markdown body, in document order. */
    bodyIds: string[];
}

/**
 * Ids assigned by the latest page walk, keyed by block object
 * identity. A WeakMap because block objects live for one request:
 * the assignment must follow them, never outlive them.
 */
const assignedIds = new WeakMap<object, BlockHeadingIds>();

/**
 * The ids `extractHeadingsFromBlocks` assigned to this block, or
 * undefined when no page walk has run (isolated component render).
 * Block parse helpers fall back to bare `slugify(title)` in that
 * case — same slug, minus the page-wide disambiguation.
 */
export function headingIdsFor(block: object): BlockHeadingIds | undefined {
    return assignedIds.get(block);
}

/**
 * The anchor a block component must stamp on its title h2: the
 * page-walk id when one was assigned, else the bare slug (isolated
 * renders). ONE home for the fallback policy — it was copied across
 * nine parse helpers and components before this.
 */
export function anchorIdFor(block: object, title: string): string {
    return headingIdsFor(block)?.titleId ?? slugify(title);
}

/**
 * Re-stamp the heading ids marked rendered with the ids the page
 * walk assigned, in document order. With no assigned list (markdown
 * outside the TOC walk: FAQ answers, key-facts prose) the ids are
 * STRIPPED — every id on the page must come from the single walk,
 * or two independent stampings will eventually collide.
 */
export function applyAssignedHeadingIds(html: string, ids?: string[]): string {
    let index = 0;

    // Attribute-safe: matches `<h2>`, `<h2 class="wp-block-heading">`
    // and any legacy id-carrying shape — the previous pattern assumed
    // `id` was the FIRST attribute and silently skipped wp-classic's
    // headings, leaving that theme with a second stamping authority.
    return html.replace(/<h([23])\b([^>]*)>/g, (_, level: string, attrs: string) => {
        const id = ids?.[index];
        index += 1;
        const rest = attrs.replace(/\s*id="[^"]*"/, '');

        return id ? `<h${level}${rest} id="${id}">` : `<h${level}${rest}>`;
    });
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
 * Slug disambiguation is PAGE-WIDE: one registry covers block titles
 * and body headings together, so a body h3 restating its block title
 * ("Le Colisée" twice on the Colosseum page) gets `-2` instead of a
 * duplicate id. The per-block assignment is remembered (see
 * `headingIdsFor`) so the block components and the Markdown renderer
 * stamp exactly the ids the TOC links to.
 */
const walkCache = new WeakMap<object, Heading[]>();

export function extractHeadingsFromBlocks(
    blocks: ReadonlyArray<{ block_type: string; content: Record<string, unknown> | null }>,
): Heading[] {
    // Toc.astro and PageBlocks.astro both walk the SAME page.blocks
    // reference each request; the second walk would recompute an
    // identical assignment. Identity-keyed on purpose: a re-mapped
    // array is a different page state and deserves a fresh walk.
    const cached = walkCache.get(blocks as object);
    if (cached) {
        return cached;
    }

    const out: Heading[] = [];
    const registry = new SlugRegistry();

    for (const block of blocks) {
        const ids: BlockHeadingIds = { bodyIds: [] };

        let title: unknown;
        if (TITLE_BLOCK_TYPES.has(block.block_type)) {
            title = block.content?.title;
        }
        // Comparison + toplist blocks read their H2 from `content.title`
        // (Comparison.astro / TopList.astro both anchor on it). Legacy
        // payloads with `content.heading` are honoured as a fallback so
        // older builds keep linking correctly.
        if (block.block_type === 'comparison' || block.block_type === 'top_list') {
            title = block.content?.title ?? block.content?.heading;
        }
        if (typeof title === 'string' && title.trim() !== '') {
            ids.titleId = registry.claim(title.trim());
            out.push({ level: 2, text: title.trim(), slug: ids.titleId });
        }

        if (BODY_BLOCK_TYPES.has(block.block_type)) {
            const body = block.content?.body;
            if (typeof body === 'string' && body !== '') {
                for (const { level, text } of scanHeadings(body)) {
                    const slug = registry.claim(text);
                    ids.bodyIds.push(slug);
                    out.push({ level, text, slug });
                }
            }
        }

        assignedIds.set(block, ids);
    }

    walkCache.set(blocks as object, out);

    return out;
}

