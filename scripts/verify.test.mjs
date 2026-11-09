import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	CHECKS,
	checksFor,
	MODES,
	runChecks,
	treeState,
	WORKFLOW,
	workflowCommands,
} from './verify.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commands = (mode) => checksFor(mode).map((check) => check.command);

/** Steps the workflow needs that no local mode runs. */
const CI_ONLY = new Set(['npm ci', 'npm run verify:release']);

describe('verification modes', () => {
	it('are customization, upstream and release, each including the one before it', () => {
		assert.deepEqual(MODES, ['customization', 'upstream', 'release']);
		for (const command of commands('customization'))
			if (command !== 'npm run test:ci')
				assert.ok(commands('upstream').includes(command), `upstream lacks ${command}`);
		for (const command of commands('upstream'))
			assert.ok(commands('release').includes(command), `release lacks ${command}`);
		assert.deepEqual(
			commands('release').filter((command) => !commands('upstream').includes(command)),
			['npm run verify:release-artifacts', 'npm run release:files'],
		);
	});

	it('check the core manifest first in the customization mode and last in the upstream mode', () => {
		const customer = checksFor('customization').map((check) => check.id);
		assert.equal(customer[0], 'core-manifest');
		assert.equal(customer.at(-1), 'unit-tests');
		assert.equal(customer.filter((id) => id === 'core-manifest').length, 1);
		const upstream = checksFor('upstream').map((check) => check.id);
		assert.equal(upstream.at(-1), 'core-manifest');
		assert.equal(upstream.filter((id) => id === 'core-manifest').length, 1);
		assert.ok(!upstream.includes('unit-tests'), 'coverage runs the suite for contributors');
	});

	it('name every npm script they run', () => {
		const { scripts } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
		for (const { command } of CHECKS) {
			const script = /^npm run ([a-z0-9:-]+)/.exec(command)?.[1];
			if (script) assert.ok(scripts[script], `${command}: no such script`);
		}
		for (const check of CHECKS)
			for (const mode of check.modes) assert.ok(MODES.includes(mode), `${check.id}: ${mode}`);
	});
});

describe('public CI and verify:upstream', () => {
	const jobs = workflowCommands(readFileSync(path.join(root, WORKFLOW), 'utf8'));
	const publicCommands = new Set(jobs.filter((job) => job.public).flatMap((job) => job.commands));
	const upstream = new Set(commands('upstream'));

	it('run the same commands', () => {
		assert.ok(
			jobs.some((job) => job.public),
			'no public job found',
		);
		for (const command of publicCommands)
			if (!CI_ONLY.has(command))
				assert.ok(upstream.has(command), `${WORKFLOW} runs "${command}"; verify:upstream does not`);
		for (const command of upstream)
			assert.ok(
				publicCommands.has(command),
				`verify:upstream runs "${command}"; ${WORKFLOW} does not`,
			);
	});

	it('keep maintainer-runner jobs out of the public list', () => {
		for (const job of jobs.filter((job) => !job.public))
			for (const command of job.commands)
				if (!CI_ONLY.has(command) && !publicCommands.has(command))
					assert.ok(
						!upstream.has(command),
						`${job.job} is not public CI, yet upstream runs ${command}`,
					);
	});
});

describe('workflowCommands', () => {
	it('reads single and block run steps per job and tells public jobs apart', () => {
		const jobs = workflowCommands(`name: x
on: pull_request
jobs:
  checks:
    runs-on: \${{ github.event.repository.private && fromJSON('["self-hosted","x"]') || 'ubuntu-latest' }}
    steps:
      - uses: actions/checkout@v4
      - name: Install
        run: npm ci
      - run: npm run lint
      - name: Several
        run: |
          npm run a
          node b.mjs --flag

      - name: After the block
        run: npm run c
  private:
    runs-on: [self-hosted, x]
    steps:
      - run: npm run secret
`);
		assert.deepEqual(jobs, [
			{
				job: 'checks',
				public: true,
				commands: ['npm ci', 'npm run lint', 'npm run a', 'node b.mjs --flag', 'npm run c'],
			},
			{ job: 'private', public: false, commands: ['npm run secret'] },
		]);
	});
});

describe('runChecks', () => {
	const checks = [
		{ id: 'a', command: 'a' },
		{ id: 'b', command: 'b', skip: () => 'needs CI' },
		{ id: 'c', command: 'c' },
		{ id: 'd', command: 'd' },
	];

	it('records passes, skips with their reason, the failure and what did not run after it', () => {
		const ran = [];
		const results = runChecks(checks, {
			run: (command) => {
				ran.push(command);
				return command === 'c' ? 2 : 0;
			},
			log: () => undefined,
		});
		assert.deepEqual(ran, ['a', 'c']);
		assert.deepEqual(
			results.map(({ id, status, reason, exitCode }) => ({ id, status, reason, exitCode })),
			[
				{ id: 'a', status: 'pass', reason: undefined, exitCode: undefined },
				{ id: 'b', status: 'not-run', reason: 'needs CI', exitCode: undefined },
				{ id: 'c', status: 'fail', reason: undefined, exitCode: 2 },
				{ id: 'd', status: 'not-run', reason: 'not run after c failed', exitCode: undefined },
			],
		);
		assert.ok(results.every((result) => result.status === 'not-run' || result.durationMs >= 0));
	});

	it('runs everything when nothing fails', () => {
		const results = runChecks(checks, { run: () => 0, log: () => undefined });
		assert.deepEqual(
			results.map((result) => result.status),
			['pass', 'not-run', 'pass', 'pass'],
		);
	});
});

describe('treeState', () => {
	let repo;
	const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
	before(() => {
		repo = mkdtempSync(path.join(tmpdir(), 'verify-tree-'));
		git('init', '-q');
		git('config', 'user.email', 'test@example.com');
		git('config', 'user.name', 'Test');
		writeFileSync(path.join(repo, 'a.txt'), 'a\n');
		git('add', 'a.txt');
		git('commit', '-q', '-m', 'a');
	});
	after(() => rmSync(repo, { recursive: true, force: true }));

	it('is the commit alone for a clean tree and changes with every uncommitted difference', () => {
		const clean = treeState(repo);
		assert.equal(clean.commit, git('rev-parse', 'HEAD'));
		assert.equal(clean.dirty, false);
		assert.deepEqual(treeState(repo), clean);
		writeFileSync(path.join(repo, 'b.txt'), 'b\n');
		const untracked = treeState(repo);
		assert.equal(untracked.dirty, true);
		assert.notEqual(untracked.fingerprint, clean.fingerprint);
		assert.deepEqual(treeState(repo), untracked);
		writeFileSync(path.join(repo, 'b.txt'), 'bb\n');
		assert.notEqual(treeState(repo).fingerprint, untracked.fingerprint);
		writeFileSync(path.join(repo, 'a.txt'), 'changed\n');
		const modified = treeState(repo);
		assert.notEqual(modified.fingerprint, untracked.fingerprint);
		git('mv', 'a.txt', 'c.txt');
		assert.notEqual(treeState(repo).fingerprint, modified.fingerprint);
	});
});
