// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettier = require('eslint-config-prettier/flat');
const fs = require('node:fs');
const path = require('node:path');
const customBoundaries = require('./scripts/eslint/custom-boundaries.cjs');
const noCredentialDefault = require('./scripts/eslint/no-credential-default.cjs');

// One plugin object: flat config rejects a plugin name bound to two different objects.
const maretha = {
	rules: { 'custom-boundaries': customBoundaries, 'no-credential-default': noCredentialDefault },
};

// custom/ selectors use the owner's prefix, so customer elements never collide with core nx- ones.
const ownerPrefix = JSON.parse(
	fs.readFileSync(path.join(__dirname, 'custom', 'owner.json'), 'utf8'),
).prefix;

module.exports = defineConfig([
	{
		ignores: [
			'dist/**',
			'coverage/**',
			'out-tsc/**',
			'.angular/**',
			'**/node_modules/**',
			'local/**',
			'graft/**',
			// Linted as custom/ (owner prefix acme) by npm run verify:examples, not as core.
			'examples/acme/**',
		],
	},
	{
		files: ['**/*.ts'],
		extends: [
			eslint.configs.recommended,
			tseslint.configs.recommended,
			tseslint.configs.stylistic,
			angular.configs.tsRecommended,
			prettier,
		],
		processor: angular.processInlineTemplates,
		rules: {
			'@angular-eslint/directive-selector': [
				'error',
				{ type: 'attribute', prefix: 'nx', style: 'camelCase' },
			],
			'@angular-eslint/component-selector': [
				'error',
				{ type: 'element', prefix: 'nx', style: 'kebab-case' },
			],
			// Deferred rule disables (each pinned to a planned story):
			//   no-explicit-any → re-enable once NuxeoClient (S1-21) lands a typed API surface
			//   prefer-inject  → dedicated constructor-injection→inject() migration story (post-Sprint-1)
			'@typescript-eslint/no-explicit-any': 'off',
			'@angular-eslint/prefer-inject': 'off',
			// Empty constructors are the Angular DI pattern (parameter properties);
			// empty lifecycle methods are caught by @angular-eslint/no-empty-lifecycle-method.
			'@typescript-eslint/no-empty-function': ['error', { allow: ['constructors'] }],
			// Allow underscore-prefix opt-out for intentionally unused vars/args/catch-bindings.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
			// Deferred to a dedicated output-rename pass (post-Sprint-1): the seed
			// emits `close`/`save`/`update`/`error`/`progress` outputs whose template
			// bindings (`(close)=`, `(save)=`, etc.) are wired across many call sites.
			// Renaming requires a sweep of templates + components together.
			'@angular-eslint/no-output-native': 'off',
			// The spreadsheet editor is AG Grid Community (MIT) only; Enterprise is commercially licensed.
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['ag-grid-enterprise', '@ag-grid-enterprise/*', 'ag-charts-enterprise'],
							message: 'Use AG Grid Community packages only; Enterprise is commercially licensed.',
						},
					],
				},
			],
		},
	},
	{
		files: ['**/*.ts'],
		plugins: { maretha },
		rules: { 'maretha/custom-boundaries': 'error', 'maretha/no-credential-default': 'error' },
	},
	{
		// Scripts, browser checks and the contribution gate are JavaScript modules; only the
		// credential rule applies.
		files: ['scripts/**/*.{mjs,cjs}', 'e2e/**/*.mjs', '.github/**/*.mjs'],
		plugins: { maretha },
		rules: { 'maretha/no-credential-default': 'error' },
	},
	{
		files: ['custom/**/*.ts'],
		rules: {
			'@angular-eslint/directive-selector': [
				'error',
				{
					type: 'attribute',
					prefix: ownerPrefix.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase()),
					style: 'camelCase',
				},
			],
			'@angular-eslint/component-selector': [
				'error',
				{ type: 'element', prefix: ownerPrefix, style: 'kebab-case' },
			],
		},
	},
	{
		// Customer code cannot switch rules off: inline eslint comments are ignored and reported.
		files: ['custom/**'],
		linterOptions: { noInlineConfig: true },
	},
	{
		files: ['**/*.html'],
		extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
		rules: {
			// Keep these explicit so the audited accessibility baseline remains enforced.
			'@angular-eslint/template/label-has-associated-control': 'error',
			'@angular-eslint/template/interactive-supports-focus': 'error',
			'@angular-eslint/template/click-events-have-key-events': 'error',
			'@angular-eslint/template/role-has-required-aria': 'error',
			'@angular-eslint/template/alt-text': 'error',
		},
	},
]);
