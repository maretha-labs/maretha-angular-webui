const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
// Pinned IBM 4.0.34 emits segmented reasons such as combobox_design_valid/Pass_1.2.
// Rule IDs remain strict identifiers; dots are permitted only between reason segments.
const reasonIdentifier = (value) =>
	typeof value === 'string' &&
	value.length <= 160 &&
	/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(value);
const hasIdentity = (entry) =>
	entry &&
	identifier(entry.ruleId) &&
	reasonIdentifier(entry.reasonId) &&
	typeof entry.path?.dom === 'string' &&
	entry.path.dom.length > 0;

export function validateIbmReport(report) {
	if (
		!report ||
		!Number.isSafeInteger(report.numExecuted) ||
		report.numExecuted <= 0 ||
		!Array.isArray(report.results) ||
		report.results.length === 0 ||
		report.results.some(
			(entry) =>
				!hasIdentity(entry) ||
				!Array.isArray(entry.value) ||
				entry.value.length !== 2 ||
				!['VIOLATION', 'RECOMMENDATION', 'INFORMATION'].includes(entry.value[0]) ||
				!['PASS', 'FAIL', 'POTENTIAL', 'MANUAL'].includes(entry.value[1]),
		)
	) {
		throw new Error('IBM Equal Access returned an invalid scan report.');
	}
}

// Never exempt another rule/reason merely because it reports the same DOM node.
export function findingIdentity(entry) {
	if (!hasIdentity(entry)) throw new Error('Invalid reviewed finding identity.');
	return JSON.stringify([entry.ruleId, entry.reasonId, entry.path.dom]);
}

export function unreviewedFindings(violations, reviewed) {
	const permitted =
		Array.isArray(reviewed) &&
		reviewed.length <= 2 &&
		reviewed.every(
			(entry) =>
				hasIdentity(entry) &&
				entry.ruleId === 'aria_hidden_nontabbable' &&
				entry.reasonId === 'Fail_1',
		);
	const identities = new Set(permitted ? reviewed.map(findingIdentity) : []);
	return violations.filter((entry) => !identities.has(findingIdentity(entry)));
}

// Live reports/assertions must not serialize document text, DOM, XPath or messages.
export function sanitizedFindings(findings) {
	return findings.map(({ ruleId, reasonId }) => ({ ruleId, reasonId }));
}
