import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { format, resolveConfig } from 'prettier';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
	options: {
		update: { type: 'boolean', default: false },
		catalog: { type: 'string', default: join(root, 'app/ui-catalog/ui-catalog.json') },
		baseline: { type: 'string', default: join(root, 'contracts/contribution-identities.json') },
	},
});
const catalog = JSON.parse(await readFile(resolve(values.catalog), 'utf8'));
if (catalog.format !== 'maretha.ui-contribution-catalog' || catalog.formatVersion !== 1)
	throw new Error('Expected the checked canonical UI contribution catalog.');
const keys = new Set();
const slots = catalog.slots
	.map((slot) => {
		if (keys.has(slot.name)) throw new Error(`Duplicate slot ${slot.name}`);
		keys.add(slot.name);
		const entries = new Set();
		return {
			name: slot.name,
			kind: slot.kind,
			context: slot.context,
			pairedWith: slot.pairedWith,
			contributions: slot.contributions
				.map((entry) => {
					if (entries.has(entry.id))
						throw new Error(`Duplicate contribution ${slot.name}/${entry.id}`);
					entries.add(entry.id);
					return {
						id: entry.id,
						extensionId: entry.extensionId,
						pairKey: entry.pairKey,
						pairedTargets: [...entry.pairedTargets].sort((a, b) =>
							`${a.slot}/${a.id}`.localeCompare(`${b.slot}/${b.id}`),
						),
					};
				})
				.sort((a, b) => a.id.localeCompare(b.id)),
		};
	})
	.sort((a, b) => a.name.localeCompare(b.name));
const baseline = resolve(values.baseline);
const report = await format(JSON.stringify({ format: 1, slots }), {
	...(await resolveConfig(baseline)),
	parser: 'json',
	filepath: baseline,
});
if (values.update) {
	await mkdir(dirname(baseline), { recursive: true });
	await writeFile(baseline, report);
	console.log(`Updated contribution identity baseline: ${baseline}`);
} else if ((await readFile(baseline, 'utf8')) !== report) {
	console.error(
		'Packaged slot/contribution identities changed. Renames, removals, owner changes and pairing changes require a compatibility review; additions must be recorded too.',
	);
	console.error('Review the catalog diff, then run node scripts/check-sdk-ids.mjs --update.');
	process.exitCode = 1;
} else console.log(`Contribution identities match ${baseline}`);
