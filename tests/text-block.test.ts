/**
 * The text block prints what the API folds (`details`) apart from the
 * body: the official rules read after choosing (2026-11-19).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { parseText } from '../src/lib/blocks/text.ts';

test('a text block keeps its folded details apart from the body', () => {
    const parsed = parseText({ block_type: 'text', content: { title: 'Règlement', body: '- Nominatif.', details: '- Aucun remboursement.' } } as never);

    assert.equal(parsed.body, '- Nominatif.');
    assert.equal(parsed.details, '- Aucun remboursement.');
});

test('a text block without details folds nothing', () => {
    const parsed = parseText({ block_type: 'text', content: { title: 'Règlement', body: '- Nominatif.', details: '' } } as never);

    assert.equal(parsed.details, undefined);
});
