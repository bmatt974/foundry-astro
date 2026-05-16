/**
 * Resize remote image URLs by hijacking the source CDN's own query
 * parameters. No proxy, no on-the-fly resize service — relies on the
 * fact that ~100% of CMS-stored image URLs come from three hosts:
 *
 *   - commons.wikimedia.org/wiki/Special:FilePath/* — `?width=N` for
 *     any integer N
 *   - dynamic-media-cdn.tripadvisor.com/* — `?w=N&h=-1&s=1` but only
 *     against a whitelist of allowed widths; arbitrary values return
 *     HTTP 400, so requested widths snap to the next-larger supported
 *     value (never smaller — we'd rather over-fetch than serve a
 *     pixelated thumbnail)
 *   - media-cdn.tripadvisor.com/media/attractions-splice-spp-NxM/* —
 *     size encoded in the path, not query params; whitelist verified
 *     empirically: 100x100, 200x200, 400x400, 540x360, 720x480
 *
 * Unknown hosts: return the original URL untouched. Worst case, a few
 * large originals slip through; the page still works.
 */

interface ImageOptions {
    /** Target rendered width in CSS pixels. The actual served image is
     *  ≥ this value (Wikimedia honours exactly; TripAdvisor snaps to
     *  whitelist). Use `imageSrcset` for true responsive serving. */
    width?: number;
}

interface ResolvedImage {
    url: string;
    /** The actual width served — may differ from the requested width
     *  when the CDN snaps to a whitelist. Used as the srcset descriptor. */
    width: number;
}

const WIKIMEDIA_FILEPATH = /commons\.wikimedia\.org\/wiki\/Special:FilePath\//i;
const TRIPADVISOR_CDN = /dynamic-media-cdn\.tripadvisor\.com\//i;
const TRIPADVISOR_MEDIA_CDN = /media-cdn\.tripadvisor\.com\/media\//i;
const TRIPADVISOR_MEDIA_SIZE_RE = /(spp-)(\d+)x(\d+)/i;

/** Whitelist of widths the TripAdvisor CDN accepts. Anything else
 *  returns HTTP 400. Verified empirically against
 *  dynamic-media-cdn.tripadvisor.com on 2026-05-15. */
const TRIPADVISOR_WIDTHS = [200, 300, 400, 500, 600, 800, 1000, 1200, 1600] as const;

/** Whitelist of `spp-WxH` sizes the activity-splice CDN serves.
 *  Anything else 404s. Verified empirically on 2026-05-16. */
const TRIPADVISOR_MEDIA_SIZES: ReadonlyArray<{ w: number; h: number }> = [
    { w: 100, h: 100 },
    { w: 200, h: 200 },
    { w: 400, h: 400 },
    { w: 540, h: 360 },
    { w: 720, h: 480 },
] as const;

function snapToTripadvisorWidth(target: number): number {
    for (const w of TRIPADVISOR_WIDTHS) {
        if (w >= target) {
            return w;
        }
    }

    return TRIPADVISOR_WIDTHS[TRIPADVISOR_WIDTHS.length - 1];
}

function snapToTripadvisorMediaSize(target: number): { w: number; h: number } {
    for (const size of TRIPADVISOR_MEDIA_SIZES) {
        if (size.w >= target) {
            return size;
        }
    }

    return TRIPADVISOR_MEDIA_SIZES[TRIPADVISOR_MEDIA_SIZES.length - 1];
}

function resolveVariant(rawUrl: string, requestedWidth: number): ResolvedImage {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return { url: rawUrl, width: requestedWidth };
    }

    if (WIKIMEDIA_FILEPATH.test(rawUrl)) {
        url.searchParams.set('width', String(requestedWidth));

        return { url: url.toString(), width: requestedWidth };
    }

    if (TRIPADVISOR_CDN.test(rawUrl)) {
        const snapped = snapToTripadvisorWidth(requestedWidth);
        url.searchParams.set('w', String(snapped));
        url.searchParams.set('h', '-1');
        if (!url.searchParams.has('s')) {
            url.searchParams.set('s', '1');
        }

        return { url: url.toString(), width: snapped };
    }

    if (TRIPADVISOR_MEDIA_CDN.test(rawUrl) && TRIPADVISOR_MEDIA_SIZE_RE.test(url.pathname)) {
        const snapped = snapToTripadvisorMediaSize(requestedWidth);
        url.pathname = url.pathname.replace(
            TRIPADVISOR_MEDIA_SIZE_RE,
            `$1${snapped.w}x${snapped.h}`,
        );

        return { url: url.toString(), width: snapped.w };
    }

    return { url: rawUrl, width: requestedWidth };
}

export function imageUrl(
    rawUrl: string | null | undefined,
    opts: ImageOptions = {},
): string | null {
    if (!rawUrl) {
        return null;
    }

    return resolveVariant(rawUrl, opts.width ?? 480).url;
}

/**
 * Build a srcset string from a base URL and a list of requested widths.
 * Variants that resolve to the same actual width (TripAdvisor snapping)
 * are deduped so the browser doesn't get redundant candidates. Variants
 * that resolve to the same URL are also deduped — defensive against
 * unknown CDNs where every requested width returns the source URL
 * unchanged (otherwise we'd lie to the browser by claiming N sizes
 * are available when only one really is).
 */
export function imageSrcset(
    rawUrl: string | null | undefined,
    widths: number[],
): string | null {
    if (!rawUrl) {
        return null;
    }

    const seenWidths = new Set<number>();
    const seenUrls = new Set<string>();
    const entries: string[] = [];

    for (const w of widths) {
        const variant = resolveVariant(rawUrl, w);
        if (seenWidths.has(variant.width) || seenUrls.has(variant.url)) {
            continue;
        }
        seenWidths.add(variant.width);
        seenUrls.add(variant.url);
        entries.push(`${variant.url} ${variant.width}w`);
    }

    return entries.join(', ');
}
