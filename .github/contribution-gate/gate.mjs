// Contribution gate decision. Pure: no network, no file system, no process. The
// workflow (pull_request_target, base-branch code only) collects the pull request's
// metadata through the API, calls `evaluate`, and posts the result as the
// `contribution-gate` check and one sticky comment. Branch names, titles, bodies and labels
// are data here; nothing in this module hands them to a shell.

export const COMMENT_MARKER = '<!-- contribution-gate -->';

const CONVENTIONAL_TITLE =
	/^(feat|fix|docs|test|chore|build|ci|refactor|perf|style|revert)(\([a-z0-9._/-]+\))?!?: \S/;
// Branches in this repository only; branches on forks may use any name.
const SAME_REPO_BRANCH = /^(fix|feat|docs|test|chore)\/[a-z0-9][a-z0-9-]*$/;
const PRODUCT_BRANCH = /^(fix|feat)\/(\d+)-[a-z0-9][a-z0-9-]*$/;
const ISSUE_REFERENCE =
	/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?|part of)\s*:?\s+#(\d+)\b/gi;

/** The title's type picks the route: fix, feat, docs, test, or chore for every other type. */
export function titleRoute(title) {
	const type = CONVENTIONAL_TITLE.exec(title ?? '')?.[1];
	if (!type) return null;
	return ['fix', 'feat', 'docs', 'test'].includes(type) ? type : 'chore';
}

/** `**` crosses directories, `*` and `?` stay inside one path segment. */
export function globToRegExp(glob) {
	let source = '';
	for (let i = 0; i < glob.length; i++) {
		const char = glob[i];
		if (char === '*' && glob[i + 1] === '*') {
			if (glob[i + 2] === '/') {
				source += '(?:.*/)?';
				i += 2;
			} else {
				source += '.*';
				i += 1;
			}
		} else if (char === '*') source += '[^/]*';
		else if (char === '?') source += '[^/]';
		else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	}
	return new RegExp(`^${source}$`);
}

const matcher = (globs = []) => {
	const patterns = globs.map(globToRegExp);
	return (file) => patterns.some((pattern) => pattern.test(file));
};

const inCustomerZone = (customerPaths) => (file) =>
	customerPaths.some((entry) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry));

/** Every path a change touches, including the old side of a rename. */
export function touchedPaths(changedFiles) {
	return [...new Set(changedFiles.flatMap((f) => [f.path, f.previousPath].filter(Boolean)))].sort();
}

/**
 * Issue numbers the caller must fetch: every reference in the body, plus the number in a
 * `fix/<n>-` or `feat/<n>-` branch.
 */
export function referencedIssues(pr) {
	const numbers = new Set();
	const product = PRODUCT_BRANCH.exec(pr.branch ?? '');
	if (product) numbers.add(Number(product[2]));
	for (const match of (pr.body ?? '').matchAll(ISSUE_REFERENCE)) numbers.add(Number(match[1]));
	return [...numbers].sort((a, b) => a - b);
}

/**
 * A label counts only while present and when its most recent `labeled` event came from an
 * account with write access. Events must be in timeline order.
 */
export function confirmedBy(issue, label, maintainers) {
	if (!issue?.labels?.includes(label)) return null;
	const lastLabeled = (issue.labelEvents ?? [])
		.filter((e) => e.event === 'labeled' && e.label === label)
		.at(-1);
	return lastLabeled && maintainers.includes(lastLabeled.actor) ? lastLabeled.actor : null;
}

function issueProblems(issue, number, label, maintainers) {
	if (!issue) return [`Issue #${number} was not found.`];
	if (issue.isPullRequest) return [`#${number} is a pull request, not an issue.`];
	const problems = [];
	if (issue.state !== 'open') problems.push(`Issue #${number} is ${issue.state}; it must be open.`);
	if (!confirmedBy(issue, label, maintainers))
		problems.push(`Issue #${number} needs the \`${label}\` label, applied after triage.`);
	return problems;
}

