import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { COMMENT_MARKER } from './gate.mjs';
import {
	CHECK_NAME,
	client,
	collect,
	main,
	maintainersAmong,
	publish,
	pullRequestNumber,
} from './run.mjs';

const repo = 'maretha-labs/maretha-angular-webui';
const base = `/repos/${repo}`;

/** An API double: `answers` by route for get/list; every write is recorded. */
function fakeApi(answers) {
	const writes = [];
	return {
		writes,
		get: async (route) => answers[route] ?? null,
		list: async (route) => answers[route] ?? [],
		post: async (route, body) => (writes.push({ method: 'POST', route, body }), {}),
		patch: async (route, body) => (writes.push({ method: 'PATCH', route, body }), {}),
	};
}

const pull = {
	user: { login: 'ada' },
	head: { sha: 'abc123', ref: 'fix/12-drawer', repo: { full_name: repo } },
	title: 'fix: keep the drawer toggle visible',
	body: 'Closes #12',
};
const answers = {
	[`${base}/pulls/7`]: pull,
	[`${base}/pulls/7/files`]: [
		{ filename: 'app/a.ts' },
		{ filename: 'app/b.ts', previous_filename: 'app/old.ts' },
	],
	[`${base}/issues/12`]: { state: 'open', labels: [{ name: 'confirmed:bug' }] },
	[`${base}/issues/12/timeline`]: [
		{ event: 'commented', actor: { login: 'ada' } },
		{ event: 'labeled', label: { name: 'confirmed:bug' }, actor: { login: 'grace' } },
	],
	[`${base}/collaborators/grace/permission`]: { permission: 'write' },
	[`${base}/collaborators/ada/permission`]: { permission: 'read' },
	[`${base}/collaborators/linus/permission`]: { permission: 'admin' },
};

describe('pullRequestNumber', () => {
	it('reads the pull request from each event the workflow listens to', () => {
		assert.equal(pullRequestNumber('pull_request_target', { pull_request: { number: 7 } }), 7);
		const comment = (body, issue = { number: 7, pull_request: {} }) => ({
			issue,
			comment: { body },
		});
		assert.equal(pullRequestNumber('issue_comment', comment('/gate')), 7);
		assert.equal(pullRequestNumber('issue_comment', comment('  /gate please ')), 7);
		assert.equal(pullRequestNumber('issue_comment', comment('/gatekeeper')), null);
		assert.equal(pullRequestNumber('issue_comment', comment('thanks, /gate')), null);
		assert.equal(pullRequestNumber('issue_comment', comment('/gate', { number: 7 })), null);
		assert.equal(pullRequestNumber('workflow_dispatch', {}, { pull_request: '7' }), 7);
		assert.equal(pullRequestNumber('workflow_dispatch', {}, { pull_request: 'seven' }), null);
		assert.equal(pullRequestNumber('push', {}), null);
	});
});

describe('client', () => {
	const calls = [];
	const fetchImpl = async (url, init) => {
		calls.push({ url, init });
		if (url.includes('/missing')) return { ok: false, status: 404, json: async () => ({}) };
		if (url.includes('/broken')) return { ok: false, status: 500, json: async () => ({}) };
		if (url.includes('/pages')) {
			const page = Number(new URL(url).searchParams.get('page'));
			const items = page === 1 ? Array.from({ length: 100 }, (_, i) => i) : [100];
			return { ok: true, status: 200, json: async () => items };
		}
		return { ok: true, status: 200, json: async () => ({ url }) };
	};
	const api = client('token', fetchImpl, 'https://api.example');

	it('sends the token and the API version, answers null on 404 and throws otherwise', async () => {
		assert.deepEqual(await api.get('/thing'), { url: 'https://api.example/thing' });
		assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer token');
		assert.equal(calls.at(-1).init.headers['X-GitHub-Api-Version'], '2022-11-28');
		assert.equal(await api.get('/missing'), null);
		await assert.rejects(api.get('/broken'), /GET \/broken answered HTTP 500/);
	});

	it('serializes writes as JSON and follows pages of 100', async () => {
		await api.post('/comments', { body: 'x' });
		assert.equal(calls.at(-1).init.method, 'POST');
		assert.equal(calls.at(-1).init.body, '{"body":"x"}');
		assert.equal(calls.at(-1).init.headers['Content-Type'], 'application/json');
		assert.equal((await api.list('/pages')).length, 101);
		assert.ok(calls.at(-1).url.endsWith('/pages?per_page=100&page=2'));
	});
});

