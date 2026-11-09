/** Remove only complete pseudo spans; a mixed localized/plain node must still fail. */
export function untranslatedRemainder(text, fragments = []) {
	let remaining = text.replace(/⟦[^⟦⟧]*⟧/gu, '');
	for (const fragment of fragments) {
		const at = remaining.indexOf(fragment);
		if (at >= 0) remaining = remaining.slice(0, at) + remaining.slice(at + fragment.length);
	}
	return /\p{L}/u.test(remaining) ? remaining.trim() : '';
}
export function reviewPseudo(records, exceptions) {
	const seen = new Map(),
		failures = [];
	for (const record of records) {
		const matching = exceptions.filter(
			(x) => x.selector === record.selector && x.attribute === record.attribute,
		);
		const fragments = matching
			.filter((x) => record.text.includes(x.text))
			.map((x) => {
				const count = (seen.get(x) ?? 0) + 1;
				seen.set(x, count);
				if (count > x.maximum) failures.push({ ...record, reason: 'Exception maximum exceeded' });
				return x.text;
			});
		const remainder = untranslatedRemainder(record.text, fragments);
		if (remainder) failures.push({ ...record, remainder, reason: 'Unlocalized visible text' });
	}
	return failures;
}
