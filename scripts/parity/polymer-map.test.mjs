import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { slotContexts, slotHosts } from './angular-slots.mjs';
import { inventory } from './polymer-slots.mjs';
import { providerReferences } from './render-parity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const slots = json('contracts/polymer-slots.json');
const map = json('contracts/polymer-contribution-map.json');
const identities = json('contracts/contribution-identities.json');
const provenance = json('app/extensions/polymer-assets.provenance.json');
const hostMap = json('contracts/polymer-slot-hosts.json');
const key = (entry) => `${entry.slot} ${entry.polymer ?? entry.name} ${entry.origin}`;

describe('Polymer contribution map', () => {
	it('pins the same Web UI revision as the SDK assets', () => {
		assert.equal(slots.revision, provenance.revisions.webui);
		assert.equal(map.polymerRevision, slots.revision);
	});

	it('maps every Polymer default contribution exactly once', () => {
		const expected = slots.contributions.map(key).sort();
		const actual = map.contributions.map(key).sort();
		assert.deepEqual(actual, expected);
		assert.equal(new Set(actual).size, actual.length);
	});

	it('targets existing Angular contributions in the same slot', () => {
		const ids = new Map(
			identities.slots.map((slot) => [slot.name, new Set(slot.contributions.map((c) => c.id))]),
		);
		for (const entry of map.contributions)
			for (const id of entry.angular)
				assert.ok(
					ids.get(entry.slot)?.has(id),
					`${key(entry)} → ${id} is not a ${entry.slot} default`,
				);
	});

	it('keeps statuses consistent', () => {
		for (const entry of map.contributions) {
			assert.ok(['mapped', 'gap', 'addon'].includes(entry.status), key(entry));
			assert.equal(entry.status === 'addon', entry.origin !== 'core', key(entry));
			assert.equal(entry.angular.length > 0, entry.status === 'mapped', key(entry));
			if (entry.status !== 'mapped') assert.ok(entry.note?.trim(), `${key(entry)} needs a note`);
		}
	});

	it('registers every Polymer per-type layout resource', () => {
		const source = readFileSync(
			path.join(root, 'app/modules/explorer/components/default-document-layouts.ts'),
			'utf8',
		);
		const manifest = [...source.matchAll(/'([a-z]+\/nuxeo-[a-z]+-[a-z]+-layout\.html)'/g)]
			.map((match) => `elements/document/${match[1]}`)
			.sort();
		assert.deepEqual(manifest, slots.layouts.map((layout) => layout.file).sort());
	});

	it('maps every Polymer search to existing Angular contributions', () => {
		assert.deepEqual(
			map.searches.map((entry) => entry.polymer),
			slots.searches.map((search) => search.name),
		);
		const ids = new Map(
			identities.slots.map((slot) => [slot.name, new Set(slot.contributions.map((c) => c.id))]),
		);
		for (const entry of map.searches) {
			assert.ok(['mapped', 'internal'].includes(entry.status), entry.polymer);
			assert.equal(entry.angular.length > 0, entry.status === 'mapped', entry.polymer);
			if (entry.status !== 'mapped') assert.ok(entry.note?.trim(), `${entry.polymer} needs a note`);
			for (const target of entry.angular)
				assert.ok(ids.get(target.slot)?.has(target.id), `${entry.polymer} → ${target.id}`);
		}
	});

	it('defaults every Polymer workflow task layout and theme', () => {
		const workflows = readFileSync(
			path.join(root, 'app/modules/explorer/components/workflows/default-workflow-layouts.ts'),
			'utf8',
		);
		const keys = new Set([...workflows.matchAll(/'(task[0-9a-f]+)'/g)].map((match) => match[1]));
		for (const layout of slots.workflowLayouts) assert.ok(keys.has(layout.task), layout.file);
		const themes = identities.slots.find((slot) => slot.name === 'THEMES');
		const themeIds = new Set(themes.contributions.map((entry) => entry.id));
		for (const theme of slots.themes)
			assert.ok(themeIds.has(`maretha.theme.${theme.name}`), theme.file);
	});

	it('gives every non-slot surface a status, Angular description and guidance', () => {
		for (const surface of map.surfaces) {
			assert.ok(['supported', 'server', 'waived'].includes(surface.status), surface.surface);
			assert.ok(surface.angular?.trim() && surface.guidance?.trim(), surface.surface);
			if (surface.inventory) assert.ok(Array.isArray(slots[surface.inventory]), surface.surface);
		}
		assert.deepEqual(map.surfaces.map((surface) => surface.inventory).filter(Boolean), [
			'searches',
			'workflowLayouts',
			'themes',
			'pageProviders',
		]);
	});

	it('counts a page provider name only as its own token', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'provider-references-'));
		try {
			const file = (name, text) => {
				writeFileSync(path.join(directory, name), text);
				return path.relative(root, path.join(directory, name));
			};
			const files = [
				file('query.ts', "const url = '/api/v1/search/pp/default_search/execute';"),
				file('label.ts', "const key = 'pageProviders.default_search.aggregations';"),
				file('longer.ts', "const name = 'default_search_extra';"),
			];
			assert.deepEqual(providerReferences('default_search', files), [files[0]]);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it('hosts the same slot names in Polymer and the SDK', () => {
		const polymer = new Set(slots.hosts.map((host) => host.slot));
		const sdk = identities.slots.map((slot) => slot.name);
		const angularOnly = sdk.filter((name) => !polymer.has(name)).sort();
		assert.deepEqual(angularOnly, ['QUICK_SEARCH_ACTIONS', 'SHELL_ACTIONS']);
		assert.deepEqual(
			[...polymer].filter((name) => !sdk.includes(name)),
			[],
		);
	});
});

