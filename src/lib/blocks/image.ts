/**
 * Shared logic for the Image and Gallery blocks. Each theme's
 * `Image.astro` / `Gallery.astro` imports from here and renders its
 * own markup — logic is shared, DOM is per-theme (anti-footprint).
 *
 * The block carries two channels, written by ImageSelectionAgent:
 *   - translation content: {url, alt, caption} (Image) or
 *     {images: [{url, alt, caption}]} (Gallery) — the reader-facing text;
 *   - block.media: provenance rows ({url, thumbnail_url, width, height,
 *     license, title}) — sizing and the licence credit.
 *
 * Commons originals routinely weigh 5-10 MB: the rendered <img> must
 * always point at a thumbnail. Wikimedia thumb URLs end in
 * `/NNNpx-<name>`, so a srcset is a matter of swapping the width.
 */
import type { PageBlock } from '../foundry';

export interface ImageItem {
    src: string;
    srcset: string | null;
    alt: string;
    caption: string;
    credit: string | null;
    width: number | null;
    height: number | null;
}

/**
 * Wikimedia only renders thumbnails at fixed bucket widths since the
 * 2025 cache-size initiative — any other width answers 400 (verified
 * empirically: 250/330/500/960/1280/1920 pass, everything else fails).
 */
const SRCSET_WIDTHS = [250, 330, 500, 960, 1280];

/** The Commons fetch appends utm_* tracking params — noise we never ship. */
function stripQuery(url: string): string {
    const i = url.indexOf('?');
    return i === -1 ? url : url.slice(0, i);
}

function thumbAt(thumbnailUrl: string, width: number): string | null {
    if (!/\/\d+px-[^/]+$/.test(thumbnailUrl)) return null;
    return thumbnailUrl.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`);
}

function buildSrcset(thumbnailUrl: string | null): string | null {
    if (!thumbnailUrl) return null;
    const entries = SRCSET_WIDTHS.map((w) => {
        const url = thumbAt(thumbnailUrl, w);
        return url ? `${url} ${w}w` : null;
    }).filter(Boolean);
    return entries.length > 1 ? entries.join(', ') : null;
}

/** "CC BY-SA 4.0" → a short visible credit; empty licences stay silent. */
function credit(license: unknown): string | null {
    const text = typeof license === 'string' ? license.trim() : '';
    return text !== '' ? `Wikimedia Commons · ${text}` : null;
}

interface MediaRow {
    url?: string;
    thumbnail_url?: string | null;
    width?: number | null;
    height?: number | null;
    license?: string | null;
}

function mediaRows(block: PageBlock): MediaRow[] {
    return Array.isArray(block.media) ? (block.media as MediaRow[]) : [];
}

function toItem(
    content: { url?: string; alt?: string; caption?: string },
    row: MediaRow | undefined,
): ImageItem | null {
    const rawOriginal = content.url ?? row?.url ?? '';
    if (rawOriginal === '') return null;
    const original = stripQuery(rawOriginal);
    const thumb = row?.thumbnail_url ? stripQuery(row.thumbnail_url) : null;
    return {
        src: thumb ?? original,
        srcset: buildSrcset(thumb),
        alt: content.alt ?? '',
        caption: content.caption ?? '',
        credit: credit(row?.license),
        width: row?.width ?? null,
        height: row?.height ?? null,
    };
}

export function parseImage(block: PageBlock): ImageItem | null {
    const content = (block.content ?? {}) as { url?: string; alt?: string; caption?: string };
    return toItem(content, mediaRows(block)[0]);
}

export function parseGallery(block: PageBlock): ImageItem[] {
    const content = (block.content ?? {}) as {
        images?: { url?: string; alt?: string; caption?: string }[];
    };
    const rows = mediaRows(block);
    return (content.images ?? [])
        .map((image, i) => toItem(image, rows[i]))
        .filter((item): item is ImageItem => item !== null);
}
