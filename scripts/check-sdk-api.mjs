import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import ts from 'typescript';
import { format, resolveConfig } from 'prettier';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
	options: {
		update: { type: 'boolean', default: false },
		'sdk-dir': { type: 'string', default: join(root, 'dist/webui-sdk') },
		report: { type: 'string', default: join(root, 'contracts/webui-sdk.api.md') },
	},
});
const sdkDirectory = resolve(values['sdk-dir']);
const reportPath = resolve(values.report);
const sdk = JSON.parse(await readFile(join(sdkDirectory, 'package.json'), 'utf8'));
const entry = sdk.exports?.['.']?.types ?? sdk.typings;
if (sdk.name !== '@maretha/webui-sdk' || typeof entry !== 'string')
	throw new Error('Build the public @maretha/webui-sdk package before checking its API.');
const source = ts.createSourceFile(
	entry,
	await readFile(resolve(sdkDirectory, entry), 'utf8'),
	ts.ScriptTarget.Latest,
	true,
	ts.ScriptKind.TS,
);
if (source.parseDiagnostics.length) throw new Error('The SDK declaration entrypoint is invalid.');
function checkPortableImports(node) {
	const specifier =
		ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
			? node.moduleSpecifier
			: ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
				? node.argument.literal
				: ts.isExternalModuleReference(node)
					? node.expression
					: undefined;
	if (
		specifier &&
		ts.isStringLiteralLike(specifier) &&
		/^(?:\.\/)?node_modules[\\/]/.test(specifier.text)
	)
		throw new Error(`SDK declaration import is not portable: ${specifier.text}`);
	ts.forEachChild(node, checkPortableImports);
}
checkPortableImports(source);
const printer = ts.createPrinter({ removeComments: true });
// The declaration bundler emits union members in an order that changes between builds; the
// report records every union sorted so only a real API change moves it.
const sortUnions = (context) => {
	const visit = (node) => {
		const visited = ts.visitEachChild(node, visit, context);
		if (!ts.isUnionTypeNode(visited)) return visited;
		const text = (member) => printer.printNode(ts.EmitHint.Unspecified, member, source);
		const sorted = [...visited.types].sort((a, b) => text(a).localeCompare(text(b), 'en-US'));
		return ts.factory.updateUnionTypeNode(visited, ts.factory.createNodeArray(sorted));
	};
	return (file) => ts.visitNode(file, visit);
};
const declarations = printer.printFile(ts.transform(source, [sortUnions]).transformed[0]);
const packageContract = Object.fromEntries(
	['name', 'exports', 'peerDependencies'].map((key) => [key, sdk[key]]),
);
const report = await format(
	`# WebUI SDK public API\n\nReview changes to this report before updating it. Generated from the built package, including types referenced by its public entrypoint and Angular component metadata.\n\n## Package entrypoints and peers\n\n\`\`\`json\n${JSON.stringify(packageContract, null, 2)}\n\`\`\`\n\n## TypeScript declarations\n\n\`\`\`typescript\n${declarations}\n\`\`\`\n`,
	{ ...(await resolveConfig(reportPath)), parser: 'markdown', filepath: reportPath },
);
if (values.update) {
	await mkdir(dirname(reportPath), { recursive: true });
	await writeFile(reportPath, report);
	console.log(`Updated SDK API report: ${reportPath}`);
} else {
	const expected = await readFile(reportPath, 'utf8');
	if (expected !== report) {
		const expectedLines = expected.split('\n');
		const actualLines = report.split('\n');
		const line = actualLines.findIndex((value, index) => value !== expectedLines[index]);
		console.error(
			`SDK public API changed at report line ${line < 0 ? actualLines.length + 1 : line + 1}.`,
		);
		console.error(
			'Review the declaration/package changes, then run node scripts/check-sdk-api.mjs --update.',
		);
		process.exitCode = 1;
	} else console.log(`SDK public API matches ${reportPath}`);
}
