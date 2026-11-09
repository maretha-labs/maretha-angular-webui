import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('./migrate-static.mjs', import.meta.url));
test('static migration safely updates shared const imports once, uses SDK-relative imports and includes empty/defer blocks', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maretha-i18n-migration-'));
	try {
		const directory = path.join(root, 'app/extensions/primitives');
		fs.mkdirSync(directory, { recursive: true });
		fs.mkdirSync(path.join(root, 'assets/i18n'), { recursive: true });
		fs.writeFileSync(
			path.join(root, 'app/extensions/polymer-messages.generated.ts'),
			'export const POLYMER_MESSAGES = {"en-US":{}};',
		);
		const component = path.join(directory, 'sample.ts');
		fs.writeFileSync(
			component,
			'const templateImports = [NgTemplateOutlet];\n@Component({imports:templateImports, templateUrl:"./sample.html"}) class One {}\n@Component({imports:templateImports, template:`<button>Cancel</button>`}) class Two {}\n',
		);
		fs.writeFileSync(
			path.join(directory, 'sample.html'),
			"@switch(kind) { @case(\"a\") {<p>Case message</p>} @default {<p>Default message</p>}}<p>{{ kind === 'technical' ? 'Literal branch' : customer.title }}</p><p>{{ kind ? ('catalog.key' | translate) : 'Other branch' }}</p><span [class.active]=\"kind === 'technical'\" [title]=\"kind ? 'Accessible branch' : customer.title\"></span><button *ngIf=\"ready\" aria-label=\"Save changes\">Save</button>@for(item of items; track item) {<p>{{item.name}}</p>} @empty {<p>No items</p>} @defer {<p>Ready</p>} @placeholder {<p>Waiting</p>} @loading {<p>Loading</p>} @error {<p>Failed</p>}",
		);
		fs.writeFileSync(
			path.join(directory, 'other.ts'),
			'@Component({imports:[], templateUrl:"./sample.html"}) class Other {}',
		);
		fs.appendFileSync(
			path.join(directory, 'sample.html'),
			`<p>{{ status || 'Saving document…' }}</p><p>{{ item.label ?? 'Preview' }}</p><p>{{ 'Untouched left' || customer.title }}</p><custom saveButtonLabel="Save it" [cancelButtonLabel]="'Cancel it'"></custom><ng-select bindLabel="customerField"></ng-select>`,
		);
		const skipped = path.join(directory, 'unsupported.ts');
		const untouched =
			'@Component({imports:computeImports(),template:`<p>Keep unchanged</p>`}) class Three {}';
		fs.writeFileSync(skipped, untouched);
		const run = () =>
			spawnSync(
				process.execPath,
				[script, 'app/extensions', '--draft', 'draft.json', '--namespace', 'app.sdk', '--write'],
				{ cwd: root, encoding: 'utf8' },
			);
		const result = run();
		assert.equal(result.status, 0, result.stderr);
		const source = fs.readFileSync(component, 'utf8');
		assert.match(source, /from '\.\.\/webui-messages'/);
		assert.match(
			fs.readFileSync(path.join(directory, 'other.ts'), 'utf8'),
			/imports:\[WebUiMessagePipe\]/,
		);
		assert.doesNotMatch(source, /@maretha\/webui-sdk/);
		assert.equal(source.match(/NgTemplateOutlet, WebUiMessagePipe/g)?.length, 1);
		assert.equal(fs.readFileSync(skipped, 'utf8'), untouched);
		const messages = Object.values(
			JSON.parse(fs.readFileSync(path.join(root, 'draft.json'), 'utf8')),
		);
		for (const text of [
			'No items',
			'Waiting',
			'Loading',
			'Failed',
			'Cancel',
			'Case message',
			'Default message',
			'Literal branch',
			'Other branch',
			'Accessible branch',
			'Saving document…',
			'Preview',
			'Save it',
			'Cancel it',
		])
			assert.ok(messages.includes(text), text);
		const html = fs.readFileSync(path.join(directory, 'sample.html'), 'utf8');
		assert.match(html, /kind === 'technical'/);
		assert.match(html, /customer.title/);
		assert.match(html, /\('catalog.key' \| translate\)/);
		assert.ok(!messages.includes('s'));
		assert.ok(!messages.includes('technical'));
		assert.ok(!messages.includes('Untouched left'));
		assert.ok(!messages.includes('customerField'));
		assert.match(html, /status \|\|/);
		assert.match(html, /item.label \?\?/);
		assert.ok(!messages.includes('catalog.key'));
		assert.equal(run().status, 0);
		assert.equal(fs.readFileSync(component, 'utf8'), source);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