const listPaths = (files) => files.map((file) => `- \`${file.replaceAll('`', "'")}\``).join('\n');

/**
 * @param {object} pr { author, headSha, branch, fromFork, title, body, changedFiles: [{path, previousPath?}],
 *   fromFork: true unless the head repository is this repository (a deleted fork counts as a fork),
 *   issues: { [number]: { state, isPullRequest, labels: string[], labelEvents: [{event, label, actor}] } } }
 * @param {object} config { maintainers: string[] (logins with admin or write permission on this repo), customerPaths: string[], alwaysAllowed: string[],
 *   labels: {fix, feat}, routes: {docs, test, dependabot: {allow, deny?}, chore: {issueRequiredFor}},
 *   bots: {dependabot: string} }
 */
export function evaluate(pr, config) {
	const reasons = [];
	const maintainers = config.maintainers ?? [];
	const isMaintainer = maintainers.includes(pr.author);
	const always = matcher(config.alwaysAllowed);
	const paths = touchedPaths(pr.changedFiles ?? []);
	const scoped = paths.filter((file) => !always(file));

	const titled = titleRoute(pr.title);
	if (!titled)
		reasons.push(
			'The title must follow Conventional Commits, for example `fix: keep the drawer toggle visible`. Its type picks the route.',
		);

	const customer = paths.filter(inCustomerZone(config.customerPaths ?? []));
	if (customer.length && !isMaintainer)
		reasons.push(
			`Customization-zone files never come upstream; put examples under \`examples/\`:\n${listPaths(customer)}`,
		);

	const outside = (route) => {
		const allow = matcher(route.allow);
		const deny = matcher(route.deny);
		return scoped.filter((file) => !allow(file) || deny(file));
	};

	let route;
	const branch = pr.branch ?? '';
	const fromFork = pr.fromFork === true;
	const fromDependabot = pr.author === config.bots?.dependabot;

	if (fromDependabot || (!fromFork && branch.startsWith('dependabot/'))) {
		route = 'dependabot';
		if (!fromDependabot) reasons.push('Only Dependabot uses `dependabot/` branches.');
		else if (!pr.branch.startsWith('dependabot/'))
			reasons.push('Dependabot pull requests must come from its own branches.');
		const wrong = outside(config.routes.dependabot);
		if (wrong.length)
			reasons.push(
				`Dependabot may change dependency and workflow files only:\n${listPaths(wrong)}`,
			);
	} else {
		route = titled;
		if (!fromFork) {
			const prefix = SAME_REPO_BRANCH.exec(branch)?.[1];
			if (!prefix)
				reasons.push(
					'Branches in this repository are named `<route>/<slug>`: `fix/`, `feat/`, `docs/`, `test/` or `chore/`. Branches on forks may use any name.',
				);
			else if (route && prefix !== route)
				reasons.push(
					`A \`${prefix}/\` branch does not match the title's route; use \`${route}/<slug>\`.`,
				);
		}
		if (route === 'fix' || route === 'feat') {
			const numbers = referencedIssues(pr);
			const problems = numbers.map((n) =>
				issueProblems(pr.issues?.[n], n, config.labels[route], maintainers),
			);
			if (!numbers.length)
				reasons.push(
					`A \`${route}\` pull request must name its confirmed issue in the description, for example \`Closes #123\`.`,
				);
			else if (problems.every((list) => list.length)) reasons.push(...problems.flat());
		} else if (route === 'chore') {
			const needsIssue = scoped.filter(matcher(config.routes.chore.issueRequiredFor));
			const confirmed = referencedIssues(pr).some((n) => {
				const issue = pr.issues?.[n];
				return (
					issue &&
					!issue.isPullRequest &&
					issue.state === 'open' &&
					Object.values(config.labels).some((label) => confirmedBy(issue, label, maintainers))
				);
			});
			if (needsIssue.length && !confirmed)
				reasons.push(
					`This maintenance change touches product files, so the description must reference a confirmed open issue (for example \`Refs #123\`):\n${listPaths(needsIssue)}`,
				);
		} else if (route) {
			const wrong = outside(config.routes[route]);
			if (wrong.length)
				reasons.push(
					`A \`${route}\` pull request may change ${route} files only:\n${listPaths(wrong)}`,
				);
		}
	}

	const conclusion = reasons.length ? 'failure' : 'success';
	const summary =
		conclusion === 'success'
			? `Route \`${route}\` satisfied.`
			: `${reasons.length} problem${reasons.length > 1 ? 's' : ''} on route \`${route ?? 'none'}\`.`;
	const comment = [
		COMMENT_MARKER,
		`**contribution-gate: ${conclusion}** for \`${pr.headSha}\``,
		'',
		summary,
		...reasons.map((reason) => `\n- ${reason.replaceAll('\n', '\n  ')}`),
		'',
		'See CONTRIBUTING.md for the routes. Push a fix or edit the pull request to run the gate again.',
	].join('\n');
	return { conclusion, route, headSha: pr.headSha, reasons, summary, comment };
}
