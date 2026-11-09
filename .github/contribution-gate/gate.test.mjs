import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
	COMMENT_MARKER,
	confirmedBy,
	evaluate,
	globToRegExp,
	referencedIssues,
	titleRoute,
} from './gate.mjs';

const routes = JSON.parse(readFileSync(new URL('./routes.json', import.meta.url), 'utf8'));
const config = {
	...routes,
	maintainers: ['maint'],
	customerPaths: ['custom/', 'migration/mapping.json', 'migration/polymer-source/'],
};

const confirmedIssue = (label, actor = 'maint', extra = {}) => ({
	state: 'open',
	isPullRequest: false,
	labels: [label],
	labelEvents: [{ event: 'labeled', label, actor }],
	...extra,
});

const pr = (overrides = {}) => ({
	author: 'contributor',
	headSha: 'a'.repeat(40),
	branch: 'patch-1',
	fromFork: true,
	title: 'fix: keep the drawer toggle visible',
	body: 'Closes #42',
	changedFiles: [{ path: 'app/components/drawer.ts' }, { path: 'core.manifest.json' }],
	issues: { 42: confirmedIssue('confirmed:bug') },
	...overrides,
});

const fails = (result, pattern) => {
	assert.equal(result.conclusion, 'failure');
	assert.ok(
		result.reasons.some((reason) => pattern.test(reason)),
		`expected a reason matching ${pattern}, got:\n${result.reasons.join('\n')}`,
	);
};

describe('globToRegExp', () => {
	it('crosses directories only with **', () => {
		assert.ok(globToRegExp('docs/**').test('docs/a/b.md'));
		assert.ok(globToRegExp('**/*.md').test('README.md'));
		assert.ok(globToRegExp('**/*.md').test('app/extensions/README.md'));
		assert.ok(!globToRegExp('.github/workflows/*.yml').test('.github/workflows/sub/x.yml'));
		assert.ok(!globToRegExp('docs/*.md').test('docs.md'));
	});
});

describe('product routes', () => {
	it('passes a fix with an open issue a maintainer confirmed', () => {
		const result = evaluate(pr(), config);
		assert.equal(result.conclusion, 'success', result.reasons.join('\n'));
		assert.equal(result.route, 'fix');
		assert.ok(result.comment.startsWith(COMMENT_MARKER));
		assert.ok(result.comment.includes('a'.repeat(40)), 'the decision names the head SHA');
	});

	it('fails when a non-maintainer applied the label', () => {
		fails(
			evaluate(pr({ issues: { 42: confirmedIssue('confirmed:bug', 'contributor') } }), config),
			/applied after triage/,
		);
	});

	it('fails when the label was removed after a maintainer applied it', () => {
		const issue = confirmedIssue('confirmed:bug');
		issue.labels = [];
		issue.labelEvents.push({ event: 'unlabeled', label: 'confirmed:bug', actor: 'maint' });
		fails(evaluate(pr({ issues: { 42: issue } }), config), /confirmed:bug/);
	});

	it('uses the most recent labeling: a maintainer label re-applied by a contributor does not count', () => {
		const issue = confirmedIssue('confirmed:bug');
		issue.labelEvents.push(
			{ event: 'unlabeled', label: 'confirmed:bug', actor: 'contributor' },
			{ event: 'labeled', label: 'confirmed:bug', actor: 'contributor' },
		);
		assert.equal(confirmedBy(issue, 'confirmed:bug', ['maint']), null);
	});

	it('fails for a closed issue, a missing issue and a pull request number', () => {
		fails(
			evaluate(
				pr({ issues: { 42: confirmedIssue('confirmed:bug', 'maint', { state: 'closed' }) } }),
				config,
			),
			/closed/,
		);
		fails(evaluate(pr({ issues: {} }), config), /not found/);
		fails(
			evaluate(
				pr({ issues: { 42: confirmedIssue('confirmed:bug', 'maint', { isPullRequest: true }) } }),
				config,
			),
			/pull request, not an issue/,
		);
	});

	it('requires the label that matches the title type', () => {
		fails(evaluate(pr({ title: 'feat: drawer toggle' }), config), /confirmed:feature/);
	});

	it('requires the description to name the issue, unless the branch carries its number', () => {
		fails(evaluate(pr({ body: 'Small fix.' }), config), /name its confirmed issue/);
		const numbered = evaluate(pr({ branch: 'fix/42-drawer-toggle', body: '' }), config);
		assert.equal(numbered.conclusion, 'success', numbered.reasons.join('\n'));
	});

	it('passes when one of several referenced issues is confirmed', () => {
		const result = evaluate(
			pr({
				body: 'Refs #7. Closes #42.',
				issues: {
					7: { ...confirmedIssue('other'), labels: [] },
					42: confirmedIssue('confirmed:bug'),
				},
			}),
			config,
		);
		assert.equal(result.conclusion, 'success', result.reasons.join('\n'));
	});
});

