import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function aggregate(output, expected, mode, runId, browserExitCode) {
	const expectedFiles = new Set(expected.map((id) => `${id}.result.json`));
	const unexpected = readdirSync(output).filter(
		(file) => file.endsWith('.result.json') && !expectedFiles.has(file),
	);
	const results = expected.map((id) => {
		const path = resolve(output, `${id}.result.json`);
		if (!existsSync(path))
			return { scenario: id, status: 'incomplete', reason: 'No result from this run.' };
		try {
			const result = JSON.parse(readFileSync(path, 'utf8'));
			if (
				result.scenario !== id ||
				!['unverified', 'captured-unverified', 'local-contract-passed', 'failed'].includes(
					result.status,
				)
			)
				return { scenario: id, status: 'incomplete', reason: 'Invalid result from this run.' };
			return result;
		} catch {
			return { scenario: id, status: 'incomplete', reason: 'Unreadable result from this run.' };
		}
	});
	return {
		format: 'maretha.visual-parity.capture',
		version: 1,
		mode,
		runId,
		captureChecksPassed:
			browserExitCode === 0 &&
			!unexpected.length &&
			expectedFiles.size === expected.length &&
			results.every((result) => !['failed', 'incomplete'].includes(result.status)),
		parityVerified: false,
		integrityErrors: [
			...(unexpected.length ? ['Unexpected result files exist in this run.'] : []),
			...(expectedFiles.size !== expected.length
				? ['Expected scenario identities were duplicated.']
				: []),
		],
		scope:
			'Read-only captures and fixed-reference pixel comparisons; unbound rows remain unverified. Local contracts do not certify hosted parity.',
		results,
	};
}
