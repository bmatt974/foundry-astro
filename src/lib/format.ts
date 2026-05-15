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
 * Format a rating + review count into "★ 4.3 (160)" — the compact
 * form most marketplaces use. Returns null when there's no rating to
 * show.
 */
export function formatRating(
    rating: number | null | undefined,
    reviewCount: number | null | undefined,
    locale: string,
): string | null {
    if (rating === null || rating === undefined || !Number.isFinite(rating)) {
        return null;
    }
    const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
        .format(rating);
    if (reviewCount && reviewCount > 0) {
        const count = new Intl.NumberFormat(locale).format(reviewCount);
        return `★ ${decimal} (${count})`;
    }

    return `★ ${decimal}`;
}