describe('branch names', () => {
	it('accepts any branch name on a fork', () => {
		for (const branch of ['patch-1', 'main', 'My Fix', 'docs/whatever']) {
			const result = evaluate(pr({ branch }), config);
			assert.equal(result.conclusion, 'success', `${branch}: ${result.reasons.join('\n')}`);
		}
	});

	it('requires <route>/<slug> for branches in this repository', () => {
		const own = (overrides) => evaluate(pr({ fromFork: false, ...overrides }), config);
		assert.equal(own({ branch: 'fix/drawer-toggle' }).conclusion, 'success');
		assert.equal(own({ branch: 'fix/42-drawer-toggle', body: '' }).conclusion, 'success');
		fails(own({ branch: 'patch-1' }), /named `<route>\/<slug>`/);
		fails(own({ branch: 'docs/drawer-toggle' }), /use `fix\/<slug>`/);
	});

	it('treats a missing fromFork as a branch in this repository', () => {
		fails(evaluate(pr({ fromFork: undefined }), config), /named `<route>\/<slug>`/);
	});

	it('never echoes the branch name', () => {
		const result = evaluate(pr({ fromFork: false, branch: '$(curl evil)' }), config);
		assert.ok(!result.comment.includes('curl evil'));
	});
});

describe('title', () => {
	it('maps every Conventional Commits type to a route', () => {
		assert.equal(titleRoute('fix: a'), 'fix');
		assert.equal(titleRoute('feat(sdk)!: a'), 'feat');
		assert.equal(titleRoute('docs: a'), 'docs');
		assert.equal(titleRoute('test: a'), 'test');
		for (const type of ['chore', 'build', 'ci', 'refactor', 'perf', 'style', 'revert'])
			assert.equal(titleRoute(`${type}: a`), 'chore');
		assert.equal(titleRoute('Fixed stuff'), null);
	});

	it('rejects a non-conventional title and treats hostile text as data', () => {
		fails(evaluate(pr({ title: 'Fixed stuff' }), config), /Conventional Commits/);
		const hostile = evaluate(pr({ title: '$(curl evil) `rm -rf /`' }), config);
		fails(hostile, /Conventional Commits/);
		assert.equal(hostile.route, null);
		assert.ok(!hostile.comment.includes('curl evil'), 'the comment never echoes the title');
	});

	it('accepts scopes and breaking-change markers', () => {
		assert.equal(
			evaluate(pr({ title: 'fix(drawer)!: keep the toggle visible' }), config).conclusion,
			'success',
		);
	});
});

