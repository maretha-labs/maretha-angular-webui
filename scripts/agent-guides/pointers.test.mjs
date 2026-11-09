// AGENTS.md is the one instruction set for coding agents; every tool-specific file points at it,
// its customer zone equals CUSTOMER_PATHS, its links resolve, the commands it names exist and it
// never refers to maintainer-only files.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CUSTOMER_PATHS } from '../core-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

export const AGENTS = 'AGENTS.md';
/** One line each, in the tool's own location, pointing at AGENTS.md. */
export const POINTERS = Object.freeze([
	'CLAUDE.md',
	'GEMINI.md',
	'.github/copilot-instructions.md',
	'.cursor/rules/maretha.mdc',
]);
/** The guides AGENTS.md links; the recipe and prompt indexes stand for their directories. */
export const GUIDES = Object.freeze([
	'agent-guides/01-boundaries.md',
	'agent-guides/02-slot-catalog.md',
	'agent-guides/03-document-layouts.md',
	'agent-guides/04-recipes/README.md',
	'agent-guides/05-polymer-migration.md',
	'agent-guides/06-verify-loop.md',
	'agent-guides/07-forbidden.md',
	'agent-guides/prompts/README.md',
]);
/** One recipe per customization task; each links the examples/acme file that does it. */
export const RECIPES = Object.freeze(
	[
		'drawer',
		'page',
		'single-action',
		'paired-menu-and-page',
		'document-view',
		'theme',
		'layouts',
		'i18n',
		'visibility',
		'projections-and-exports',
		'quick-search',
		'migration',
		'testing',
	].map((topic) => `agent-guides/04-recipes/${topic}.md`),
);
export const PROMPTS = Object.freeze(
	['add-contribution', 'add-layouts', 'migrate-polymer', 'contribute-upstream'].map(
		(name) => `agent-guides/prompts/${name}.md`,
	),
);

/** The backticked paths between the customer-paths markers of a document. */
export function customerPathsIn(text) {
	const block = /<!-- customer-paths -->([\s\S]*?)<!-- \/customer-paths -->/.exec(text);
	assert.ok(block, 'the customer-paths markers are missing');
	return [...block[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

/** Relative link targets of a Markdown document, fragments removed. */
export function linkTargets(text) {
	return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
		.map((match) => match[1])
		.filter((target) => !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith('#'))
		.map((target) => target.split('#')[0]);
}

/** The npm scripts a document runs, such as `npm run verify`. */
export const scriptsNamed = (text) => [
	...new Set([...text.matchAll(/npm run ([a-z0-9:-]+)/g)].map((match) => match[1])),
];

describe(AGENTS, () => {
	const text = read(AGENTS);

	it('lists the customer zone exactly as CUSTOMER_PATHS', () => {
		assert.deepEqual(customerPathsIn(text), [...CUSTOMER_PATHS]);
	});

	it('links only to files that exist', () => {
		for (const target of linkTargets(text))
			assert.ok(existsSync(path.join(root, target)), `${AGENTS} links to missing ${target}`);
		for (const guide of GUIDES) assert.ok(text.includes(`(${guide})`), `${AGENTS} links ${guide}`);
	});

	it('names only npm scripts that exist', () => {
		const { scripts } = JSON.parse(read('package.json'));
		for (const name of scriptsNamed(text)) assert.ok(scripts[name], `npm run ${name}`);
		for (const name of ['verify', 'verify:upstream', 'new:contribution', 'new:layout'])
			assert.ok(text.includes(`npm run ${name}`), `${AGENTS} names npm run ${name}`);
	});

	it('refers to no maintainer-only material', () => {
		assert.doesNotMatch(text, /maintainers\//);
		assert.doesNotMatch(text, /demo\.maretha\.io/);
	});
});

describe('tool pointers', () => {
	for (const pointer of POINTERS)
		it(`${pointer} is one line that points at ${AGENTS}`, () => {
			const text = read(pointer);
			const body = text.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
			assert.ok(body.includes(AGENTS), pointer);
			assert.equal(body.split('\n').length, 1, `${pointer} should be one line`);
			if (pointer.endsWith('.mdc')) assert.match(text, /^alwaysApply: true$/m);
		});
});

describe('agent guides', () => {
	for (const guide of [...GUIDES, ...RECIPES, ...PROMPTS])
		it(`${guide} links only to files that exist`, () => {
			for (const target of linkTargets(read(guide)))
				assert.ok(
					existsSync(path.join(root, path.dirname(guide), target)),
					`${guide} links to missing ${target}`,
				);
		});

	it('index every recipe and every prompt', () => {
		const recipes = read('agent-guides/04-recipes/README.md');
		for (const recipe of RECIPES) assert.ok(recipes.includes(`(${path.basename(recipe)})`), recipe);
		const prompts = read('agent-guides/prompts/README.md');
		for (const prompt of PROMPTS) assert.ok(prompts.includes(`(${path.basename(prompt)})`), prompt);
	});

	for (const recipe of RECIPES)
		it(`${recipe} links a file of the ACME example and ends with the verify loop`, () => {
			const text = read(recipe);
			assert.ok(
				linkTargets(text).some((target) => target.includes('examples/acme/')),
				`${recipe} links no examples/acme file`,
			);
			assert.ok(text.includes('npm run verify'), `${recipe} does not name npm run verify`);
		});

	it('states the customer zone once, in 01-boundaries.md, equal to CUSTOMER_PATHS', () => {
		assert.deepEqual(customerPathsIn(read('agent-guides/01-boundaries.md')), [...CUSTOMER_PATHS]);
	});
});

describe('customerPathsIn and linkTargets', () => {
	it('read the marked block and skip external links and fragments', () => {
		assert.deepEqual(
			customerPathsIn('x\n<!-- customer-paths -->\n- `a/`\n- `b.json`\n<!-- /customer-paths -->\n'),
			['a/', 'b.json'],
		);
		assert.deepEqual(
			linkTargets('[a](docs/x.md#top) [b](https://example.com/) [c](#here) [d](../y.md)'),
			['docs/x.md', '../y.md'],
		);
	});
});
