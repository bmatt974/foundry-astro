/**
 * Custom marked renderer for the wp-classic theme. Decorates every
 * output element with WordPress block-editor class names so the
 * rendered source reads like the output of WP core's block templates:
 *
 *   <p class="wp-block-paragraph">
 *   <h2 class="wp-block-heading">
 *   <ul class="wp-block-list">
 *   <blockquote class="wp-block-quote">
 *   <a  class="wp-block-link">
 *   <code class="wp-inline-code">
 *
 * Marked v15+ expects a plain `RendererObject` for the `renderer`
 * extension entry — class instances would expose methods only via
 * their prototype, and marked iterates *own* enumerable properties,
 * so class-based overrides silently fall back to defaults. The object
 * literal below is what actually gets picked up.
 *
 * The `wpMarked` instance is module-scoped — no `new Marked()` per
 * request — and lives for the Node process lifetime.
 */
import { Marked, type Tokens } from 'marked';
import { slugify } from '../../../lib/toc.ts';

// Per-parse-invocation slug counters so duplicate h2 texts get
// disambiguated (foo, foo-2, foo-3 …) the same way `extractHeadings`
// in `lib/toc.ts` does, keeping anchor links and rendered ids in sync.
const slugCounts = new Map<string, number>();

interface RendererThis {
    parser: {
        parse: (tokens: Tokens.Generic[]) => string;
        parseInline: (tokens: Tokens.Generic[]) => string;
    };
    listitem: (item: Tokens.ListItem) => string;
}

export const wpRenderer = {
    paragraph(this: RendererThis, { tokens }: Tokens.Paragraph): string {
        return `<p class="wp-block-paragraph">${this.parser.parseInline(tokens)}</p>\n`;
    },

    heading(this: RendererThis, { tokens, depth }: Tokens.Heading): string {
        const inner = this.parser.parseInline(tokens);
        // Only h2/h3 get a `id` attribute — they're the depths the
        // TOC surfaces. h1 / h4+ keep the wp-block-heading class but
        // skip the id so they don't pollute the anchor namespace.
        if (depth !== 2 && depth !== 3) {
            return `<h${depth} class="wp-block-heading">${inner}</h${depth}>\n`;
        }
        const plain = inner.replace(/<[^>]+>/g, '').trim();
        const base = slugify(plain);
        const count = slugCounts.get(base) ?? 0;
        const slug = count === 0 ? base : `${base}-${count + 1}`;
        slugCounts.set(base, count + 1);

        return `<h${depth} class="wp-block-heading" id="${slug}">${inner}</h${depth}>\n`;
    },

    list(this: RendererThis, token: Tokens.List): string {
        const tag = token.ordered ? 'ol' : 'ul';
        const start = token.ordered && token.start !== 1 ? ` start="${token.start}"` : '';
        let body = '';
        for (const item of token.items) {
            body += this.listitem(item);
        }

        return `<${tag} class="wp-block-list"${start}>\n${body}</${tag}>\n`;
    },

    blockquote(this: RendererThis, { tokens }: Tokens.Blockquote): string {
        return `<blockquote class="wp-block-quote">${this.parser.parse(tokens)}</blockquote>\n`;
    },

    link(this: RendererThis, token: Tokens.Link): string {
        const title = token.title ? ` title="${token.title.replace(/"/g, '&quot;')}"` : '';

        return `<a class="wp-block-link" href="${token.href}"${title}>${this.parser.parseInline(token.tokens)}</a>`;
    },

    codespan({ text }: Tokens.Codespan): string {
        return `<code class="wp-inline-code">${text}</code>`;
    },
};

export const wpMarked = new Marked({
    renderer: wpRenderer,
    gfm: true,
    hooks: {
        // Reset the per-instance slug counter at the start of every
        // parse so two unrelated bodies don't accumulate slug counts
        // across each other.
        preprocess(markdown: string) {
            slugCounts.clear();
            return markdown;
        },
    },
});
