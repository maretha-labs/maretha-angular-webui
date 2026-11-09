#!/usr/bin/env node
// Runs the contribution gate for one pull request from the base branch's copy of this
// directory: reads the workflow event, collects the pull request's metadata through the REST
// API, calls evaluate(), then upserts the sticky comment and publishes the `contribution-gate`
// check run on the head commit. Pull request text travels only as JSON request bodies; nothing
// here checks out or executes the pull request's content.
//
//   node .github/contribution-gate/run.mjs
//   env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_NAME, GITHUB_EVENT_PATH,
//        INPUT_PULL_REQUEST (workflow_dispatch)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUSTOMER_PATHS } from '../../scripts/core-manifest.mjs';
import { COMMENT_MARKER, evaluate, referencedIssues } from './gate.mjs';

export const CHECK_NAME = 'contribution-gate';
const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = 100;

export const routes = () => JSON.parse(readFileSync(path.join(here, 'routes.json'), 'utf8'));

/** The pull request the event is about, or null when the event is not for the gate. */
export function pullRequestNumber(eventName, event, inputs = {}) {
	if (eventName === 'pull_request_target') return event.pull_request?.number ?? null;
	if (eventName === 'issue_comment')
		return event.issue?.pull_request && /^\/gate\b/.test((event.comment?.body ?? '').trim())
			? event.issue.number
			: null;
	if (eventName === 'workflow_dispatch') {
		const number = Number(inputs.pull_request ?? event.inputs?.pull_request);
		return Number.isInteger(number) && number > 0 ? number : null;
	}
	return null;
}

/** A REST client over fetch: GET answers null on 404, list() follows pages of 100. */
export function client(token, fetchImpl = globalThis.fetch, base = 'https://api.github.com') {
	const headers = {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
		'User-Agent': CHECK_NAME,
	};
	const call = async (method, route, body) => {
		const response = await fetchImpl(`${base}${route}`, {
			method,
			headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		if (method === 'GET' && response.status === 404) return null;
		if (!response.ok) throw new Error(`${method} ${route} answered HTTP ${response.status}.`);
		return response.status === 204 ? null : response.json();
	};
	return {
		get: (route) => call('GET', route),
		post: (route, body) => call('POST', route, body),
		patch: (route, body) => call('PATCH', route, body),
		async list(route) {
			const items = [];
			for (let page = 1; ; page++) {
				const separator = route.includes('?') ? '&' : '?';
				const batch = await call('GET', `${route}${separator}per_page=${PAGE}&page=${page}`);
				if (!Array.isArray(batch)) return items;
				items.push(...batch);
				if (batch.length < PAGE) return items;
			}
		},
	};
}

const labelName = (label) => (typeof label === 'string' ? label : label?.name);

/** The pull request as evaluate() reads it, plus every login whose permission decides something. */
export async function collect(api, repo, number) {
	const base = `/repos/${repo}`;
	const pull = await api.get(`${base}/pulls/${number}`);
	if (!pull) throw new Error(`Pull request #${number} was not found.`);
	const files = await api.list(`${base}/pulls/${number}/files`);
	const pr = {
		number,
		author: pull.user?.login ?? '',
		headSha: pull.head.sha,
		branch: pull.head.ref,
		fromFork: !pull.head.repo || pull.head.repo.full_name.toLowerCase() !== repo.toLowerCase(),
		title: pull.title ?? '',
		body: pull.body ?? '',
		changedFiles: files.map((file) => ({
			path: file.filename,
			previousPath: file.previous_filename,
		})),
		issues: {},
	};
	const actors = new Set([pr.author]);
	for (const n of referencedIssues(pr)) {
		const issue = await api.get(`${base}/issues/${n}`);
		if (!issue) continue;
		const isPullRequest = Boolean(issue.pull_request);
		const events = isPullRequest ? [] : await api.list(`${base}/issues/${n}/timeline`);
		const labelEvents = events
			.filter((e) => (e.event === 'labeled' || e.event === 'unlabeled') && labelName(e.label))
			.map((e) => ({ event: e.event, label: labelName(e.label), actor: e.actor?.login ?? '' }));
		for (const e of labelEvents) actors.add(e.actor);
		pr.issues[n] = {
			state: issue.state,
			isPullRequest,
			labels: (issue.labels ?? []).map(labelName).filter(Boolean),
			labelEvents,
		};
	}
	return { pr, actors: [...actors].filter(Boolean) };
}

/** The logins with admin or write permission on the repository; `maintain` reports as write. */
export async function maintainersAmong(api, repo, logins) {
	const maintainers = [];
	for (const login of logins) {
		if (!login) continue;
		const answer = await api.get(
			`/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`,
		);
		if (answer && ['admin', 'write'].includes(answer.permission)) maintainers.push(login);
	}
	return maintainers;
}

/** One sticky comment per pull request, found by its marker, and the check run on the head commit. */
export async function publish(api, repo, number, result) {
	const base = `/repos/${repo}`;
	const comments = await api.list(`${base}/issues/${number}/comments`);
	const existing = comments.find(
		(comment) => typeof comment.body === 'string' && comment.body.startsWith(COMMENT_MARKER),
	);
	if (existing) await api.patch(`${base}/issues/comments/${existing.id}`, { body: result.comment });
	else await api.post(`${base}/issues/${number}/comments`, { body: result.comment });
	await api.post(`${base}/check-runs`, {
		name: CHECK_NAME,
		head_sha: result.headSha,
		status: 'completed',
		conclusion: result.conclusion,
		output: { title: result.summary, summary: result.comment },
	});
}

/** Reads the event from env, runs the gate, returns one log line. */
export async function main(env, api) {
	const eventName = env.GITHUB_EVENT_NAME;
	const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
	const repo = env.GITHUB_REPOSITORY;
	const number = pullRequestNumber(eventName, event, { pull_request: env.INPUT_PULL_REQUEST });
	if (!number) return 'skipped: not a gate event';
	if (eventName === 'issue_comment') {
		const commenter = await maintainersAmong(api, repo, [event.comment?.user?.login]);
		if (!commenter.length) return 'skipped: /gate needs write access';
	}
	const { pr, actors } = await collect(api, repo, number);
	const maintainers = await maintainersAmong(api, repo, actors);
	const result = evaluate(pr, { ...routes(), maintainers, customerPaths: [...CUSTOMER_PATHS] });
	await publish(api, repo, number, result);
	return `${CHECK_NAME}: ${result.conclusion} for ${result.headSha} (route ${result.route ?? 'none'})`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	if (!process.env.GITHUB_TOKEN) {
		console.error('GITHUB_TOKEN is required.');
		process.exit(1);
	}
	main(process.env, client(process.env.GITHUB_TOKEN)).then(
		(line) => console.log(line),
		(error) => {
			console.error(error.message);
			process.exit(1);
		},
	);
}
