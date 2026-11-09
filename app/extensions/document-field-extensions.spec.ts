import { TestBed } from '@angular/core/testing';
import { documentLayoutContext } from './document-layout-registry';
import {
	DocumentFieldExtensionRegistry,
	provideDocumentFieldExtensions,
} from './document-field-extensions';

describe('native document field extensions', () => {
	beforeEach(() =>
		TestBed.configureTestingModule({
			providers: [
				provideDocumentFieldExtensions({
					id: 'example.ai',
					schema: 'ai',
					documentTypes: ['File', 'Picture'],
					modes: ['edit', 'metadata'],
					fields: [{ property: 'ai:altText', label: 'Alt Text' }],
				}),
			],
		}),
	);
	it('only augments eligible document types and modes with the attached schema', () => {
		const registry = TestBed.inject(DocumentFieldExtensionRegistry);
		const context = (type: string, mode: 'edit' | 'view', document: any) =>
			documentLayoutContext({ documentType: type, mode, document });
		expect(
			registry.fields(context('File', 'edit', { properties: { 'dc:title': 'File' } })),
		).toEqual([]);
		expect(registry.fields(context('Note', 'edit', { schemas: [{ name: 'ai' }] }))).toEqual([]);
		expect(registry.fields(context('File', 'view', { schemas: [{ name: 'ai' }] }))).toEqual([]);
		expect(
			registry
				.fields(context('Picture', 'edit', { schemas: [{ name: 'ai' }] }))
				.map((f) => f.property),
		).toEqual(['ai:altText']);
		expect(
			registry
				.fields(context('File', 'edit', { properties: { 'ai:altText': '' } }))
				.map((f) => f.property),
		).toEqual(['ai:altText']);
	});
	it('does not infer schema membership from an unrelated facet or matching text', () => {
		const registry = TestBed.inject(DocumentFieldExtensionRegistry);
		expect(
			registry.fields(
				documentLayoutContext({
					documentType: 'File',
					mode: 'edit',
					document: { facets: ['ai'], properties: { 'dc:description': 'ai:altText' } },
				}),
			),
		).toEqual([]);
	});
});
