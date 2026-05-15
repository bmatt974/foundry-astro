/**
 * Small helpers for geographic display — flag emojis, country names,
 * Google Maps deeplinks. Used by the SourceableInfo theme components
 * and anywhere a place / destination metadata needs a human form.
 */

/**
 * Convert an ISO-3166 alpha-2 country code into its Unicode flag
 * emoji (e.g. "IT" → 🇮🇹). Works in any modern browser/OS that
 * renders regional-indicator pairs.
 *
 * Returns null for malformed input so callers can fall back to a
 * text label.
 */
export function isoToFlag(code: string | null | undefined): string | null {
    if (!code || code.length !== 2) {
        return null;
    }
    const upper = code.toUpperCase();
    if (!/^[A-Z]{2}$/.test(upper)) {
        return null;
    }
    const base = 0x1f1e6 - 'A'.charCodeAt(0);
    return String.fromCodePoint(base + upper.charCodeAt(0), base + upper.charCodeAt(1));
}

/**
 * Human-readable country name for an ISO-3166 code, resolved against
 * the active locale via `Intl.DisplayNames`. Returns null if the code
 * is malformed or the platform can't resolve it.
 */
export function isoToCountryName(code: string | null | undefined, locale: string): string | null {
    if (!code || code.length !== 2) {
        return null;
    }
    try {
        const names = new Intl.DisplayNames([locale], { type: 'region' });
        return names.of(code.toUpperCase()) ?? null;
    } catch {
        return null;
    }
}

/**
 * Build a Google Maps deeplink for given coordinates. Uses the
 * `?q=lat,lon` form which is universally supported across web,
 * iOS Maps app, and Android intent handlers.
 */
export function googleMapsUrl(lat: number, lon: number): string {
    return `https://www.google.com/maps?q=${lat},${lon}`;
}

/**
 * Format a population integer into a locale-appropriate string with
 * thousands separators (e.g. 2,873,000 → "2 873 000" in fr-FR).
 * Returns null when the input is null / zero / not a number so the
 * UI can skip rendering the field entirely.
 */
export function formatPopulation(population: number | null | undefined, locale: string): string | null {
    if (population === null || population === undefined || !Number.isFinite(population) || population <= 0) {
        return null;
    }
    try {
        return new Intl.NumberFormat(locale).format(population);
    } catch {
        return String(population);
    }
}

/**
 * Format coordinates into a compact human-readable string
 * (e.g. "41.89°N, 12.49°E"). Falls back to a plain decimal pair if
 * the lat/lon ranges look off.
 */
export function formatCoordinates(coordinates: { lat: number; lon: number } | null | undefined): string | null {
    if (!coordinates) {
        return null;
    }
    const { lat, lon } = coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
    }
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
}
