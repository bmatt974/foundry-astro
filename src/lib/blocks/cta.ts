/**
 * CTA block — data shape + parsing helpers.
 *
 * Pure TypeScript: every theme's `Cta.astro` imports from here, then
 * renders its own CMS-authentic markup. No `.astro` component lives
 * here — markup is theme-specific (WP block markup for wp-classic,
 * Drupal block markup for drupal-bartik, etc.) so the rendered HTML
 * fingerprints the claimed CMS rather than our network.
 *
 * Schema mirrors the CMS-side `PageBlockType::Cta` content shape —
 * see `App\Enums\PageBlockType::contentSchema()` on the Foundry
 * Laravel side. Keep this in sync.
 */
import type { PageBlock } from '../foundry';

export interface CtaContent {
    label: string;
    url: string;
    description?: string;
}

/**
 * Validate + extract the CTA content from a PageBlock. Returns `null`
 * when the block doesn't carry the required `label` + `url` fields —
 * themes should bail out (render nothing) in that case rather than
 * shipping a half-broken CTA.
 */
export function parseCta(block: PageBlock): CtaContent | null {
    const content = (block.content ?? {}) as Record<string, unknown>;
    const label = content.label;
    const url = content.url;
    if (typeof label !== 'string' || label === '') {
        return null;
    }
    if (typeof url !== 'string' || url === '') {
        return null;
    }

    return {
        label,
        url,
        description: typeof content.description === 'string' && content.description !== ''
            ? content.description
            : undefined,
    };
}

/**
 * Whether the URL points to a foreign origin. Themes use it to decide
 * if `rel="noopener"` / `target="_blank"` belong on the anchor — same
 * judgement WP / Drupal default outputs make.
 */
export function isExternalUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
}