describe('Polymer slot hosts and models', () => {
	const polymerSlots = new Set(slots.hosts.map((host) => host.slot));

	it('lists every SDK slot once, against the pinned inventory', () => {
		assert.equal(hostMap.polymerRevision, slots.revision);
		assert.deepEqual(
			hostMap.slots.map((entry) => entry.slot),
			identities.slots.map((slot) => slot.name),
		);
	});

	it('lists the Angular components that host each slot', () => {
		const hosts = slotHosts();
		for (const entry of hostMap.slots)
			assert.deepEqual(entry.hosts, hosts[entry.slot] ?? [], entry.slot);
	});

	it('describes each placement, with a note when it differs', () => {
		for (const entry of hostMap.slots) {
			assert.ok(['same', 'moved', 'partial', 'angular-only'].includes(entry.placement), entry.slot);
			assert.equal(entry.placement === 'angular-only', !polymerSlots.has(entry.slot), entry.slot);
			assert.equal(entry.polymer === null, entry.placement === 'angular-only', entry.slot);
			assert.ok(entry.angular?.trim(), entry.slot);
			if (!['same', 'angular-only'].includes(entry.placement))
				assert.ok(entry.note?.trim(), `${entry.slot} needs a note`);
		}
	});

	it('accounts for every Polymer model field once, shared model included', () => {
		for (const entry of hostMap.slots) {
			const fields = slots.hosts
				.filter((host) => host.slot === entry.slot)
				.flatMap((host) => host.fields);
			const shared = polymerSlots.has(entry.slot) ? slots.sharedModel.fields : [];
			assert.deepEqual(
				entry.fields.map((field) => field.polymer),
				[...new Set([...fields, ...shared])].sort(),
				entry.slot,
			);
		}
	});

	it('maps model fields to properties of the SDK context type', () => {
		const contexts = slotContexts();
		for (const entry of hostMap.slots)
			for (const field of entry.fields) {
				const key = `${entry.slot}.${field.polymer}`;
				assert.ok(['mapped', 'replaced', 'gap', 'dropped'].includes(field.status), key);
				assert.equal(field.angular?.length > 0, field.status === 'mapped', key);
				if (field.status !== 'mapped') assert.ok(field.note?.trim(), `${key} needs a note`);
				for (const name of field.angular ?? [])
					assert.ok(contexts[entry.slot].includes(name), `${key} → ${name} is not in the context`);
			}
	});
});

