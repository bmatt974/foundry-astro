/**
 * Pure data mapping from a `Sourceable` to the list of rows surfaced
 * in the article-header infobox (Place type, Country, Coordinates,
 * Google Maps link, Website, Population, Continent — depending on
 * which `Sourceable` shape the page is anchored on).
 *
 * Theme-agnostic on purpose: every `SourceableInfo.astro` ships its
 * own markup (Tailwind <dl> on basic, <table.wp-block-table> on
 * wp-classic, <table.field-collection-table> on drupal-bartik) but
 * consumes the same row list. Surfacing a new field anywhere → patch
 * one function instead of three identical copies.
 */
import type { Sourceable } from '../foundry';
import {
    formatCoordinates,
    formatPopulation,
    googleMapsUrl,
    isoToCountryName,
    isoToFlag,
} from '../geo';

export interface Row {
    label: string;
    value: string;
    href?: string | null;
}

export function buildRows(s: Sourceable, locale: string): Row[] {
    const rows: Row[] = [];

    if (s.type === 'place') {
        if (s.place_type) {
            rows.push({ label: 'Type', value: s.place_type.replace(/_/g, ' ') });
        }
        if (s.country_code) {
            const flag = isoToFlag(s.country_code);
            const name = isoToCountryName(s.country_code, locale) ?? s.country_code;
            rows.push({ label: 'Country', value: `${flag ?? ''} ${name}`.trim() });
        }
        const coords = formatCoordinates(s.coordinates);
        if (coords && s.coordinates) {
            rows.push({
                label: 'Map',
                value: coords,
                href: googleMapsUrl(s.coordinates.lat, s.coordinates.lon),
            });
        }
        if (s.website) {
            // Trimmed display form (no protocol, no trailing slash) for
            // readability; href keeps the full URL.
            const display = s.website
                .replace(/^https?:\/\//, '')
                .replace(/\/+$/, '');
            rows.push({ label: 'Website', value: display, href: s.website });
        }
        return rows;
    }

    if (s.type === 'destination') {
        if (s.destination_type) {
            rows.push({ label: 'Type', value: s.destination_type.replace(/_/g, ' ') });
        }
        if (s.country) {
            const flag = isoToFlag(s.country.iso_code);
            rows.push({ label: 'Country', value: `${flag ?? ''} ${s.country.name}`.trim() });
        }
        const population = formatPopulation(s.population, locale);
        if (population) {
            rows.push({ label: 'Population', value: population });
        }
        const coords = formatCoordinates(s.coordinates);
        if (coords && s.coordinates) {
            rows.push({
                label: 'Map',
                value: coords,
                href: googleMapsUrl(s.coordinates.lat, s.coordinates.lon),
            });
        }
        return rows;
    }

    if (s.type === 'destination_country') {
        const flag = isoToFlag(s.iso_code);
        rows.push({ label: 'Country', value: `${flag ?? ''} ${s.name}`.trim() });
        if (s.continent) {
            rows.push({ label: 'Continent', value: s.continent.replace(/_/g, ' ') });
        }
        return rows;
    }

    return rows;
}