describe('docs and test routes', () => {
	const docs = (changedFiles) =>
		evaluate(
			pr({
				branch: 'docs/build-guide',
				title: 'docs: explain the build',
				body: '',
				issues: {},
				changedFiles,
			}),
			config,
		);

	it('passes documentation-only changes, with the manifest always allowed', () => {
		const result = docs([
			{ path: 'docs/build.md' },
			{ path: 'README.md' },
			{ path: 'core.manifest.json' },
		]);
		assert.equal(result.conclusion, 'success', result.reasons.join('\n'));
	});

	it('names every file outside the route, including the old side of a rename', () => {
		const result = docs([
			{ path: 'docs/a.md' },
			{ path: 'docs/b.md', previousPath: 'app/b.ts' },
			{ path: 'app/c.ts' },
		]);
		fails(result, /docs files only/);
		assert.match(result.comment, /app\/b\.ts/);
		assert.match(result.comment, /app\/c\.ts/);
	});

	it('keeps legal and workflow files out of the docs route', () => {
		fails(docs([{ path: 'docs/third-party/inventory.json' }]), /docs files only/);
		fails(docs([{ path: '.github/review-agent.md' }]), /docs files only/);
	});

	it('passes isolated tests and rejects product code in a test pull request', () => {
		const test = (changedFiles) =>
			evaluate(
				pr({
					branch: 'test/drawer-spec',
					title: 'test: cover the drawer',
					body: '',
					issues: {},
					changedFiles,
				}),
				config,
			);
		assert.equal(test([{ path: 'app/components/drawer.spec.ts' }]).conclusion, 'success');
		fails(
			test([{ path: 'app/components/drawer.spec.ts' }, { path: 'app/components/drawer.ts' }]),
			/test files only/,
		);
	});
});

describe('chore route', () => {
	const chore = (overrides) =>
		evaluate(
			pr({
				branch: 'chore/lint-config',
				title: 'chore: tidy lint config',
				body: '',
				issues: {},
				...overrides,
			}),
			config,
		);

	it('passes tooling-only maintenance without an issue', () => {
		assert.equal(
			chore({ changedFiles: [{ path: 'scripts/lint.mjs' }, { path: 'eslint.config.js' }] })
				.conclusion,
			'success',
		);
	});

	it('requires a confirmed issue reference when product files change', () => {
		fails(chore({ changedFiles: [{ path: 'app/main.ts' }] }), /confirmed open issue/);
		const linked = chore({
			changedFiles: [{ path: 'app/main.ts' }],
			body: 'Refs #7',
			issues: { 7: confirmedIssue('confirmed:feature') },
		});
		assert.equal(linked.conclusion, 'success', linked.reasons.join('\n'));
	});
});

describe('dependabot route', () => {
	const bot = (overrides) =>
		evaluate(
			pr({
				author: 'dependabot[bot]',
				fromFork: false,
				branch: 'dependabot/npm_and_yarn/npm-minor-and-patch-1a2b',
				title: 'chore(deps): bump the npm-minor-and-patch group',
				body: '',
				issues: {},
				...overrides,
			}),
			config,
		);

	it('passes dependency and workflow files', () => {
		const result = bot({
			changedFiles: [
				{ path: 'package.json' },
				{ path: 'package-lock.json' },
				{ path: '.github/workflows/ci.yml' },
			],
		});
		assert.equal(result.conclusion, 'success', result.reasons.join('\n'));
	});

	it('rejects other files and a human on a dependabot branch in this repository', () => {
		fails(bot({ changedFiles: [{ path: 'app/main.ts' }] }), /dependency and workflow files only/);
		fails(
			bot({ author: 'contributor', changedFiles: [{ path: 'package.json' }] }),
			/Only Dependabot/,
		);
	});

	it('routes a fork branch named dependabot/ by its title', () => {
		const result = evaluate(pr({ branch: 'dependabot/x' }), config);
		assert.equal(result.route, 'fix');
		assert.equal(result.conclusion, 'success', result.reasons.join('\n'));
	});
});

describe('customer zone', () => {
	it('rejects customization-zone files without write access but not with it', () => {
		const files = [{ path: 'custom/index.ts' }, { path: 'migration/mapping.json' }];
		fails(evaluate(pr({ changedFiles: files }), config), /Customization-zone files/);
		assert.equal(
			evaluate(pr({ author: 'maint', changedFiles: files }), config).conclusion,
			'success',
		);
	});
});

describe('referencedIssues', () => {
	it('lists the branch issue and body references once each', () => {
		assert.deepEqual(
			referencedIssues({ branch: 'fix/42-x', body: 'Closes #42, refs #7. Part of #9. See #100.' }),
			[7, 9, 42],
		);
	});
});
