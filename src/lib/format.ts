/**
 * Locale-aware formatters for prices, durations, ratings — anything
 * the page-template or block components need to render in the
 * reader's own locale.
 */

/**
 * Format a price as a currency string for the active locale.
 * Defaults to EUR because that's what the backend ships
 * (`price_eur`); pass `currency` explicitly for USD/GBP rendering.
 *
 *   formatPrice(25.12, 'fr')      → "25,12 €"
 *   formatPrice(25.12, 'en')      → "€25.12"
 *   formatPrice(25.12, 'en', 'USD') → "$25.12"
 *
 * Returns null on invalid input so callers can opt-out of rendering
 * rather than show "NaN".
 */
export function formatPrice(
    amount: number | null | undefined,
    locale: string,
    currency: string = 'EUR',
): string | null {
    if (amount === null || amount === undefined || !Number.isFinite(amount)) {
        return null;
    }
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
}

/**
 * Format a duration in minutes into a compact human string.
 *
 *   formatDuration(150, 'fr') → "2 h 30"
 *   formatDuration(150, 'en') → "2h 30m"
 *   formatDuration(45,  'fr') → "45 min"
 *
 * No `Intl.DurationFormat` polyfill — the browser support is uneven.
 * Hand-rolled locale switch covers fr/en, falls back to a generic
 * "Xh YYm" form.
 */
export function formatDuration(
    minutes: number | null | undefined,
    locale: string,
): string | null {
    if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) {
        return null;
    }

    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    const lang = locale.split('-')[0];

    if (h === 0) {
        return lang === 'fr' ? `${m} min` : `${m} min`;
    }
    if (m === 0) {
        return lang === 'fr' ? `${h} h` : `${h}h`;
    }

    return lang === 'fr' ? `${h} h ${m.toString().padStart(2, '0')}` : `${h}h ${m}m`;
}

/**
 * Adaptive compact formatter for review counts. Mirrors the
 * YouTube / Twitter / Trivago convention :
 *   - < 1 k     : exact ("847")
 *   - 1 k–10 k  : one decimal ("1,2 k" / "1.2K")
 *   - ≥ 10 k    : integer ("48 k" / "48K", "1,2 M" / "1.2M")
 * The decimal collapses at 10 k+ because at that magnitude the
 * tenth-of-a-thousand-reviews is below the visitor's resolution and
 * just adds visual noise next to the price.
 */
function formatCompactCount(count: number, locale: string): string {
    if (count < 1000) {
        return new Intl.NumberFormat(locale).format(count);
    }

    return new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: count < 10_000 ? 1 : 0,
    }).format(count);
}

/**
 * Format a rating + review count into "★ 4.3 (48 k avis)" — the
 * compact form modern comparators use (Trivago, Skyscanner). Returns
 * null when there's no rating to show.
 *
 * Counts use a locale-aware adaptive compact formatter — see
 * `formatCompactCount()` for the magnitude rules. The collapsed form
 * keeps the row scannable : 5-digit review counts otherwise crowd
 * the price and CTA on narrow viewports.
 */
export function formatRating(
    rating: number | null | undefined,
    reviewCount: number | null | undefined,
    locale: string,
    /** Optional locale-aware word appended after the count
     *  ("avis" / "reviews" / "Bewertungen"). When provided, the
     *  output becomes `★ 4.5 (12 k avis)` instead of the
     *  ambiguous `★ 4.5 (12 k)`. The caller resolves the word
     *  via its `useTranslations()` instance ; the formatter just
     *  glues it in. */
    reviewWord?: string,
): string | null {
    if (rating === null || rating === undefined || !Number.isFinite(rating)) {
        return null;
    }
    const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
        .format(rating);
    if (reviewCount && reviewCount > 0) {
        const count = formatCompactCount(reviewCount, locale);
        const trailing = reviewWord ? `${count} ${reviewWord}` : count;
        return `★ ${decimal} (${trailing})`;
    }

    return `★ ${decimal}`;
}

/**
 * Format an ISO date string in the reader's locale ("15 mai 2026" in
 * fr-FR, "May 15, 2026" in en-US). Returns null on missing or invalid
 * input so callers can opt out of rendering.
 *
 *   formatDate('2026-05-15T04:19:18+00:00', 'fr')        → "15 mai 2026"
 *   formatDate('2026-05-15T04:19:18+00:00', 'en')        → "May 15, 2026"
 *   formatDate('2026-05-15T04:19:18+00:00', 'fr','short') → "15 mai 2026"
 */
export function formatDate(
    iso: string | null | undefined,
    locale: string,
    style: 'short' | 'long' = 'long',
): string | null {
    if (!iso) {
        return null;
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    try {
        return new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: style === 'long' ? 'long' : 'short',
            year: 'numeric',
        }).format(date);
    } catch {
        return date.toISOString().slice(0, 10);
    }
}

/**
 * Locale-aware relative-time phrase ("il y a 2 jours", "3 days ago",
 * "vor einer Woche") for the date shown next to a page header.
 * Backed by `Intl.RelativeTimeFormat` so every locale supported by
 * the runtime ICU data (~370 of them) renders without us hand-rolling
 * a translation catalogue.
 *
 * Picks the largest unit whose value is >= 1 (year > month > week >
 * day > hour > minute). Returns null on missing/invalid input so
 * callers can skip rendering.
 *
 *   formatRelativeDate('2026-05-14T...', 'fr')  → "hier"
 *   formatRelativeDate('2026-05-01T...', 'fr')  → "il y a 2 semaines"
 *   formatRelativeDate('2026-05-14T...', 'en')  → "yesterday"
 *   formatRelativeDate('2025-05-14T...', 'en')  → "last year"
 */
export function formatRelativeDate(
    iso: string | null | undefined,
    locale: string,
    now: Date = new Date(),
): string | null {
    if (!iso) {
        return null;
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    const diffSec = (date.getTime() - now.getTime()) / 1000;
    const abs = Math.abs(diffSec);
    let rtf: Intl.RelativeTimeFormat;
    try {
        rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    } catch {
        rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    }

    if (abs < 60) {
        return rtf.format(Math.round(diffSec), 'second');
    }
    if (abs < 3_600) {
        return rtf.format(Math.round(diffSec / 60), 'minute');
    }
    if (abs < 86_400) {
        return rtf.format(Math.round(diffSec / 3_600), 'hour');
    }
    if (abs < 604_800) {
        return rtf.format(Math.round(diffSec / 86_400), 'day');
    }
    if (abs < 2_592_000) {
        return rtf.format(Math.round(diffSec / 604_800), 'week');
    }
    if (abs < 31_536_000) {
        return rtf.format(Math.round(diffSec / 2_592_000), 'month');
    }
    return rtf.format(Math.round(diffSec / 31_536_000), 'year');
}
