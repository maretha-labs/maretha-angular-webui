#!/usr/bin/env node
// npm run new:contribution -- --slot DOCUMENT_ACTIONS --id acme.contract.approve [--label Approve] [--order 100]
import { fileURLToPath } from 'node:url';
import {
	checkId,
	kebab,
	ownerPrefix,
	pascal,
	quote,
	readArgs,
	run,
	scaffold,
	sentence,
} from './scaffold.mjs';

const paired = (items, pages, context) => ({ family: 'paired', items, pages, context });
const action = (context) => ({ family: 'single', template: 'action', context });

/** Every SDK slot, with the context its guard accepts and how defaults register into it. */
export const SLOTS = Object.freeze({
	DRAWER_ITEMS: { family: 'drawer', context: 'DrawerContext' },
	DRAWER_PAGES: { family: 'drawer', context: 'DrawerContext' },
	PAGES: { family: 'page', context: 'PageContext' },
	USER_MENU: action('UserMenuContext'),
	ADMINISTRATION_MENU: paired(
		'ADMINISTRATION_MENU',
		'ADMINISTRATION_PAGES',
		'AdministrationContext',
	),
	ADMINISTRATION_PAGES: paired(
		'ADMINISTRATION_MENU',
		'ADMINISTRATION_PAGES',
		'AdministrationContext',
	),
	DOCUMENT_ACTIONS: action('DocumentActionContext'),
	DOCUMENT_VIEWS_ITEMS: { family: 'document-view', context: 'DocumentViewContext' },
	DOCUMENT_VIEWS_PAGES: { family: 'document-view', context: 'DocumentViewContext' },
	DOCUMENT_INFO_BAR: { family: 'single', template: 'notice', context: 'DocumentInfoBarContext' },
	BLOB_ACTIONS: action('BlobActionContext'),
	RESULTS_ACTIONS: action('ResultsToolbarContext'),
	RESULTS_SELECTION_ACTIONS: action('ResultsToolbarContext'),
	TRASH_RESULTS_SELECTION_ACTIONS: action('ResultsSelectionContext'),
	COLLECTION_ACTIONS: action('ResultsToolbarContext'),
	DOCUMENT_CREATE_ACTIONS: action('DocumentCreateContext'),
	CREATE_POPUP_ITEMS: paired('CREATE_POPUP_ITEMS', 'CREATE_POPUP_PAGES', 'DocumentCreateContext'),
	CREATE_POPUP_PAGES: paired('CREATE_POPUP_ITEMS', 'CREATE_POPUP_PAGES', 'DocumentCreateContext'),
	FILE_UPLOAD_ACTIONS: action('FileUploadContext'),
	PUBLISH_ITEMS: paired('PUBLISH_ITEMS', 'PUBLISH_PAGES', 'PublishContext'),
	PUBLISH_PAGES: paired('PUBLISH_ITEMS', 'PUBLISH_PAGES', 'PublishContext'),
	ANALYTICS_ITEMS: paired('ANALYTICS_ITEMS', 'ANALYTICS_PAGES', 'AdministrationContext'),
	ANALYTICS_PAGES: paired('ANALYTICS_ITEMS', 'ANALYTICS_PAGES', 'AdministrationContext'),
	THEMES: { family: 'theme' },
	QUICK_SEARCH_ACTIONS: action('QuickSearchContext'),
	SHELL_ACTIONS: action('ShellActionContext'),
});

const TEMPLATES = {
	action: (label) => `<button type="button" (click)="run()">${label}</button>`,
	notice: (label) => `<p role="status">${label}</p>`,
	page: (label) => `<section><h2>${label}</h2></section>`,
};

function component({ className, selector, context, template, label }) {
	const run =
		template === 'action' ? `\n\n\trun(): void {\n\t\t// Act on this.context().\n\t}` : '';
	return `import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ${context} } from '@maretha/webui-sdk';

@Component({
	selector: '${selector}',
	template: ${quote(TEMPLATES[template](label))},
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ${className} {
	readonly context = input.required<${context}>();${run}
}
`;
}

function componentSpec({ className, file, context, label }) {
	return `import { TestBed } from '@angular/core/testing';
import type { ${context} } from '@maretha/webui-sdk';
import { ${className} } from './${file}';

describe('${className}', () => {
	it('renders in its slot', () => {
		const fixture = TestBed.createComponent(${className});
		fixture.componentRef.setInput('context', {} as ${context});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain(${quote(label)});
	});
});
`;
}

