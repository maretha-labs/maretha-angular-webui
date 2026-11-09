import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
	checkDist,
	checkPackages,
	checkVendored,
	declaredLicense,
	productionPackages,
	satisfies,
} from './verify-licenses.mjs';

describe('satisfies', () => {
	it('needs every AND operand and any OR operand', () => {
		assert.equal(satisfies('MIT'), true);
		assert.equal(satisfies('(CC-BY-4.0 AND MIT)'), true);
		assert.equal(satisfies('MIT AND GPL-3.0-only'), false);
		assert.equal(satisfies('MIT OR GPL-3.0-only'), true);
		assert.equal(satisfies('(GPL-2.0-only OR LGPL-2.1-only) AND MIT'), false);
	});

	it('judges WITH and + by the base licence', () => {
		assert.equal(satisfies('Apache-2.0 WITH LLVM-exception'), true);
		assert.equal(satisfies('GPL-2.0-only WITH Classpath-exception-2.0'), false);
		assert.equal(satisfies('GPL-2.0+'), false);
	});

	it('explains what it cannot parse and rejects LicenseRef', () => {
		assert.match(String(satisfies('SEE LICENSE IN LICENSE.md')), /not a valid SPDX expression/);
		assert.equal(satisfies('LicenseRef-Proprietary'), false);
	});
});

describe('declaredLicense', () => {
	it('reads strings and { type }, refuses legacy arrays', () => {
		assert.equal(declaredLicense({ license: 'ISC' }), 'ISC');
		assert.equal(declaredLicense({ license: { type: 'MIT' } }), 'MIT');
		assert.equal(declaredLicense({ license: ['MIT', 'Apache2'] }), null);
		assert.equal(declaredLicense({ licenses: [{ type: 'MIT' }] }), null);
		assert.equal(declaredLicense({}), null);
	});
});

describe('checkPackages', () => {
	const pkg = (name, license, raw = license) => ({
		name,
		version: '1.0.0',
		license,
		raw,
		path: `node_modules/${name}`,
	});

	it('passes allowed packages and names each failure with its path', () => {
		const problems = checkPackages([
			pkg('ok', 'MIT'),
			pkg('gpl', 'GPL-3.0-only'),
			pkg('legacy', null, ['MIT', 'Apache2']),
			pkg('none', null, undefined),
		]);
		assert.equal(problems.length, 3);
		assert.match(
			problems[0],
			/gpl@1\.0\.0 \(node_modules\/gpl\): "GPL-3\.0-only" is outside the allowlist/,
		);
		assert.match(problems[1], /legacy@1\.0\.0.*\["MIT","Apache2"\]/);
		assert.match(problems[2], /none@1\.0\.0.*null/);
	});

	it('accepts an exception only with a reason, and flags stale or unreasoned ones', () => {
		const packages = [pkg('odd-licence', 'MPL-2.0')];
		assert.deepEqual(
			checkPackages(packages, {
				exceptions: [
					{
						name: 'odd-licence',
						version: '1.0.0',
						reason: 'Reviewed: file-level copyleft, unmodified.',
					},
				],
			}),
			[],
		);
		const unreasoned = checkPackages(packages, {
			exceptions: [{ name: 'odd-licence', reason: ' ' }],
		});
		assert.ok(unreasoned.some((p) => /needs a name and a reason/.test(p)));
		assert.ok(unreasoned.some((p) => /outside the allowlist/.test(p)));
		const versioned = checkPackages(packages, {
			exceptions: [{ name: 'odd-licence', version: '0.9.0', reason: 'old' }],
		});
		assert.ok(
			versioned.some((p) => /outside the allowlist/.test(p)),
			'an exception for another version does not apply',
		);
		assert.ok(versioned.some((p) => /no longer needed/.test(p)));
	});
});

describe('planted dependencies in a temporary project', () => {
	let root;
	const write = (file, value) => {
		mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
	};

	before(() => {
		root = mkdtempSync(path.join(tmpdir(), 'licenses-'));
		write('package.json', {
			name: 'planted',
			version: '1.0.0',
			dependencies: { good: '1.0.0', copyleft: '1.0.0' },
			devDependencies: { 'dev-only-gpl': '1.0.0' },
		});
		write('node_modules/good/package.json', {
			name: 'good',
			version: '1.0.0',
			license: 'MIT',
			dependencies: { nested: '2.0.0' },
		});
		write('node_modules/nested/package.json', {
			name: 'nested',
			version: '2.0.0',
			license: 'BSD-3-Clause',
		});
		write('node_modules/copyleft/package.json', {
			name: 'copyleft',
			version: '1.0.0',
			license: 'GPL-3.0-only',
		});
		write('node_modules/dev-only-gpl/package.json', {
			name: 'dev-only-gpl',
			version: '1.0.0',
			license: 'GPL-3.0-only',
		});
	});
	after(() => rmSync(root, { recursive: true, force: true }));

	it('walks transitive production packages and skips dev dependencies', () => {
		const names = productionPackages(root).map((p) => p.name);
		assert.deepEqual(names, ['copyleft', 'good', 'nested']);
	});

	it('fails on the planted GPL production dependency only', () => {
		const problems = checkPackages(productionPackages(root));
		assert.equal(problems.length, 1);
		assert.match(problems[0], /^copyleft@1\.0\.0/);
	});

	it('requires the inventory to list every vendored file', () => {
		write('assets/js/three.js', '');
		write('assets/js/vendor/widget.js', '');
		assert.match(checkVendored(root)[0], /inventory\.json is missing/);
		write('docs/third-party/inventory.json', {
			components: [{ name: 'three', files: ['assets/js/three.js'] }],
		});
		assert.deepEqual(checkVendored(root), [
			'assets/js/vendor/widget.js is not in docs/third-party/inventory.json.',
		]);
	});

	it('requires 3rdpartylicenses.txt in the production build', () => {
		write('dist/app/index.html', '');
		assert.equal(checkDist(path.join(root, 'dist/app')).length, 1);
		write('dist/app/3rdpartylicenses.txt', '');
		assert.deepEqual(checkDist(path.join(root, 'dist/app')), []);
	});
});
