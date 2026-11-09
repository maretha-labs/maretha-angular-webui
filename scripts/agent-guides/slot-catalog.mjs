#!/usr/bin/env node
// Renders agent-guides/02-slot-catalog.md: every SDK slot with the context type a contribution
// receives and its properties (read from app/extensions/index.ts with the TypeScript checker),
// where it renders, the command that generates a contribution for it, the default contribution
// ids and the Polymer defaults mapped to it. The sources are the SDK entry point, the generator's
// slot table and the contracts; `--check` fails when they disagree about the slot list or when
// the committed catalog differs from the rendering.
//
//   npm run render:slot-catalog
//   npm run verify:slot-catalog
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import ts from 'typescript';
import { SLOTS } from '../custom/new-contribution.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DOCUMENT = 'agent-guides/02-slot-catalog.md';
export const SDK_ENTRY = 'app/extensions/index.ts';
export const SDK_README = 'app/extensions/README.md';
export const PARITY = 'docs/polymer-parity.md';

/** The SDK README section that documents each slot; the check requires the heading to exist. */
export const SECTIONS = Object.freeze({
	ADMINISTRATION_MENU: 'Paired publishing and administration pages',
	ADMINISTRATION_PAGES: 'Paired publishing and administration pages',
	ANALYTICS_ITEMS: 'Paired publishing and administration pages',
	ANALYTICS_PAGES: 'Paired publishing and administration pages',
	BLOB_ACTIONS: 'Results, creation and attachments',
	COLLECTION_ACTIONS: 'Results, creation and attachments',
	CREATE_POPUP_ITEMS: 'Results, creation and attachments',
	CREATE_POPUP_PAGES: 'Results, creation and attachments',
	DOCUMENT_ACTIONS: 'Document notices and commands',
	DOCUMENT_CREATE_ACTIONS: 'Results, creation and attachments',
	DOCUMENT_INFO_BAR: 'Document notices and commands',
	DOCUMENT_VIEWS_ITEMS: 'Paired document views',
	DOCUMENT_VIEWS_PAGES: 'Paired document views',
	DRAWER_ITEMS: 'Drawer contributions',
	DRAWER_PAGES: 'Drawer contributions',
	FILE_UPLOAD_ACTIONS: 'Results, creation and attachments',
	PAGES: 'Repository navigation and search defaults',
	PUBLISH_ITEMS: 'Paired publishing and administration pages',
	PUBLISH_PAGES: 'Paired publishing and administration pages',
	QUICK_SEARCH_ACTIONS: 'Global Quick Search',
	RESULTS_ACTIONS: 'Results, creation and attachments',
	RESULTS_SELECTION_ACTIONS: 'Results, creation and attachments',
	SHELL_ACTIONS: 'Global Quick Search',
	THEMES: 'Theme selection',
	TRASH_RESULTS_SELECTION_ACTIONS: 'Complete query exports',
	USER_MENU: 'Account menu',
});

/** What `npm run new:contribution` registers for each generator family. */
export const FAMILIES = Object.freeze({
	single:
		'one `defineContribution(<SLOT>_SLOT, { id, order, loadComponent })` entry; the component is an action button, or a status notice for `DOCUMENT_INFO_BAR`',
	page: 'one `definePage({ id, pageId, loadComponent })` entry; the page is routed at `/page/<pageId>`',
	drawer:
		'two `defineContribution` entries sharing one `pairKey`: a `DrawerItemComponent` item in `DRAWER_ITEMS` and a lazy page in `DRAWER_PAGES`',
	'document-view':
		'`...defineDocumentView({ id, viewId, label, order, loadComponent })`: a tab in `DOCUMENT_VIEWS_ITEMS` and its page in `DOCUMENT_VIEWS_PAGES`',
	paired:
		'`...definePairedView({ items, pages }, { id, viewId, label, order, loadComponent })`: an item and its page, one in each slot of the pair; either slot name generates both halves',
	theme: 'one `defineWebUiTheme({ id, label, order, tokens })` entry; no component',
});

