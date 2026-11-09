import test from 'node:test';
import assert from 'node:assert/strict';
import { untranslatedRemainder, reviewPseudo } from './pseudo-audit.mjs';
test('mixed sentinel/plain strings, malformed sentinels and absent locale activation cannot pass', () => {
	assert.equal(untranslatedRemainder('⟦Sávé~~~⟧'), '');
	assert.equal(untranslatedRemainder('⟦Sávé~~~⟧ untranslated suffix'), 'untranslated suffix');
	assert.equal(untranslatedRemainder('⟦Save'), '⟦Save');
	assert.equal(untranslatedRemainder('Save'), 'Save');
});
test('customer exemptions are exact leaf+attribute+text and cannot hide adjacent app text', () => {
	const exemption = {
		selector: '#title',
		attribute: 'text',
		text: 'Save.customer.literal',
		maximum: 1,
	};
	assert.deepEqual(
		reviewPseudo(
			[{ selector: '#title', attribute: 'text', text: '⟦Hélló~~~⟧ Save.customer.literal' }],
			[exemption],
		),
		[],
	);
	for (const record of [
		{ selector: '#title', attribute: 'text', text: 'Save.customer.literal Untranslated' },
		{ selector: '#other', attribute: 'text', text: 'Save.customer.literal' },
		{ selector: '#title', attribute: 'aria-label', text: 'Save.customer.literal' },
	])
		assert.equal(reviewPseudo([record], [exemption]).length, 1);
	assert.ok(
		reviewPseudo(
			Array(2).fill({ selector: '#title', attribute: 'text', text: 'Save.customer.literal' }),
			[exemption],
		).length,
	);
});
