import { describe, it } from 'node:test';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-credential-default.cjs';

RuleTester.describe = describe;
RuleTester.it = it;

const fallback = (code, name = 'NUXEO_PASSWORD') => ({
	code,
	errors: [{ messageId: 'fallback', data: { name } }],
});

const cases = {
	valid: [
		"const password = process.env['NUXEO_PASSWORD'];",
		"const password = process.env.NUXEO_PASSWORD ?? '';",
		'const password = process.env.NUXEO_PASSWORD || ``;',
		"const port = process.env.MARETHA_KARMA_PORT || '9888';",
		"const phase = process.env['PARITY_BROWSE_PHASE'] ?? 'after';",
		"const owner = process.env.USER ?? 'unknown';",
		"const label = process.env.NUXEO_AUTH ? 'Bearer' : 'Basic';",
		'const user = process.env.NUXEO_USER ?? process.env.NUXEO_USERNAME;',
		"const password = options.password ?? 'Administrator';",
		"let fallback = 'Administrator'; const user = process.env.NUXEO_USER ?? fallback;",
		"const { NUXEO_E2E_BASE_URL = 'http://localhost:8080' } = process.env;",
		"const { NUXEO_PASSWORD = 'Administrator' } = settings;",
		"// process.env.NUXEO_PASSWORD ?? 'Administrator'\nconst x = 1;",
		'const help = "set NUXEO_PASSWORD, never process.env.NUXEO_PASSWORD ?? \'x\'";',
	],
	invalid: [
		fallback("const password = process.env['NUXEO_PASSWORD'] ?? 'Administrator';"),
		fallback("const password = process.env.NUXEO_PASSWORD || 'Administrator';"),
		fallback('const password = process.env.NUXEO_PASSWORD ?? `Administrator`;'),
		fallback("process.env.NUXEO_PASSWORD ??= 'Administrator';"),
		fallback("process.env.NUXEO_PASSWORD ||= 'Administrator';"),
		fallback(
			"const password = process.env.NUXEO_PASSWORD ? process.env.NUXEO_PASSWORD : 'Administrator';",
		),
		fallback(
			"const password = !process.env.NUXEO_PASSWORD ? 'Administrator' : process.env.NUXEO_PASSWORD;",
		),
		fallback("const { NUXEO_PASSWORD = 'Administrator' } = process.env;"),
		fallback("const { NUXEO_PASSWORD: password = 'Administrator' } = process.env;"),
		fallback("function login({ NUXEO_PASSWORD = 'Administrator' } = process.env) {}"),
		fallback(
			"const DEFAULT = 'Administrator'; const password = process.env.NUXEO_PASSWORD ?? DEFAULT;",
		),
		fallback(
			"const DEFAULT = 'Administrator'; const ALIAS = DEFAULT; const user = process.env.NUXEO_USER ?? ALIAS;",
			'NUXEO_USER',
		),
		fallback(
			"const user = process.env.NUXEO_USER ?? process.env.NUXEO_LOGIN ?? 'Administrator';",
			'NUXEO_USER',
		),
		fallback("const auth = process.env.NUXEO_AUTH ?? 'Administrator:Administrator';", 'NUXEO_AUTH'),
		fallback("const token = process.env.GITHUB_TOKEN || 'ghp_example';", 'GITHUB_TOKEN'),
		fallback("const key = process.env.SEARCH_API_KEY ?? 'demo';", 'SEARCH_API_KEY'),
		fallback("const user = process.env?.NUXEO_USER ?? 'Administrator';", 'NUXEO_USER'),
	],
};

new RuleTester().run('no-credential-default (JavaScript)', rule, cases);

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run(
	'no-credential-default (TypeScript)',
	rule,
	{
		valid: ["const password: string = process.env['NUXEO_PASSWORD']!;"],
		invalid: [
			fallback("const password = process.env['NUXEO_PASSWORD']! ?? 'Administrator';"),
			fallback("const password = (process.env.NUXEO_PASSWORD as string) || 'Administrator';"),
			fallback(
				"const DEFAULT = 'Administrator' as const; const password = process.env.NUXEO_PASSWORD ?? DEFAULT;",
			),
		],
	},
);