const code = (value) => `\`${value}\``;
const cell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** GitHub's heading anchor: lowercase, punctuation dropped, spaces to hyphens. */
export const anchor = (heading) =>
	heading
		.toLowerCase()
		.replace(/[^\w\- ]/g, '')
		.replaceAll(' ', '-');
const json = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));

/**
 * Reads each exported *_SLOT definition of the SDK entry point with the TypeScript checker:
 * the slot name, the exported constant, the type its context guard narrows to, that type's
 * property names (inherited ones included) and the file that declares the slot.
 */
export function readSlots(entry = path.join(root, SDK_ENTRY)) {
	const program = ts.createProgram([entry], {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ES2022,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		experimentalDecorators: true,
		skipLibCheck: true,
		noEmit: true,
		strict: true,
	});
	const checker = program.getTypeChecker();
	const module = checker.getSymbolAtLocation(program.getSourceFile(entry));
	const slots = {};
	for (const exported of checker.getExportsOfModule(module)) {
		if (!exported.name.endsWith('_SLOT')) continue;
		const symbol =
			exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
		const declaration = symbol.valueDeclaration;
		const slot = checker.getTypeOfSymbolAtLocation(symbol, declaration);
		const name = declaration.initializer?.arguments?.[0];
		const isContext = checker.getTypeOfSymbolAtLocation(slot.getProperty('isContext'), declaration);
		const predicate = checker.getTypePredicateOfSignature(isContext.getCallSignatures()[0]);
		const key = ts.isStringLiteral(name) ? name.text : name.name.text;
		slots[key] = {
			constant: exported.name,
			guard: checker.typeToString(predicate.type),
			properties: checker
				.getPropertiesOfType(predicate.type)
				.map((property) => property.name)
				.sort(),
			file: path.relative(root, declaration.getSourceFile().fileName).split(path.sep).join('/'),
		};
	}
	return slots;
}

/** Everything the catalog is rendered from. */
export function load() {
	return {
		sdk: readSlots(),
		generator: SLOTS,
		identities: json('contracts/contribution-identities.json').slots,
		hosts: json('contracts/polymer-slot-hosts.json').slots,
		polymer: json('contracts/polymer-slots.json'),
		map: json('contracts/polymer-contribution-map.json').contributions,
		readme: readFileSync(path.join(root, SDK_README), 'utf8'),
		sdkVersion: json('app/extensions/package.json').version,
	};
}

/** Where the SDK, the generator, the contracts and the SDK README disagree about the slots. */
export function catalogProblems({ sdk, generator, identities, hosts, readme }) {
	const problems = [];
	const names = Object.keys(sdk).sort();
	const compare = (source, other) => {
		const listed = [...other].sort();
		if (listed.join(',') !== names.join(','))
			problems.push(
				`${source} lists ${listed.join(', ') || 'no slots'}; ${SDK_ENTRY} exports ${names.join(', ')}.`,
			);
	};
	compare('scripts/custom/new-contribution.mjs SLOTS', Object.keys(generator));
	compare(
		'contracts/contribution-identities.json',
		identities.map((slot) => slot.name),
	);
	compare(
		'contracts/polymer-slot-hosts.json',
		hosts.map((slot) => slot.slot),
	);
	for (const name of names) {
		if (sdk[name].constant !== `${name}_SLOT`)
			problems.push(`${name} is exported as ${sdk[name].constant}, expected ${name}_SLOT.`);
		const identity = identities.find((slot) => slot.name === name);
		const family = generator[name];
		if (identity && family?.context && family.context !== identity.context)
			problems.push(
				`${name}: the generator types the context as ${family.context}; contracts/contribution-identities.json names ${identity.context}.`,
			);
		const section = SECTIONS[name];
		if (!section) problems.push(`${name} has no SDK README section in SECTIONS.`);
		else if (!new RegExp(`^#{2,3} ${escape(section)}$`, 'm').test(readme))
			problems.push(`${SDK_README} has no "${section}" heading for ${name}.`);
	}
	return problems;
}