function theme({ constant, id, label, order }) {
	return `import type { WebUiThemeDefinition } from '@maretha/webui-sdk';

export const ${constant}: WebUiThemeDefinition = {
	id: ${quote(id)},
	label: ${quote(label)},
	order: ${order},
	tokens: { '--nuxeo-primary-color': '#00adff' },
};
`;
}

function themeSpec({ constant, file }) {
	return `import { defineWebUiTheme } from '@maretha/webui-sdk';
import { ${constant} } from './${file}';

describe('${constant}', () => {
	it('defines a valid theme', () => {
		expect(defineWebUiTheme(${constant}).id).toBe(${constant}.id);
	});
});
`;
}

export async function newContribution(argv) {
	const args = readArgs(argv, {
		slot: { type: 'string' },
		id: { type: 'string' },
		label: { type: 'string' },
		order: { type: 'string' },
	});
	const slot = SLOTS[args.slot];
	if (!slot) throw new Error(`--slot must be one of ${Object.keys(SLOTS).join(', ')}.`);
	const id = checkId(args.id, ownerPrefix(args.root));
	const label = args.label ?? sentence(id.split('.').at(-1));
	if (!label.trim() || /[<>{}]/.test(label)) throw new Error('--label must be plain text.');
	const order = Number(args.order ?? 100);
	if (!Number.isFinite(order)) throw new Error('--order must be a number.');
	const directory = `custom/contributions/${kebab(args.slot)}`;
	const name = { className: `${pascal(id)}Component`, selector: kebab(id), label };

	if (slot.family === 'theme') {
		const constant = `${id.replaceAll(/[.-]/g, '_').toUpperCase()}_THEME`;
		const file = `${id}.theme`;
		return scaffold(args.root, {
			ids: [id],
			files: [
				{ path: `${directory}/${file}.ts`, content: theme({ constant, id, label, order }) },
				{ path: `${directory}/${file}.spec.ts`, content: themeSpec({ constant, file }) },
			],
			sdk: ['defineWebUiTheme'],
			imports: [`import { ${constant} } from './contributions/${kebab(args.slot)}/${file}';`],
			contributions: [`defineWebUiTheme(${constant})`],
		});
	}

	const file = `${id}.component`;
	const template = slot.family === 'single' ? slot.template : 'page';
	const load = `loadComponent: () => import('./contributions/${kebab(args.slot)}/${file}').then((m) => m.${name.className})`;
	const files = [
		{
			path: `${directory}/${file}.ts`,
			content: component({ ...name, context: slot.context, template }),
		},
		{
			path: `${directory}/${file}.spec.ts`,
			content: componentSpec({ ...name, file, context: slot.context }),
		},
	];
	const view = `{ id: ${quote(id)}, viewId: ${quote(id)}, label: ${quote(label)}, order: ${order}, ${load} }`;
	const registration = {
		single: () => ({
			sdk: ['defineContribution', `${args.slot}_SLOT`],
			contributions: [
				`defineContribution(${args.slot}_SLOT, { id: ${quote(id)}, order: ${order}, ${load} })`,
			],
		}),
		page: () => ({
			sdk: ['definePage'],
			contributions: [`definePage({ id: ${quote(id)}, pageId: ${quote(id)}, ${load} })`],
		}),
		'document-view': () => ({
			sdk: ['defineDocumentView'],
			contributions: [`...defineDocumentView(${view})`],
		}),
		paired: () => ({
			sdk: ['definePairedView', `${slot.items}_SLOT`, `${slot.pages}_SLOT`],
			contributions: [
				`...definePairedView({ items: ${slot.items}_SLOT, pages: ${slot.pages}_SLOT }, ${view})`,
			],
		}),
		drawer: () => ({
			sdk: ['defineContribution', 'DRAWER_ITEMS_SLOT', 'DRAWER_PAGES_SLOT', 'DrawerItemComponent'],
			contributions: [
				`defineContribution(DRAWER_ITEMS_SLOT, { id: ${quote(id)}, pairKey: ${quote(id)}, order: ${order}, component: DrawerItemComponent, inputs: { pageId: ${quote(id)}, label: ${quote(label)}, icon: 'nuxeo:edit' } })`,
				`defineContribution(DRAWER_PAGES_SLOT, { id: ${quote(id)}, pairKey: ${quote(id)}, ${load} })`,
			],
		}),
	}[slot.family]();
	return scaffold(args.root, { ids: [id], files, ...registration });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await run(newContribution);
