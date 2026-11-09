import assert from 'node:assert/strict';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as prettier from 'prettier';
import { newContribution, SLOTS } from './new-contribution.mjs';
import { newLayout } from './new-layout.mjs';
import { REPOSITORY } from './scaffold.mjs';

let root;
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const contribution = (...args) => newContribution(['--root', root, ...args]);
const layout = (...args) => newLayout(['--root', root, ...args]);

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), 'custom-scaffold-'));
	mkdirSync(path.join(root, 'custom'));
	copyFileSync(path.join(REPOSITORY, 'custom', 'index.ts'), path.join(root, 'custom', 'index.ts'));
	writeFileSync(path.join(root, 'custom', 'owner.json'), '{ "prefix": "acme" }\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('new:contribution', () => {
	it('writes the component, its spec and a lazy registration with the SDK imports', async () => {
		const written = await contribution(
			'--slot',
			'DOCUMENT_ACTIONS',
			'--id',
			'acme.contract.approve',
		);
		assert.deepEqual(written, [
			'custom/contributions/document-actions/acme.contract.approve.component.ts',
			'custom/contributions/document-actions/acme.contract.approve.component.spec.ts',
			'custom/index.ts',
		]);
		const index = read('custom/index.ts');
		assert.match(index, /defineContribution,\n\tDOCUMENT_ACTIONS_SLOT,\n/);
		assert.match(
			index,
			/id: 'acme\.contract\.approve',\n\s+order: 100,\n\s+loadComponent: \(\) =>/,
		);
		assert.ok(
			index.indexOf("'acme.contract.approve'") < index.indexOf('// <custom:contributions>'),
		);
		const component = read(written[0]);
		assert.match(component, /selector: 'acme-contract-approve'/);
		assert.match(component, /export class AcmeContractApproveComponent/);
		assert.match(component, /input\.required<DocumentActionContext>\(\)/);
		assert.match(read(written[1]), /toContain\('Approve'\)/);
		for (const file of written)
			assert.ok(
				await prettier.check(read(file), {
					...(await prettier.resolveConfig(path.join(REPOSITORY, 'custom', 'index.ts'))),
					filepath: file,
				}),
				`${file} is not prettier-formatted`,
			);
	});

	it('registers every slot family and both halves of paired slots', async () => {
		for (const slot of Object.keys(SLOTS))
			await contribution(
				'--slot',
				slot,
				'--id',
				`acme.probe.${slot.toLowerCase().replaceAll('_', '-')}`,
			);
		const index = read('custom/index.ts');
		for (const fragment of [
			'definePage({',
			'...defineDocumentView({',
			'...definePairedView(\n\t\t\t\t\t{ items: ADMINISTRATION_MENU_SLOT, pages: ADMINISTRATION_PAGES_SLOT }',
			'component: DrawerItemComponent',
			'defineWebUiTheme(ACME_PROBE_THEMES_THEME)',
			'defineContribution(SHELL_ACTIONS_SLOT, {',
		])
			assert.ok(index.includes(fragment), fragment);
		assert.equal(index.match(/defineContribution\(DRAWER_PAGES_SLOT/g)?.length, 2);
	});

	it('rejects unknown slots, foreign prefixes, duplicates and overwrites', async () => {
		await assert.rejects(contribution('--slot', 'NOPE', '--id', 'acme.x'), /--slot must be one of/);
		await assert.rejects(contribution('--slot', 'DOCUMENT_ACTIONS', '--id', 'other.x'), /"acme\."/);
		await assert.rejects(
			contribution('--slot', 'DOCUMENT_ACTIONS', '--id', 'acme.Bad'),
			/"acme\."/,
		);
		await contribution('--slot', 'DOCUMENT_ACTIONS', '--id', 'acme.x');
		const index = read('custom/index.ts');
		await assert.rejects(
			contribution('--slot', 'BLOB_ACTIONS', '--id', 'acme.x'),
			/already registers acme\.x/,
		);
		writeFileSync(
			path.join(root, 'custom', 'index.ts'),
			index.replace("'acme.x'", "'acme.renamed'"),
		);
		await assert.rejects(
			contribution('--slot', 'DOCUMENT_ACTIONS', '--id', 'acme.x'),
			/Refusing to overwrite/,
		);
		writeFileSync(
			path.join(root, 'custom', 'index.ts'),
			index.replace('// <custom:contributions>', ''),
		);
		await assert.rejects(
			contribution('--slot', 'BLOB_ACTIONS', '--id', 'acme.y'),
			/missing its .* marker/,
		);
		assert.equal(
			existsSync(path.join(root, 'custom/contributions/blob-actions/acme.y.component.ts')),
			false,
		);
		writeFileSync(path.join(root, 'custom', 'owner.json'), '{ "prefix": "maretha" }');
		await assert.rejects(
			contribution('--slot', 'BLOB_ACTIONS', '--id', 'maretha.y'),
			/other than "maretha"/,
		);
	});
});