export async function render(data = load()) {
	const { sdk, generator, identities, hosts, polymer, map, readme, sdkVersion } = data;
	const ordered = identities.map((slot) => slot.name);
	const parityHeadings = new Set(
		[...readFileSync(path.join(root, PARITY), 'utf8').matchAll(/^### ([A-Z_]+)$/gm)].map(
			(match) => match[1],
		),
	);
	const sdkLink = (name) => `[${SECTIONS[name]}](../${SDK_README}#${anchor(SECTIONS[name])})`;
	const generatorCommand = (name) =>
		`npm run new:contribution -- --slot ${name} --id <prefix>.<name>`;
	const lines = [
		'# Slot catalog',
		'',
		`<!-- Generated by scripts/agent-guides/slot-catalog.mjs from ${SDK_ENTRY}, scripts/custom/new-contribution.mjs and the contracts; edit those, then run npm run render:slot-catalog. -->`,
		'',
		`Every slot of \`@maretha/webui-sdk\` ${sdkVersion} (${ordered.length}): the context a contribution receives, where it renders, the command that generates a contribution for it, and the default contribution ids you can disable, reorder or replace with an override. \`<prefix>\` is the owner prefix in \`custom/owner.json\`; \`<name>\` is the rest of the contribution id, dot-separated lowercase (\`contract.approve\`).`,
		'',
		'How to use it:',
		'',
		'1. Pick the slot from where the change belongs in the UI (the summary table and each "Renders" line).',
		"2. Run the slot's generator command. It writes the component, its spec and the registration in `custom/index.ts`.",
		"3. Edit the generated component. Its `context` input has the slot's context type; the properties are listed below. Read `this.context()` and never mutate it.",
		'4. To hide, move or replace a default, name its id from the "Defaults" line in an override (`{ slot, id, disabled | order }`) or register your own contribution with the same slot and id.',
		'5. `npm run verify`.',
		'',
		`The SDK reference for each slot is linked; the Polymer defaults it replaces are in [${PARITY}](../${PARITY}).`,
		'',
		'## Summary',
		'',
		'| Slot | Kind | Context | Paired with | Generator family | Defaults |',
		'| --- | --- | --- | --- | --- | --- |',
	];
	for (const slot of identities) {
		lines.push(
			`| ${code(slot.name)} | ${slot.kind} | ${code(slot.context)} | ${slot.pairedWith ? code(slot.pairedWith) : '–'} | ${generator[slot.name].family} | ${slot.contributions.length} |`,
		);
	}
	lines.push(
		'',
		'## Generator families',
		'',
		'What `npm run new:contribution` registers in `custom/index.ts` for a slot of each family:',
		'',
		...Object.entries(FAMILIES).map(([family, text]) => `- **${family}**: ${text}`),
		'',
		'Every generated component declares `readonly context = input.required<Context>()` and loads lazily; the generated spec renders it once with an empty context. Document layouts (`create`, `edit`, `view`, `metadata`, `import`) are not slot contributions: `npm run new:layout -- --type <Type> --modes view,edit` (see Not slots).',
		'',
		'## Slots',
	);
	for (const slot of identities) {
		const name = slot.name;
		const source = sdk[name];
		const host = hosts.find((entry) => entry.slot === name);
		const family = generator[name];
		const entries = map.filter((entry) => entry.slot === name);
		const count = (status) => entries.filter((entry) => entry.status === status).length;
		const polymerHosts = polymer.hosts.filter((entry) => entry.slot === name).length;
		const placement =
			host.placement === 'angular-only'
				? 'Angular only, no Polymer host'
				: host.placement === 'same'
					? `same place as Polymer's ${cell(host.polymer)}`
					: `${host.placement} from Polymer's ${cell(host.polymer)}: ${cell(host.note ?? '')}`;
		lines.push(
			'',
			`### ${name}`,
			'',
			`- SDK: ${code(source.constant)} in ${code(source.file)}; kind ${slot.kind}; context ${code(slot.context)}${slot.pairedWith ? `; paired with ${code(slot.pairedWith)}` : ''}.`,
			`- Context properties: ${source.properties.map(code).join(', ')}.`,
			`- Renders: ${cell(host.angular)} (${placement}). Hosts: ${host.hosts.map((file) => code(path.basename(file, '.ts'))).join(', ')}.`,
			`- Generate: ${code(generatorCommand(name))} (${family.family} family${family.family === 'paired' ? `, writes ${code(family.items)} and ${code(family.pages)}` : ''}).`,
			`- Defaults (${slot.contributions.length}): ${slot.contributions.map((entry) => code(entry.id)).join(', ') || 'none'}.`,
			polymerHosts
				? `- Polymer: ${entries.length} default contributions in ${polymerHosts} host${polymerHosts === 1 ? '' : 's'}; ${count('mapped')} mapped, ${count('gap')} gaps, ${count('addon')} from add-ons${parityHeadings.has(name) ? ` ([parity](../${PARITY}#${name.toLowerCase()}))` : ''}.`
				: '- Polymer: none; this slot exists only in the Angular UI.',
			`- Reference: ${sdkLink(name)}.`,
		);
	}
	const section = (heading) => `[${heading}](../${SDK_README}#${anchor(heading)})`;
	lines.push(
		'',
		'## Not slots',
		'',
		'Customizations that register through another SDK API:',
		'',
		`- **Document layouts** for a type's create, edit, view, metadata and import forms: \`npm run new:layout -- --type <Type> --modes create,edit,view,metadata,import\`. ${section('Schema-bound scalar layouts')}, ${section('Custom extensions')}.`,
		`- **Result cards and cells** (list and grid cards per document type, table cells): \`provideResultsProjections()\`. ${section('Result projections')}.`,
		`- **Visibility**: \`when\` predicates, \`nuxeoFilter()\` for Polymer filter semantics, named visibility rules for overrides. ${section('Polymer filters')}, ${section('Named visibility rules')}.`,
		`- **Labels and icons**: \`provideWebUiMessages()\`, \`provideWebUiIcons()\`. ${section('Icons, labels and theme source catalogs')}.`,
		`- **Native form fields**: \`provideDocumentFieldExtensions()\`. ${section('Native fields and host services')}.`,
		'- **Searches**: compiled repository searches with declared forms and result views. [docs/compiled-searches.md](../docs/compiled-searches.md).',
	);
	for (const heading of [
		'Schema-bound scalar layouts',
		'Custom extensions',
		'Result projections',
		'Polymer filters',
		'Named visibility rules',
		'Icons, labels and theme source catalogs',
		'Native fields and host services',
	])
		if (!new RegExp(`^#{2,3} ${escape(heading)}$`, 'm').test(readme))
			throw new Error(`${SDK_README} has no "${heading}" heading.`);
	const options = await prettier.resolveConfig(path.join(root, DOCUMENT));
	return prettier.format(lines.join('\n'), { ...options, parser: 'markdown' });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const data = load();
	const problems = catalogProblems(data);
	if (problems.length) {
		console.error(problems.join('\n'));
		process.exit(1);
	}
	const target = path.join(root, DOCUMENT);
	const text = await render(data);
	if (!process.argv.includes('--check')) {
		writeFileSync(target, text);
		console.log(`Wrote ${DOCUMENT}: ${data.identities.length} slots.`);
	} else if (readFileSync(target, 'utf8') !== text) {
		console.error(`${DOCUMENT} is stale; run npm run render:slot-catalog.`);
		process.exit(1);
	} else console.log(`${DOCUMENT} matches the SDK, the generator and the contracts.`);
}
