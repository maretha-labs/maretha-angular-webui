import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { WebUiMessages } from './webui-messages';
import { LocalizedUiError } from './i18n/localized-state';
import {
	BulkValidationError,
	buildBulkDocumentChanges,
	BulkLayoutResolver,
	BulkLayoutContext,
	provideBulkLayouts,
} from './bulk-layout';
import {
	DOCUMENT_LAYOUT_WIDGETS,
	provideDocumentLayoutWidget,
	resolveLayoutFields,
	layoutFieldError,
	ResolvedLayoutField,
	layoutPropertyValue,
} from './document-layout';

@Component({ template: '' })
class ClientWidget {
	context!: BulkLayoutContext;
}

describe('Typed layout validation and customer values', () => {
	it('retains exact bulk validation identities for unsupported modes and invalid list additions', () => {
		const document = { uid: 'customer', properties: { tags: ['original'] } };
		for (const [change, code] of [
			[{ property: 'tags', mode: 'unexpected' }, 'unsupported-mode'],
			[{ property: 'tags', mode: 'addValues', value: 'scalar' }, 'add-values-list'],
		] as const) {
			try {
				buildBulkDocumentChanges([document], [change as any]);
				fail('Expected typed validation failure');
			} catch (error) {
				expect(error instanceof BulkValidationError).toBeTrue();
				expect((error as BulkValidationError).code).toBe(code);
			}
		}
		expect(document.properties.tags).toEqual(['original']);
		expect(new BulkValidationError('clear-required', {}).message).toContain('{property}');
		TestBed.configureTestingModule({
			providers: [provideBulkLayouts({ name: 'custom', component: ClientWidget })],
		});
		expect(TestBed.inject(BulkLayoutResolver).resolve('custom')?.component).toBe(ClientWidget);
	});
	it('reports schema mismatches by identifier and keeps explicit customer widgets registered', () => {
		TestBed.configureTestingModule({
			providers: [provideDocumentLayoutWidget({ id: 'customer-widget', component: ClientWidget })],
		});
		expect(TestBed.inject(DOCUMENT_LAYOUT_WIDGETS)[0].id).toBe('customer-widget');
		const metadata = {
			name: 'File',
			schemas: [{ name: 'dc', fields: { title: 'string', subject: 'string' } }],
		};
		for (const layout of [
			{ id: 'other', documentType: 'Other', fields: [] },
			{
				id: 'file',
				documentType: 'File',
				fields: [
					{ property: 'dc:title', label: 'Customer' },
					{ property: 'dc:title', label: 'Customer' },
				],
			},
		]) {
			expect(() => resolveLayoutFields(layout, metadata)).toThrowError(LocalizedUiError);
		}
		const fields = resolveLayoutFields(
			{
				id: 'file',
				documentType: 'File',
				fields: [
					{ property: 'dc:title', label: 'Customer key', widget: 'reference' },
					{ property: 'dc:subject', label: 'Literal label', widget: 'directory' },
				],
			},
			metadata,
		);
		expect(fields.map((field) => field.type)).toEqual(['reference', 'directory']);
		expect(fields.map((field) => field.label)).toEqual(['Customer key', 'Literal label']);
	});
	it('supports localized complete validation messages without changing compatibility English defaults', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			fr: {
				'validation.maximum': 'Maximum : {value, number}.',
				'validation.nested': '{field} : {error}',
				'validation.number': 'Nombre invalide.',
			},
		});
		messages.locale.set('fr');
		const field: ResolvedLayoutField = {
			property: 'customer:amount',
			label: 'Customer',
			type: 'double',
			multiple: false,
			max: 1234.5,
		};
		expect(layoutFieldError(field, 2000)).toBe('The maximum is 1234.5.');
		expect(
			layoutFieldError(field, 2000, (key, values, fallback) =>
				messages.format(key, values, fallback),
			),
		).toBe('Maximum : ' + new Intl.NumberFormat('fr').format(1234.5) + '.');
		const invalid: [Partial<ResolvedLayoutField>, unknown, string][] = [
			[{ multiple: true }, 'scalar', 'Use a list value.'],
			[{ multiple: true, itemType: 'integer' }, ['not-number'], 'Enter a valid number.'],
			[{ type: 'date' }, 'invalid', 'Enter a valid date.'],
			[{ type: 'complex' }, 'scalar', 'Use an object value.'],
			[
				{ type: 'complex', fields: { child: 'integer' } },
				{ child: 'text' },
				'child: Enter a valid number.',
			],
			[
				{ type: 'complex', fields: { child: 'custom' } },
				{ child: 'text' },
				'child: unsupported schema type.',
			],
			[{ type: 'blob' }, 'not-blob', 'Choose a file.'],
			[{ type: 'string', maxLength: 2 }, 'customer', 'Use at most 2 characters.'],
		];
		for (const [override, value, error] of invalid)
			expect(layoutFieldError({ ...field, max: undefined, ...override }, value)).toBe(error);
		expect(layoutPropertyValue({ ...field, type: 'date' }, '2026-10-03')).toBe(
			'2026-10-03T00:00:00.000Z',
		);
		expect(layoutPropertyValue({ ...field, type: 'date' }, 'customer-invalid')).toBe(
			'customer-invalid',
		);
	});
});