describe('new:layout', () => {
	it('writes one component and spec per mode around shared fields, outranking the defaults', async () => {
		const written = await layout('--type', 'LoanApplication', '--modes', 'create,view');
		assert.deepEqual(written, [
			'custom/layouts/LoanApplication/loan-application.fields.ts',
			'custom/layouts/LoanApplication/loan-application.create.layout.ts',
			'custom/layouts/LoanApplication/loan-application.create.layout.spec.ts',
			'custom/layouts/LoanApplication/loan-application.view.layout.ts',
			'custom/layouts/LoanApplication/loan-application.view.layout.spec.ts',
			'custom/index.ts',
		]);
		const index = read('custom/index.ts');
		assert.match(
			index,
			/import \{ LoanApplicationCreateLayoutComponent \} from '\.\/layouts\/LoanApplication\/loan-application\.create\.layout';/,
		);
		assert.match(
			index,
			/id: 'acme\.layout\.loan-application\.view',\n\s+documentType: 'LoanApplication',\n\s+mode: 'view',\n\s+priority: 10,/,
		);
		const create = read(written[1]);
		assert.match(create, /selector: 'acme-loan-application-create-layout'/);
		assert.match(create, /@Input\(\) layoutContext: DocumentLayoutContext \| undefined;/);
		assert.match(create, /inject\(DOCUMENT_LAYOUT_HOST, \{ optional: true \}\)/);
		assert.match(create, /\(saved\)="host\?\.complete\(\[\$event\]\)"/);
		assert.doesNotMatch(read(written[3]), /host\?\.complete/);
	});

	it('writes an import layout that edits the host draft instead of saving', async () => {
		const [, component, spec] = await layout('--type', 'Contract', '--modes', 'import');
		assert.equal(component, 'custom/layouts/Contract/contract.import.layout.ts');
		const source = read(component);
		assert.match(source, /readonly draft = inject\(DOCUMENT_IMPORT_DRAFT\);/);
		assert.match(
			source,
			/mode="import"\s+\[draftOnly\]="true"\s+\[initialValues\]="draft\.properties"/,
		);
		assert.match(source, /\(valueChanged\)="draft\.update\(\$event\)"/);
		assert.match(source, /this\.draft\.setValid\(!schema\.invalid\(\)\)/);
		assert.doesNotMatch(source, /DOCUMENT_LAYOUT_HOST|saved/);
		assert.match(read(spec), /provide: DOCUMENT_IMPORT_DRAFT/);
		assert.match(read('custom/index.ts'), /mode: 'import',\n\s+priority: 10,/);
	});

	it('reuses the fields file for later modes and rejects modes without a template or host', async () => {
		await layout('--type', 'Contract', '--modes', 'view');
		const fields = read('custom/layouts/Contract/contract.fields.ts');
		assert.ok(
			!(await layout('--type', 'Contract', '--modes', 'edit')).includes(
				'custom/layouts/Contract/contract.fields.ts',
			),
		);
		assert.equal(read('custom/layouts/Contract/contract.fields.ts'), fields);
		await assert.rejects(
			layout('--type', 'Contract', '--modes', 'view'),
			/already registers acme\.layout\.contract\.view/,
		);
		await assert.rejects(layout('--type', 'Contract', '--modes', 'grid-item'), /--modes takes/);
		await assert.rejects(layout('--type', 'Contract', '--modes', 'preview'), /--modes takes/);
		await assert.rejects(layout('--type', 'contract', '--modes', 'view'), /--type must be/);
	});
});
