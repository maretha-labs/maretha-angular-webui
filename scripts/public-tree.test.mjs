// Public tree guard: the private maintainers overlay never reaches the public repository.
// Part of verify:upstream; on the private maintainers branch it fails by design.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

const PRIVATE_ONLY = [
	(file) => file === 'maintainers' || file.startsWith('maintainers/'),
	(file) => file === '.github/workflows/sync-public.yml',
];

/** Tracked files that belong only to the private overlay. */
export function publicTreeViolations(root) {
	return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
		.split('\0')
		.filter(Boolean)
		.filter((file) => PRIVATE_ONLY.some((match) => match(file)));
}

describe('public tree', () => {
	it('tracks nothing from the private overlay', () => {
		const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
		assert.deepEqual(
			publicTreeViolations(root),
			[],
			'Private overlay files are tracked; this pull request came from the private branch.',
		);
	});
});

describe('publicTreeViolations', () => {
	let repo;
	const add = (file) => {
		mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
		writeFileSync(path.join(repo, file), 'x\n');
		execFileSync('git', ['add', '--', file], { cwd: repo });
	};
	before(() => {
		repo = mkdtempSync(path.join(tmpdir(), 'public-tree-'));
		execFileSync('git', ['init', '-q'], { cwd: repo });
		add('app/main.ts');
		add('docs/maintainers-guide.md');
	});
	after(() => rmSync(repo, { recursive: true, force: true }));

	it('ignores look-alike public paths', () => assert.deepEqual(publicTreeViolations(repo), []));

	it('names a tracked maintainers/ file and the sync workflow', () => {
		add('maintainers/runs/1.0.0/results.json');
		add('.github/workflows/sync-public.yml');
		assert.deepEqual(publicTreeViolations(repo), [
			'.github/workflows/sync-public.yml',
			'maintainers/runs/1.0.0/results.json',
		]);
	});
});
