export function reviewInventory(findings, exceptions) {
	const errors = [],
		reviewed = new Set();
	if (!Array.isArray(exceptions))
		return { errors: ['Source exceptions must be an array.'], unreviewed: findings };
	for (const item of exceptions) {
		if (
			!item ||
			!/^[a-f0-9]{16}$/.test(item.id ?? '') ||
			!item.file ||
			!item.kind ||
			typeof item.text !== 'string' ||
			![
				'customer-content',
				'technical-token',
				'brand',
				'diagnostic',
				'localized-fallback',
				'catalogue-metadata',
			].includes(item.ownership) ||
			typeof item.reason !== 'string' ||
			item.reason.trim().length < 20 ||
			!Number.isInteger(item.maximum) ||
			item.maximum < 1 ||
			Object.keys(item).some(
				(key) => !['id', 'file', 'kind', 'text', 'ownership', 'reason', 'maximum'].includes(key),
			)
		) {
			errors.push(
				'Invalid or broad source exception; exact identity, ownership, bounded occurrence count and review reason are required.',
			);
			continue;
		}
		const matches = findings.filter(
			(entry) =>
				entry.id === item.id &&
				entry.file === item.file &&
				entry.kind === item.kind &&
				entry.text === item.text,
		);
		if (!matches.length) errors.push(`Stale source exception ${item.id}`);
		if (matches.length > item.maximum)
			errors.push(`Source exception ${item.id} exceeds reviewed occurrence count`);
		else for (const entry of matches) reviewed.add(entry);
	}
	return { errors, unreviewed: findings.filter((entry) => !reviewed.has(entry)) };
}

// Filenames bound review ownership; declarations can narrow these prefixes but cannot widen them.
const REVIEW_SCOPES = {
	'source-exceptions-components.json': ['app/components/'],
	'source-exceptions-sdk.json': ['app/extensions/'],
	'source-exceptions-settings-shared.json': ['app/modules/settings/', 'app/modules/shared/'],
	'source-exceptions-ui-catalog.json': ['app/ui-catalog/'],
	'source-exceptions-core.json': [
		'app/components/',
		'app/helpers/',
		'app/directives/',
		'app/pipes/',
		'app/modules/explorer/',
		'app/modules/search/',
		'app/app.component.ts',
		'app/app.component.html',
	],
	'source-exceptions-catalogs.json': ['app/helpers/'],
};

/** Validate already-read documents so tests can prove the same cross-file boundary as the CLI. */
export function combineSourceExceptions(documents) {
	const exceptions = [],
		errors = [],
		seen = new Set();
	for (const [filename, document] of Object.entries(documents)) {
		let entries;
		if (filename === 'source-exceptions.json') entries = document;
		else {
			const allowed = REVIEW_SCOPES[filename];
			if (
				!allowed ||
				document?.version !== 1 ||
				!Array.isArray(document.scopes) ||
				!document.scopes.length ||
				!Array.isArray(document.exceptions) ||
				Object.keys(document).some((key) => !['version', 'scopes', 'exceptions'].includes(key)) ||
				document.scopes.some(
					(scope) =>
						typeof scope !== 'string' ||
						!allowed.some(
							(prefix) => scope === prefix || (prefix.endsWith('/') && scope.startsWith(prefix)),
						) ||
						scope.includes('..'),
				)
			) {
				errors.push(`Invalid source review scope in ${filename}`);
				continue;
			}
			entries = document.exceptions;
			for (const entry of entries)
				if (
					typeof entry?.file !== 'string' ||
					!document.scopes.some((scope) =>
						scope.endsWith('/') ? entry.file.startsWith(scope) : entry.file === scope,
					)
				)
					errors.push(
						`Source exception outside declared scope in ${filename}: ${entry?.id ?? 'invalid'}`,
					);
		}
		if (!Array.isArray(entries)) {
			errors.push(`Invalid exception list in ${filename}`);
			continue;
		}
		for (const entry of entries) {
			if (seen.has(entry?.id))
				errors.push(`Duplicate source exception across review files: ${entry?.id}`);
			seen.add(entry?.id);
			exceptions.push(entry);
		}
	}
	return { exceptions, errors };
}
