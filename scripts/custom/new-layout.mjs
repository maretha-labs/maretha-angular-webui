#!/usr/bin/env node
// npm run new:layout -- --type Contract --modes view,edit,create
import { fileURLToPath } from 'node:url';
import { kebab, ownerPrefix, pascal, quote, readArgs, run, scaffold } from './scaffold.mjs';

export const MODES = ['create', 'edit', 'view', 'metadata', 'import'];

const dialog = (title, body, footer) =>
	`<div class="modal-header"><h2 class="modal-title h5">${title}</h2></div>
		<div class="modal-body">${body}</div>
		<div class="modal-footer">${footer}</div>`;
const cancel =
	'<button type="button" class="btn btn-secondary" (click)="host?.cancel()">Cancel</button>';

const TEMPLATES = {
	create: (type) =>
		dialog(
			`New ${type}`,
			'<nx-schema-layout [layout]="layout" [parentId]="parentId()" [name]="name" mode="create" (valueChanged)="rename($event)" (saved)="host?.complete([$event])" />',
			cancel,
		),
	edit: (type) =>
		dialog(
			`Edit ${type}`,
			'<nx-schema-layout [layout]="layout" [documentId]="documentId()" [noEdit]="!!layoutContext?.noEdit" mode="edit" (saved)="host?.complete([$event])" />',
			cancel,
		),
	view: () => '<nx-schema-layout [layout]="layout" [documentId]="documentId()" mode="view" />',
	metadata:
		() => `<nx-schema-layout [layout]="layout" [documentId]="documentId()" mode="metadata" />
		@if (host) {
			<button type="button" class="btn btn-secondary" (click)="host.cancel()">Close</button>
		}`,
	import: () =>
		'<nx-schema-layout [layout]="layout" [parentId]="parentId()" mode="import" [draftOnly]="true" [initialValues]="draft.properties" (valueChanged)="draft.update($event)" />',
};

const MEMBERS = {
	create: `
	name = '';

	parentId(): string {
		return String(this.layoutContext?.parentDocument?.['uid'] ?? '');
	}

	/** Nuxeo needs a document name; derive it from the title like the core editors do. */
	rename(values: Readonly<Record<string, unknown>>): void {
		this.name = String(values['dc:title'] ?? '').replace(/[/\\\\]/g, '-').trim();
	}`,
	document: `
	documentId(): string {
		return String(this.layoutContext?.document?.['uid'] ?? '');
	}`,
	import: `
	private readonly schema = viewChild(SchemaLayoutComponent);

	constructor() {
		// The host creates no documents until every mounted layout reports valid values.
		effect(() => {
			const schema = this.schema();
			if (schema?.ready()) this.draft.setValid(!schema.invalid());
		});
	}

	parentId(): string {
		return String(this.layoutContext?.parentDocument?.['uid'] ?? '');
	}`,
};

function fields({ constant, prefix, type, typeName }) {
	return `import type { DocumentLayout } from '@maretha/webui-sdk';

/** Fields shared by every ${type} layout mode; the server schema validates each property. */
export const ${constant}: DocumentLayout = {
	id: ${quote(`${prefix}.layout.${typeName}.fields`)},
	documentType: ${quote(type)},
	fields: [{ property: 'dc:title', label: 'Title', required: true }],
};
`;
}

function component({ className, selector, constant, fieldsFile, type, mode }) {
	const imported = mode === 'import';
	const core = imported
		? 'ChangeDetectionStrategy, Component, Input, effect, inject, viewChild'
		: 'ChangeDetectionStrategy, Component, Input, inject';
	const injected = imported
		? `/** One file of the import: the host uploads it and creates its document. */
	readonly draft = inject(DOCUMENT_IMPORT_DRAFT);`
		: `/** Present when a dialog hosts this layout; inline hosts provide none. */
	readonly host = inject(DOCUMENT_LAYOUT_HOST, { optional: true });`;
	return `import { ${core} } from '@angular/core';
import {
	${imported ? 'DOCUMENT_IMPORT_DRAFT' : 'DOCUMENT_LAYOUT_HOST'},
	SchemaLayoutComponent,
	type DocumentLayoutContext,
} from '@maretha/webui-sdk';
import { ${constant} } from './${fieldsFile}';

@Component({
	selector: '${selector}',
	imports: [SchemaLayoutComponent],
	template: \`${TEMPLATES[mode](type)}\`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ${className} {
	/** Dialog hosts assign inputs directly, so this stays a decorator input. */
	@Input() layoutContext: DocumentLayoutContext | undefined;
	${injected}
	readonly layout = ${constant};
${MEMBERS[mode] ?? MEMBERS.document}
}
`;
}

