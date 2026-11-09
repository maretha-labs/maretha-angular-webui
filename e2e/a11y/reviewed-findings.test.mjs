import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizedFindings, unreviewedFindings, validateIbmReport } from './reviewed-findings.mjs';

const sentinel = {
	ruleId: 'aria_hidden_nontabbable',
	reasonId: 'Fail_1',
	path: { dom: '/html/body/modal-container/div[1]' },
	value: ['VIOLATION', 'FAIL'],
};
test('reviewed sentinel identity cannot hide another rule or reason at the same node', () => {
	const otherRule = { ...sentinel, ruleId: 'color_contrast' };
	const otherReason = { ...sentinel, reasonId: 'Fail_2' };
	const otherPath = { ...sentinel, path: { dom: '/html/body/elsewhere' } };
	assert.deepEqual(unreviewedFindings([sentinel, otherRule, otherReason, otherPath], [sentinel]), [
		otherRule,
		otherReason,
		otherPath,
	]);
	assert.throws(() => assert.deepEqual(unreviewedFindings([otherRule], [sentinel]), []));
});
test('unexpected exception count or rule fails closed', () => {
	assert.deepEqual(unreviewedFindings([sentinel], [sentinel, sentinel, sentinel]), [sentinel]);
	assert.deepEqual(unreviewedFindings([sentinel], [{ ...sentinel, reasonId: 'Fail_2' }]), [
		sentinel,
	]);
});
test('malformed IBM status tuples and incomplete identities fail closed', () => {
	validateIbmReport({ numExecuted: 1, results: [sentinel] });
	for (const invalid of [
		{ ...sentinel, value: [] },
		{ ...sentinel, value: ['VIOLATION'] },
		{ ...sentinel, value: ['VIOLATION', 'UNKNOWN'] },
		{ ...sentinel, value: ['VIOLATION', 'FAIL', 'extra'] },
		{ ...sentinel, ruleId: undefined },
		{ ...sentinel, reasonId: '' },
		{ ...sentinel, path: {} },
		null,
	])
		assert.throws(
			() => validateIbmReport({ numExecuted: 1, results: [invalid] }),
			/invalid scan report/,
		);
});
test('live assertion summaries never include DOM or document content', () => {
	const secret = 'private-document-content';
	const result = sanitizedFindings([
		{ ...sentinel, path: { dom: secret }, message: secret, node: { outerHTML: secret } },
	]);
	assert.deepEqual(result, [{ ruleId: sentinel.ruleId, reasonId: sentinel.reasonId }]);
	assert.equal(JSON.stringify(result).includes(secret), false);
});

test('IBM segmented reason identifiers are valid without broadening rule IDs or exemptions', () => {
	const comboboxPass = {
		...sentinel,
		ruleId: 'combobox_design_valid',
		reasonId: 'Pass_1.2',
		value: ['VIOLATION', 'PASS'],
	};
	validateIbmReport({ numExecuted: 1, results: [comboboxPass] });
	for (const reasonId of [
		'.Pass_1',
		'Pass_1.',
		'Pass_1..2',
		'Pass 1.2',
		'Pass_1/2',
		'Pass_1:2',
		'a'.repeat(161),
	])
		assert.throws(
			() => validateIbmReport({ numExecuted: 1, results: [{ ...comboboxPass, reasonId }] }),
			/invalid scan report/,
		);
	assert.throws(
		() =>
			validateIbmReport({
				numExecuted: 1,
				results: [{ ...comboboxPass, ruleId: 'combobox.design' }],
			}),
		/invalid scan report/,
	);
	const unapproved = { ...sentinel, reasonId: 'Fail_1.2' };
	assert.deepEqual(unreviewedFindings([unapproved], [unapproved]), [unapproved]);
});