describe('collect', () => {
	it('shapes the pull request for evaluate() and names every login to look up', async () => {
		const { pr, actors } = await collect(fakeApi(answers), repo, 7);
		assert.equal(pr.author, 'ada');
		assert.equal(pr.headSha, 'abc123');
		assert.equal(pr.branch, 'fix/12-drawer');
		assert.equal(pr.fromFork, false);
		assert.deepEqual(pr.changedFiles, [
			{ path: 'app/a.ts', previousPath: undefined },
			{ path: 'app/b.ts', previousPath: 'app/old.ts' },
		]);
		assert.deepEqual(pr.issues[12], {
			state: 'open',
			isPullRequest: false,
			labels: ['confirmed:bug'],
			labelEvents: [{ event: 'labeled', label: 'confirmed:bug', actor: 'grace' }],
		});
		assert.deepEqual(actors, ['ada', 'grace']);
	});

	it('treats a deleted or foreign head repository as a fork and skips unknown issues', async () => {
		const api = fakeApi({
			...answers,
			[`${base}/pulls/7`]: {
				...pull,
				head: { ...pull.head, ref: 'my-branch', repo: null },
				body: 'Closes #99',
			},
		});
		const { pr } = await collect(api, repo, 7);
		assert.equal(pr.fromFork, true);
		assert.deepEqual(pr.issues, {});
	});

	it('fails when the pull request does not exist', async () => {
		await assert.rejects(collect(fakeApi({}), repo, 8), /Pull request #8 was not found/);
	});
});

describe('maintainersAmong', () => {
	it('keeps admin and write permissions only, skipping empty logins', async () => {
		const api = fakeApi(answers);
		assert.deepEqual(await maintainersAmong(api, repo, ['ada', 'grace', '', 'linus', 'nobody']), [
			'grace',
			'linus',
		]);
	});
});

describe('publish', () => {
	const result = {
		conclusion: 'failure',
		headSha: 'abc123',
		summary: '1 problem on route `fix`.',
		comment: `${COMMENT_MARKER}\nbody`,
	};

	it('updates the existing sticky comment and posts the check run on the head commit', async () => {
		const api = fakeApi({
			[`${base}/issues/7/comments`]: [
				{ id: 1, body: 'hello' },
				{ id: 2, body: `${COMMENT_MARKER}\nold` },
			],
		});
		await publish(api, repo, 7, result);
		assert.deepEqual(
			api.writes.map((w) => `${w.method} ${w.route}`),
			[
				'PATCH /repos/maretha-labs/maretha-angular-webui/issues/comments/2',
				`POST ${base}/check-runs`,
			],
		);
		assert.equal(api.writes[0].body.body, result.comment);
		assert.deepEqual(api.writes[1].body, {
			name: CHECK_NAME,
			head_sha: 'abc123',
			status: 'completed',
			conclusion: 'failure',
			output: { title: result.summary, summary: result.comment },
		});
	});

	it('creates the comment when none carries the marker', async () => {
		const api = fakeApi({});
		await publish(api, repo, 7, result);
		assert.equal(api.writes[0].method, 'POST');
		assert.equal(api.writes[0].route, `${base}/issues/7/comments`);
	});
});

describe('main', () => {
	const directory = mkdtempSync(path.join(tmpdir(), 'gate-event-'));
	after(() => rmSync(directory, { recursive: true, force: true }));
	const env = (eventName, event, extra = {}) => {
		const file = path.join(directory, `${eventName}.json`);
		writeFileSync(file, JSON.stringify(event));
		return {
			GITHUB_EVENT_NAME: eventName,
			GITHUB_EVENT_PATH: file,
			GITHUB_REPOSITORY: repo,
			...extra,
		};
	};

	it('ignores comments that are not /gate and /gate from non-maintainers', async () => {
		const api = fakeApi(answers);
		const chat = {
			issue: { number: 7, pull_request: {} },
			comment: { body: 'hi', user: { login: 'grace' } },
		};
		assert.equal(await main(env('issue_comment', chat), api), 'skipped: not a gate event');
		const gate = { ...chat, comment: { body: '/gate', user: { login: 'ada' } } };
		assert.equal(await main(env('issue_comment', gate), api), 'skipped: /gate needs write access');
		assert.deepEqual(api.writes, []);
	});

	it('evaluates a confirmed fix and publishes a passing check bound to the head commit', async () => {
		const api = fakeApi(answers);
		const line = await main(env('pull_request_target', { pull_request: { number: 7 } }), api);
		assert.equal(line, `${CHECK_NAME}: success for abc123 (route fix)`);
		const check = api.writes.find((w) => w.route.endsWith('/check-runs'));
		assert.equal(check.body.conclusion, 'success');
		assert.equal(check.body.head_sha, 'abc123');
	});

	it('fails the check when the issue label came from a non-maintainer', async () => {
		const api = fakeApi({
			...answers,
			[`${base}/collaborators/grace/permission`]: { permission: 'read' },
		});
		const line = await main(env('workflow_dispatch', {}, { INPUT_PULL_REQUEST: '7' }), api);
		assert.match(line, /^contribution-gate: failure for abc123/);
		const check = api.writes.find((w) => w.route.endsWith('/check-runs'));
		assert.match(
			check.body.output.summary,
			/needs the `confirmed:bug` label, applied after triage/,
		);
	});
});
