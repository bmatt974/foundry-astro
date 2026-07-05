/**
 * `formatRelativeDate` is the engine behind the visible "Updated 2
 * days ago" line in every theme's PageHeader. Cover unit selection
 * (year/month/week/day/hour/minute) and locale propagation, plus the
 * null/invalid input contract that callers rely on to skip rendering.
 *
 * `formatDate` is the absolute fallback shown in the `<time title>`
 * tooltip — locked to a couple of locales to make sure ICU is loaded
 * for the languages we ship.
 *
 * Run: `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatDate, formatRating, formatRelativeDate } from '../src/lib/format.ts';

const now = new Date('2026-05-16T12:00:00Z');

test('formatRelativeDate: returns null for missing input', () => {
    assert.equal(formatRelativeDate(null, 'en', now), null);
    assert.equal(formatRelativeDate(undefined, 'en', now), null);
    assert.equal(formatRelativeDate('', 'en', now), null);
});

test('formatRelativeDate: returns null for invalid date string', () => {
    assert.equal(formatRelativeDate('not-a-date', 'en', now), null);
});

test('formatRelativeDate: yesterday in en uses "yesterday" (numeric:auto)', () => {
    const result = formatRelativeDate('2026-05-15T12:00:00Z', 'en', now);
    assert.equal(result, 'yesterday');
});

test('formatRelativeDate: yesterday in fr uses "hier"', () => {
    const result = formatRelativeDate('2026-05-15T12:00:00Z', 'fr', now);
    assert.equal(result, 'hier');
});

test('formatRelativeDate: 3 days ago in en', () => {
    const result = formatRelativeDate('2026-05-13T12:00:00Z', 'en', now);
    assert.equal(result, '3 days ago');
});

test('formatRelativeDate: 2 weeks ago in fr', () => {
    const result = formatRelativeDate('2026-05-02T12:00:00Z', 'fr', now);
    assert.equal(result, 'il y a 2 semaines');
});

test('formatRelativeDate: 3 months ago in de', () => {
    const result = formatRelativeDate('2026-02-16T12:00:00Z', 'de', now);
    assert.equal(result, 'vor 3 Monaten');
});

test('formatRelativeDate: last year in es', () => {
    const result = formatRelativeDate('2025-05-16T12:00:00Z', 'es', now);
    assert.equal(result, 'el año pasado');
});

test('formatRelativeDate: minutes scale for very recent updates', () => {
    const result = formatRelativeDate('2026-05-16T11:35:00Z', 'en', now);
    assert.equal(result, '25 minutes ago');
});

test('formatRelativeDate: unsupported locale still renders something', () => {
    // ICU's resolver is liberal — unknown subtags fall back to the host
    // default rather than throwing. We can't pin the exact phrase, only
    // that nothing crashes and a non-empty string is returned.
    const result = formatRelativeDate('2026-05-15T12:00:00Z', 'xx-NONSENSE', now);
    assert.equal(typeof result, 'string');
    assert.ok((result?.length ?? 0) > 0);
});

test('formatDate: long form in en', () => {
    assert.equal(formatDate('2026-05-15T04:19:18Z', 'en'), 'May 15, 2026');
});

test('formatDate: long form in fr', () => {
    assert.equal(formatDate('2026-05-15T04:19:18Z', 'fr'), '15 mai 2026');
});

test('formatDate: returns null for missing input', () => {
    assert.equal(formatDate(null, 'en'), null);
    assert.equal(formatDate('not-a-date', 'en'), null);
});

test('formatRating: returns null when rating is missing', () => {
    assert.equal(formatRating(null, 100, 'en'), null);
    assert.equal(formatRating(undefined, 100, 'en'), null);
    assert.equal(formatRating(Number.NaN, 100, 'en'), null);
});

test('formatRating: omits the count when reviewCount is missing or zero', () => {
    assert.equal(formatRating(4.3, null, 'en'), '★ 4.3');
    assert.equal(formatRating(4.3, 0, 'en'), '★ 4.3');
});

test('formatRating: counts under 1k stay exact', () => {
    assert.equal(formatRating(4.5, 847, 'en'), '★ 4.5 (847)');
    assert.equal(formatRating(4.5, 847, 'fr', 'avis'), '★ 4,5 (847 avis)');
});

test('formatRating: counts at 1k+ collapse to compact notation (en)', () => {
    // en: thousands abbreviate to K (no space). Modern marketplaces use
    // this to stop 5-digit counts from crowding the row.
    assert.equal(formatRating(4.5, 48175, 'en', 'reviews'), '★ 4.5 (48K reviews)');
    assert.equal(formatRating(4.5, 127543, 'en', 'reviews'), '★ 4.5 (128K reviews)');
});

test('formatRating: counts at 1k+ collapse to compact notation (fr)', () => {
    // fr: thousands abbreviate to "k" with a non-breaking thin space
    // (Intl emits U+202F before the unit). Assertions use a startsWith
    // check on the visible prefix to stay robust to ICU separator drift.
    const result = formatRating(4.5, 48175, 'fr', 'avis');
    assert.ok(result !== null);
    assert.ok(result.startsWith('★ 4,5 (48'));
    assert.ok(result.endsWith('avis)'));
});