function importSpec({ className, file, type }) {
	return `import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
	DOCUMENT_IMPORT_DRAFT,
	DOCUMENT_LAYOUT_GATEWAY,
	SchemaLayoutComponent,
	documentLayoutContext,
} from '@maretha/webui-sdk';
import { ${className} } from './${file}';

describe('${className}', () => {
	it('edits the draft of one imported file without saving it', () => {
		const draft = {
			file: new File(['content'], 'source.pdf'),
			properties: { 'dc:title': 'source.pdf' },
			update: jasmine.createSpy('update'),
			setValid: jasmine.createSpy('setValid'),
		};
		const pending = () => new Promise<never>(() => undefined);
		TestBed.configureTestingModule({
			providers: [
				{ provide: DOCUMENT_LAYOUT_GATEWAY, useValue: { readType: pending, read: pending } },
				{ provide: DOCUMENT_IMPORT_DRAFT, useValue: draft },
			],
		});
		const fixture = TestBed.createComponent(${className});
		fixture.componentInstance.layoutContext = documentLayoutContext({
			documentType: ${quote(type)},
			mode: 'import',
			parentDocument: { uid: 'parent-1' },
		});
		fixture.detectChanges();
		const layout = fixture.debugElement.query(By.directive(SchemaLayoutComponent))
			.componentInstance as SchemaLayoutComponent;
		expect(layout.mode()).toBe('import');
		expect(layout.parentId()).toBe('parent-1');
		expect(layout.draftOnly()).toBeTrue();
		expect(layout.initialValues()).toEqual({ 'dc:title': 'source.pdf' });
		const values = { 'dc:title': 'Signed source' };
		layout.valueChanged.emit(values);
		expect(draft.update).toHaveBeenCalledOnceWith(values);
	});
});
`;
}

function componentSpec({ className, file, type, mode }) {
	if (mode === 'import') return importSpec({ className, file, type });
	const create = mode === 'create';
	const scope = create ? `parentDocument: { uid: 'parent-1' }` : `document: { uid: 'document-1' }`;
	const dialogMode = ['create', 'edit'].includes(mode);
	return `import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
	DOCUMENT_LAYOUT_GATEWAY,
	DOCUMENT_LAYOUT_HOST,
	SchemaLayoutComponent,
	documentLayoutContext,
} from '@maretha/webui-sdk';
import { ${className} } from './${file}';

describe('${className}', () => {
	it('binds the schema layout to the ${create ? 'parent folder' : 'document'}${dialogMode ? ' and finishes the dialog' : ''}', () => {
		const host = jasmine.createSpyObj('DocumentLayoutHost', ['complete', 'cancel']);
		const pending = () => new Promise<never>(() => undefined);
		TestBed.configureTestingModule({
			providers: [
				{ provide: DOCUMENT_LAYOUT_GATEWAY, useValue: { readType: pending, read: pending } },
				{ provide: DOCUMENT_LAYOUT_HOST, useValue: host },
			],
		});
		const fixture = TestBed.createComponent(${className});
		fixture.componentInstance.layoutContext = documentLayoutContext({
			documentType: ${quote(type)},
			mode: ${quote(mode)},
			${scope},
		});
		fixture.detectChanges();
		const layout = fixture.debugElement.query(By.directive(SchemaLayoutComponent))
			.componentInstance as SchemaLayoutComponent;
		expect(layout.mode()).toBe(${quote(mode)});
		expect(layout.${create ? 'parentId' : 'documentId'}()).toBe(${quote(create ? 'parent-1' : 'document-1')});${
			dialogMode
				? `
		const saved = { uid: 'document-1', type: ${quote(type)}, properties: {} };
		layout.saved.emit(saved);
		expect(host.complete).toHaveBeenCalledOnceWith([saved]);`
				: ''
		}
	});
});
`;
}

export async function newLayout(argv) {
	const args = readArgs(argv, { type: { type: 'string' }, modes: { type: 'string' } });
	const prefix = ownerPrefix(args.root);
	const type = args.type;
	if (typeof type !== 'string' || !/^[A-Z][A-Za-z0-9_]*$/.test(type))
		throw new Error('--type must be a Nuxeo document type name, such as Contract.');
	const modes = [...new Set((args.modes ?? '').split(',').map((mode) => mode.trim()))];
	for (const mode of modes) {
		if (!MODES.includes(mode))
			throw new Error(`--modes takes a comma list of ${MODES.join(', ')}.`);
	}
	const typeName = kebab(type);
	const directory = `custom/layouts/${type}`;
	const constant = `${typeName.replaceAll('-', '_').toUpperCase()}_LAYOUT`;
	const fieldsFile = `${typeName}.fields`;
	const files = [
		{
			path: `${directory}/${fieldsFile}.ts`,
			content: fields({ constant, prefix, type, typeName }),
			reuse: true,
		},
	];
	const imports = [];
	const layouts = [];
	const ids = [];
	for (const mode of modes) {
		const id = `${prefix}.layout.${typeName}.${mode}`;
		const className = `${pascal(type)}${pascal(mode)}LayoutComponent`;
		const file = `${typeName}.${mode}.layout`;
		const naming = {
			className,
			selector: `${prefix}-${typeName}-${mode}-layout`,
			constant,
			fieldsFile,
			type,
			mode,
		};
		files.push(
			{ path: `${directory}/${file}.ts`, content: component(naming) },
			{ path: `${directory}/${file}.spec.ts`, content: componentSpec({ ...naming, file }) },
		);
		imports.push(`import { ${className} } from './layouts/${type}/${file}';`);
		// Priority 10 outranks the default layouts (priority 0) for the same type and mode.
		layouts.push(
			`{ id: ${quote(id)}, documentType: ${quote(type)}, mode: ${quote(mode)}, priority: 10, component: ${className} }`,
		);
		ids.push(id);
	}
	return scaffold(args.root, { ids, files, imports, layouts });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await run(newLayout);
