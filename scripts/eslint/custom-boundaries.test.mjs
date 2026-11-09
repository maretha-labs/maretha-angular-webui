import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './custom-boundaries.cjs';

RuleTester.describe = describe;
RuleTester.it = it;

const root = mkdtempSync(path.join(tmpdir(), 'custom-boundaries-'));
for (const directory of ['app', 'custom', 'environments']) mkdirSync(path.join(root, directory));
after(() => rmSync(root, { recursive: true, force: true }));

const options = [{ root }];
const custom = path.join(root, 'custom', 'contributions', 'document-actions', 'probe.ts');
const core = path.join(root, 'app', 'probe.ts');
const main = path.join(root, 'main.ts');
const valid = (code, filename) => ({ code, filename, options });
const invalid = (code, filename, messageId) => ({
	code,
	filename,
	options,
	errors: [{ messageId }],
});

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run('custom-boundaries', rule, {
	valid: [
		valid("import { DOCUMENT_ACTIONS_SLOT } from '@maretha/webui-sdk';", custom),
		valid("import { Component } from '@angular/core';", custom),
		valid("import { TestBed } from '@angular/core/testing';", custom),
		valid("import { map } from 'rxjs/operators';", custom),
		valid("import { format } from 'date-fns';", custom),
		valid("import { BsModalRef } from 'ngx-bootstrap/modal';", custom),
		valid("import { shared } from '../shared';", custom),
		valid("export { provideCustomExtensions } from '../../index';", custom),
		valid("const load = () => import('./probe.component');", custom),
		valid("import { provideCustomExtensions } from './custom/index';", main),
		valid("import { provideCustomExtensions } from './custom';", main),
		valid("import { WebUiMessages } from 'app/extensions/webui-messages';", core),
		valid("import { BsModalRef } from 'ngx-bootstrap/modal';", core),
	],
	invalid: [
		invalid(
			"import { localizedText } from 'app/helpers/localized-message';",
			custom,
			'customImport',
		),
		invalid("import { x } from '../../../app/helpers/x';", custom, 'customImport'),
		invalid(
			"import { ExtensionRegistry } from '@maretha/webui-sdk/registry';",
			custom,
			'customImport',
		),
		invalid("export * from 'environments/environment';", custom, 'customImport'),
		invalid("const load = () => import('app/helpers/x');", custom, 'customImport'),
		invalid("type T = import('app/helpers/x').X;", custom, 'customImport'),
		invalid("import fs = require('app/helpers/x');", custom, 'customImport'),
		invalid("import { provideCustomExtensions } from '../custom/index';", core, 'coreImport'),
		invalid("import owner from 'custom/owner.json';", core, 'coreImport'),
		invalid("const load = () => import('../custom/contributions/x');", core, 'coreImport'),
		invalid("import { x } from './custom/contributions/x';", main, 'coreImport'),
	],
});
