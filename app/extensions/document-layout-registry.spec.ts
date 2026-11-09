import { TestBed } from '@angular/core/testing';
import {
	DocumentLayoutRegistry,
	documentLayoutContext,
	provideDocumentLayoutExtensions,
} from './document-layout-registry';

class ClientViewComponent {}

describe('DocumentLayoutRegistry', () => {
	beforeEach(() =>
		TestBed.configureTestingModule({
			providers: [
				provideDocumentLayoutExtensions({
					id: 'defaults',
					layouts: [{ id: 'file.view', documentType: 'File', mode: 'view' }],
				}),
				provideDocumentLayoutExtensions({
					id: 'client',
					layouts: [
						{
							id: 'file.view',
							documentType: 'File',
							mode: 'view',
							component: ClientViewComponent,
							priority: 10,
						},
					],
				}),
			],
		}),
	);

	it('uses the client replacement and gives each lookup an immutable scope', () => {
		const registry = TestBed.inject(DocumentLayoutRegistry);
		const source = { type: 'File', title: 'before', properties: { nested: 'before' } };
		const context = documentLayoutContext({
			documentType: ' File ',
			mode: 'view',
			document: source,
		});
		source.title = 'after';
		source.properties.nested = 'after';
		expect(context.document?.['title']).toBe('before');
		expect((context.document?.['properties'] as { nested: string }).nested).toBe('before');
		expect(Object.isFrozen(context)).toBeTrue();
		expect(registry.resolve(context)?.component).toBe(ClientViewComponent);
	});

	it('keeps independent contexts isolated for two document hosts', () => {
		const first = documentLayoutContext({
			documentType: 'File',
			mode: 'view',
			document: { uid: 'one', properties: { title: 'One' } },
		});
		const second = documentLayoutContext({
			documentType: 'File',
			mode: 'view',
			document: { uid: 'two', properties: { title: 'Two' } },
		});
		expect(first.document?.['uid']).toBe('one');
		expect(second.document?.['uid']).toBe('two');
		expect(first.document?.['properties']).not.toBe(second.document?.['properties']);
	});

	it('honors a client disable and leaves an unknown type without a layout', () => {
		const registry = TestBed.inject(DocumentLayoutRegistry);
		registry.register({ id: 'disable-file', overrides: [{ id: 'file.view', disabled: true }] });
		expect(
			registry.resolve(documentLayoutContext({ documentType: 'File', mode: 'view' }))?.disabled,
		).toBeTrue();
		expect(
			registry.resolve(documentLayoutContext({ documentType: 'Unknown', mode: 'view' })),
		).toBeUndefined();
	});
});
