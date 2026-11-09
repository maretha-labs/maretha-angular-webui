import { SchemaMetadata } from '@maretha/webui-sdk';
import {
	canEditRow,
	cellValue,
	propertyValue,
	SpreadsheetField,
	spreadsheetField,
	SpreadsheetRow,
} from './results-spreadsheet';

const schemas: readonly SchemaMetadata[] = [
	{
		name: 'dublincore',
		prefix: 'dc',
		fields: {
			title: 'string',
			subjects: {
				type: 'string[]',
				itemConstraints: [{ name: 'directoryResolver', parameters: { directory: 'l10nsubjects' } }],
			},
			nature: {
				type: 'string',
				constraints: [{ name: 'directoryResolver', parameters: { directory: 'nature' } }],
			},
			coverage: {
				type: 'string',
				constraints: [{ name: 'directoryResolver', parameters: { directory: 'l10ncoverage' } }],
			},
			creator: {
				type: 'string',
				constraints: [{ name: 'userManagerResolver', parameters: { includeUsers: 'true' } }],
			},
			contributors: 'string[]',
			modified: 'date',
			expired: { type: 'date', readOnly: true },
		},
	},
	{
		name: 'acme',
		'@prefix': 'acme',
		fields: {
			count: 'long',
			ratio: 'double',
			active: 'boolean',
			related: {
				type: 'string',
				constraints: [{ name: 'documentResolver', parameters: {} }],
			},
			address: { type: 'complex', fields: { city: 'string' } },
			attachment: 'blob',
		},
	},
];
const kind = (field: string) => spreadsheetField({ field, label: field }, schemas).kind;

describe('Spreadsheet fields', () => {
	it('edits plain scalar and list fields by schema type', () => {
		expect(kind('dc:title')).toBe('text');
		expect(kind('dc:contributors')).toBe('list');
		expect(kind('dc:modified')).toBe('date');
		expect(kind('acme:count')).toBe('integer');
		expect(kind('acme:ratio')).toBe('number');
		expect(kind('acme:active')).toBe('boolean');
	});

	it('selects single directory values and keeps other references read-only', () => {
		expect(spreadsheetField({ field: 'dc:nature', label: 'Nature' }, schemas)).toEqual({
			field: 'dc:nature',
			label: 'Nature',
			labelKey: undefined,
			kind: 'directory',
			directory: { name: 'nature', dbl10n: false },
		});
		expect(
			spreadsheetField({ field: 'dc:coverage', label: 'Coverage' }, schemas).directory,
		).toEqual({ name: 'l10ncoverage', dbl10n: true });
		for (const field of ['dc:subjects', 'dc:creator', 'acme:related'])
			expect(kind(field)).withContext(field).toBe('readonly');
	});

	it('keeps unknown, nested, complex, blob, read-only and entity columns read-only', () => {
		for (const field of [
			'other:title',
			'dc:missing',
			'dc:expired',
			'acme:address',
			'acme:attachment',
			'file:content/name',
			'currentLifeCycleState',
		])
			expect(kind(field)).withContext(field).toBe('readonly');
	});
});

describe('Spreadsheet values', () => {
	const row: SpreadsheetRow = {
		uid: 'doc',
		state: 'project',
		properties: {
			'dc:title': 'Contract',
			'dc:contributors': ['jdoe', 'asmith'],
			'dc:modified': '2026-10-14T09:30:00.000Z',
		},
		contextParameters: { permissions: ['Read', 'Write'] },
	};
	const field = (name: string, fieldKind: SpreadsheetField['kind']): SpreadsheetField => ({
		field: name,
		label: name,
		kind: fieldKind,
	});

	it('shows lists, dates and the lifecycle state as cells', () => {
		expect(cellValue(row, field('dc:title', 'text'))).toBe('Contract');
		expect(cellValue(row, field('dc:contributors', 'list'))).toBe('jdoe, asmith');
		expect(cellValue(row, field('dc:modified', 'date'))).toBe('2026-10-14');
		expect(cellValue(row, field('currentLifeCycleState', 'readonly'))).toBe('project');
		expect(cellValue(row, field('dc:description', 'text'))).toBeNull();
	});

	it('converts edited cells back to stored property values', () => {
		expect(propertyValue(field('dc:contributors', 'list'), ' a, ,b ')).toEqual(['a', 'b']);
		expect(propertyValue(field('acme:count', 'integer'), 4.7)).toBe(4);
		expect(propertyValue(field('acme:ratio', 'number'), 0.5)).toBe(0.5);
		expect(propertyValue(field('acme:ratio', 'number'), Number.NaN)).toBeNull();
		expect(propertyValue(field('acme:active', 'boolean'), null)).toBeFalse();
		expect(propertyValue(field('dc:modified', 'date'), '2026-10-15')).toBe(
			'2026-10-15T00:00:00.000Z',
		);
		expect(propertyValue(field('dc:modified', 'date'), 'not a date')).toBeNull();
		expect(propertyValue(field('dc:title', 'text'), '')).toBeNull();
		expect(propertyValue(field('dc:nature', 'directory'), 'article')).toBe('article');
	});

	it('edits only rows with Write permission', () => {
		expect(canEditRow(row)).toBeTrue();
		expect(canEditRow({ ...row, contextParameters: { permissions: ['Read'] } })).toBeFalse();
		expect(canEditRow({ ...row, contextParameters: undefined })).toBeFalse();
	});
});
