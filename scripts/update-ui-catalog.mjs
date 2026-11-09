/**
 * Refresh contribution defaults from the actual application providers:
 *   node scripts/update-ui-catalog.mjs
 * Then rerun the focused catalog test and review the metadata diff.
 * Slot context/kind and behavior descriptions remain source-reviewed metadata;
 * new slots require a catalog entry before this command can include their rows.
 * The unit test does not execute availability conditions or load components.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const result = spawnSync(
	process.execPath,
	[
		join(root, 'node_modules/@angular/cli/bin/ng.js'),
		'test',
		'--watch=false',
		'--browsers=ChromeHeadless',
		'--include=app/ui-catalog/ui-catalog.spec.ts',
		'--progress=false',
	],
	{
		cwd: root,
		env: { ...process.env, MARETHA_CAPTURE_UI_CATALOG: '1' },
		encoding: 'utf8',
		maxBuffer: 20 * 1024 * 1024,
	},
);
const output = (result.stdout ?? '') + (result.stderr ?? '');
// Karma's configured reporters may repeat the same console event.
const captures = [
	...new Set(
		[...output.matchAll(/CATALOG_SNAPSHOT_BASE64:([A-Za-z0-9+/=]+)/g)].map((match) => match[1]),
	),
];
if (result.error || captures.length !== 1) {
	process.stderr.write(output);
	throw new Error('The registry unit test did not produce one complete catalog snapshot.', {
		cause: result.error,
	});
}
const { rows, visibilityRules } = JSON.parse(Buffer.from(captures[0], 'base64').toString('utf8'));
const path = join(root, 'app/ui-catalog/ui-catalog.json');
const catalog = JSON.parse(await readFile(path, 'utf8'));
catalog.visibilityRules = visibilityRules;
const knownSlots = new Set(catalog.slots.map((slot) => slot.name));
for (const row of rows) {
	if (!knownSlots.has(row.slot))
		throw new Error(`Document the new slot ${row.slot} in catalog.json before refreshing.`);
}
for (const slot of catalog.slots) {
	slot.contributions = rows
		.filter((row) => row.slot === slot.name)
		.map(({ slot: _slot, ...row }) => row);
}
await writeFile(
	path,
	await format(JSON.stringify(catalog), { ...(await resolveConfig(path)), filepath: path }),
);
console.log(
	`Updated ${rows.length} contributions across ${catalog.slots.length} slots. Run the focused catalog tests to check the refreshed file and documentation.`,
);
if (result.status !== 0)
	console.log(
		'The capture run reported test failures against the previous catalog; refresh does not mark those checks as passed.',
	);
