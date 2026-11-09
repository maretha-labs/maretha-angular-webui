import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	anchor,
	catalogProblems,
	DOCUMENT,
	FAMILIES,
	load,
	readSlots,
	render,
	SECTIONS,
} from './slot-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('readSlots', () => {
	it('reads the constant, the guarded type and its inherited properties by slot name', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'slot-catalog-'));
		try {
			const entry = path.join(directory, 'index.ts');
			writeFileSync(
				entry,
				`interface Base { readonly document: unknown; readonly noEdit?: boolean }
interface Extra extends Base { readonly extra: number }
function defineSlot<C>(name: string, isContext: (value: unknown) => value is C) {
	return { name, isContext };
}
const NAMES = { B: 'B' } as const;
export const A_SLOT = defineSlot<Extra>('A', (value): value is Extra => !!value);
export const B_SLOT = defineSlot(NAMES.B, (value): value is Base => !!value);
export const NOT_A_SLOT_NAME = 'C';`,
			);
			const slots = readSlots(entry);
			assert.deepEqual(Object.keys(slots), ['A', 'B']);
			assert.equal(slots.A.constant, 'A_SLOT');
			assert.equal(slots.A.guard, 'Extra');
			assert.deepEqual(slots.A.properties, ['document', 'extra', 'noEdit']);
			assert.deepEqual(slots.B.properties, ['document', 'noEdit']);
			assert.ok(slots.B.file.endsWith('index.ts'));
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

describe('anchor', () => {
	it('matches the heading ids GitHub renders', () => {
		assert.equal(anchor('Results, creation and attachments'), 'results-creation-and-attachments');
		assert.equal(anchor('Global Quick Search'), 'global-quick-search');
	});
});

describe('slot catalog', () => {
	let data;
	before(() => {
		data = load();
	});

	it('agrees with the SDK, the generator, the contracts and the SDK README', () => {
		assert.deepEqual(catalogProblems(data), []);
		assert.equal(Object.keys(data.sdk).length, 26);
		assert.deepEqual(Object.keys(SECTIONS).sort(), Object.keys(data.sdk).sort());
		assert.deepEqual(
			[...new Set(Object.values(data.generator).map((slot) => slot.family))].sort(),
			Object.keys(FAMILIES).sort(),
		);
	});

	it('is the committed document', async () => {
		assert.equal(
			readFileSync(path.join(root, DOCUMENT), 'utf8'),
			await render(data),
			`${DOCUMENT} is stale; run npm run render:slot-catalog.`,
		);
	});

	it('names every slot, its generator command and every default id', async () => {
		const text = await render(data);
		for (const slot of data.identities) {
			assert.ok(text.includes(`\n### ${slot.name}\n`), slot.name);
			assert.ok(
				text.includes(`npm run new:contribution -- --slot ${slot.name} --id <prefix>.<name>`),
				`${slot.name} command`,
			);
			for (const entry of slot.contributions)
				assert.ok(text.includes(`\`${entry.id}\``), `${slot.name} default ${entry.id}`);
			for (const property of data.sdk[slot.name].properties)
				assert.ok(text.includes(`\`${property}\``), `${slot.name} property ${property}`);
		}
	});

	it('reports a slot renamed in the SDK, a slot the generator lacks and a context mismatch', () => {
		const { DOCUMENT_ACTIONS, ...rest } = data.sdk;
		const renamed = catalogProblems({
			...data,
			sdk: { ...rest, DOCUMENT_COMMANDS: DOCUMENT_ACTIONS },
		});
		assert.match(renamed.join('\n'), /contribution-identities\.json lists .*DOCUMENT_ACTIONS/);
		assert.match(renamed.join('\n'), /DOCUMENT_COMMANDS is exported as DOCUMENT_ACTIONS_SLOT/);
		assert.match(renamed.join('\n'), /DOCUMENT_COMMANDS has no SDK README section/);

		const { BLOB_ACTIONS, ...generator } = data.generator;
		const lacking = catalogProblems({ ...data, generator }).find((problem) =>
			problem.startsWith('scripts/custom/new-contribution.mjs SLOTS lists'),
		);
		assert.ok(lacking && !lacking.split(';')[0].includes('BLOB_ACTIONS'), lacking);
		assert.match(
			catalogProblems({
				...data,
				generator: { ...data.generator, BLOB_ACTIONS: { ...BLOB_ACTIONS, context: 'FileContext' } },
			}).join('\n'),
			/BLOB_ACTIONS: the generator types the context as FileContext/,
		);
		assert.match(
			catalogProblems({
				...data,
				readme: data.readme.replace('## Account menu', '## Account'),
			}).join('\n'),
			/has no "Account menu" heading for USER_MENU/,
		);
	});
});