describe('angular-slots context reader', () => {
	it('reads inherited context properties by slot name', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'slot-contexts-'));
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
			assert.deepEqual(slotContexts(entry), {
				A: ['document', 'extra', 'noEdit'],
				B: ['document', 'noEdit'],
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

describe('polymer-slots extractor', () => {
	it('reads hosts, contributions, filters and add-on origin', () => {
		const source = mkdtempSync(path.join(tmpdir(), 'polymer-slots-'));
		try {
			mkdirSync(path.join(source, 'elements'));
			mkdirSync(path.join(source, 'addons', 'nuxeo-x'), { recursive: true });
			writeFileSync(
				path.join(source, 'elements', 'app.js'),
				`<nuxeo-slot name="DOCUMENT_ACTIONS" model="[[actionContext]]"></nuxeo-slot>
<nuxeo-slot-content name="editAction" slot="DOCUMENT_ACTIONS" order="10" disabled>
  <template>
    <nuxeo-filter document="[[document]]" type="File, Note" expression="!document.isVersion">
      <template><nuxeo-edit-button document="[[document]]"></nuxeo-edit-button></template>
    </nuxeo-filter>
  </template>
</nuxeo-slot-content>
<nuxeo-x-results id="results" action-context="{{resultsContext}}"></nuxeo-x-results>
<nuxeo-slot name="RESULTS_ACTIONS" model="[[resultsContext]]"></nuxeo-slot>
<nuxeo-slot name="THEMES"></nuxeo-slot>
actionContext: { type: Object, value() { return {}; }, computed: '_actionContext(document)' },
_actionContext() {
  return { document: this.document, label: 'a, b: c', nested: { inner: 1 }, clipboard };
},
window.nuxeo.slots.setSharedModel({ user: this.currentUser });`,
			);
			writeFileSync(
				path.join(source, 'elements', 'nuxeo-x-results.js'),
				`const actionContext = { selection: [], items: f(a, b) };
if (more) actionContext.columns = this.columns;`,
			);
			mkdirSync(path.join(source, 'elements', 'document', 'note'), { recursive: true });
			writeFileSync(
				path.join(source, 'elements', 'document', 'note', 'nuxeo-note-edit-layout.html'),
				'',
			);
			writeFileSync(
				path.join(source, 'addons', 'nuxeo-x', 'x.html'),
				`<nuxeo-slot-content name="xPage" slot="PAGES"><template><x-page></x-page></template></nuxeo-slot-content>
<nuxeo-page-provider provider="x_search"></nuxeo-page-provider>`,
			);
			mkdirSync(path.join(source, 'elements', 'search', 'expired'), { recursive: true });
			for (const kind of ['form', 'results'])
				writeFileSync(
					path.join(source, 'elements', 'search', 'expired', `nuxeo-expired-search-${kind}.html`),
					kind === 'form'
						? '<nuxeo-search-form provider="expired_search"></nuxeo-search-form>'
						: '',
				);
			mkdirSync(path.join(source, 'elements', 'workflow', 'review'), { recursive: true });
			writeFileSync(
				path.join(source, 'elements', 'workflow', 'review', 'nuxeo-task1a-layout.html'),
				'<nuxeo-data-list nx-provider="tasksProvider" provider="[[provider]]"></nuxeo-data-list>',
			);
			mkdirSync(path.join(source, 'themes', 'dark'), { recursive: true });
			mkdirSync(path.join(source, 'themes', 'notes'), { recursive: true });
			writeFileSync(path.join(source, 'themes', 'dark', 'theme.html'), '');
			assert.deepEqual(inventory(source), {
				sharedModel: { fields: ['user'], file: 'elements/app.js', line: 16 },
				hosts: [
					{
						slot: 'DOCUMENT_ACTIONS',
						model: '[[actionContext]]',
						fields: ['clipboard', 'document', 'label', 'nested'],
						file: 'elements/app.js',
						line: 1,
					},
					{
						slot: 'RESULTS_ACTIONS',
						model: '[[resultsContext]]',
						fields: ['columns', 'items', 'selection'],
						file: 'elements/app.js',
						line: 10,
					},
					{ slot: 'THEMES', model: null, fields: [], file: 'elements/app.js', line: 11 },
				],
				contributions: [
					{
						slot: 'DOCUMENT_ACTIONS',
						name: 'editAction',
						order: 10,
						disabled: true,
						filter: { type: 'File, Note', expression: '!document.isVersion' },
						element: 'nuxeo-edit-button',
						origin: 'core',
						file: 'elements/app.js',
						line: 2,
					},
					{
						slot: 'PAGES',
						name: 'xPage',
						order: null,
						filter: {},
						element: 'x-page',
						origin: 'nuxeo-x',
						file: 'addons/nuxeo-x/x.html',
						line: 1,
					},
				],
				layouts: [
					{
						type: 'note',
						mode: 'edit',
						file: 'elements/document/note/nuxeo-note-edit-layout.html',
					},
				],
				searches: [
					{
						name: 'expired',
						form: 'elements/search/expired/nuxeo-expired-search-form.html',
						results: 'elements/search/expired/nuxeo-expired-search-results.html',
					},
				],
				workflowLayouts: [
					{
						model: 'review',
						task: 'task1a',
						file: 'elements/workflow/review/nuxeo-task1a-layout.html',
					},
				],
				themes: [{ name: 'dark', file: 'themes/dark/theme.html' }],
				pageProviders: [
					{
						name: 'expired_search',
						origins: ['core'],
						files: ['elements/search/expired/nuxeo-expired-search-form.html'],
					},
					{ name: 'x_search', origins: ['nuxeo-x'], files: ['addons/nuxeo-x/x.html'] },
				],
			});
			writeFileSync(
				path.join(source, 'elements', 'unbound.js'),
				'<nuxeo-slot name="PAGES" model="[[pageContext]]"></nuxeo-slot>',
			);
			assert.throws(() => inventory(source), /unbound\.js: cannot resolve the fields of/);
		} finally {
			rmSync(source, { recursive: true, force: true });
		}
	});
});
