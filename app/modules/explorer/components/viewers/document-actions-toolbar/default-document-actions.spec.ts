import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	defineContribution,
	DOCUMENT_ACTIONS_SLOT,
	DocumentActionContext,
	ExtensionRegistry,
	POLYMER_SLOTS,
} from '@maretha/webui-sdk';
import { provideDefaultDocumentActions } from './default-document-actions';
import { CompareVersionsActionComponent } from './compare-versions-action.component';
import { DocumentInfoActionComponent } from './document-info-action.component';

@Component({
	selector: 'nx-client-document-info',
	template: 'Client information',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class ClientDocumentInfoComponent {
	readonly context = input.required<DocumentActionContext>();
}

describe('Default document action extension', () => {
	let registry: ExtensionRegistry;
	const context: DocumentActionContext = {
		document: { uid: 'document-1', ng: {} },
		noEdit: false,
	};
	const resolve = () =>
		registry
			.resolve(POLYMER_SLOTS.DOCUMENT_ACTIONS, context)
			.items.filter((item) => item.id === 'maretha.document.info');

	beforeEach(() => {
		TestBed.configureTestingModule({ providers: [provideDefaultDocumentActions()] });
		registry = TestBed.inject(ExtensionRegistry);
	});

	it('registers the actual document info action through the public provider', async () => {
		const items = resolve();
		expect(items.length).toBe(1);
		expect(items[0].id).toBe('maretha.document.info');
		expect(items[0].extensionId).toBe('maretha.core.document-actions');
		expect(items[0].component).toBeUndefined();
		expect(await items[0].loadComponent?.()).toBe(DocumentInfoActionComponent);
	});

	it('preserves document readiness and no-edit eligibility', () => {
		for (const hiddenContext of [
			{ document: context.document, noEdit: true },
			{ document: null, noEdit: false },
			{ document: { uid: 'document-1' }, noEdit: false },
		]) {
			expect(
				registry
					.resolve(POLYMER_SLOTS.DOCUMENT_ACTIONS, hiddenContext)
					.items.filter((item) => item.id === 'maretha.document.info'),
			).toEqual([]);
		}
	});

	it('lets a client disable and restore the built-in action without changing its source', () => {
		const dispose = registry.register({
			id: 'client.document-actions',
			overrides: [
				{ slot: POLYMER_SLOTS.DOCUMENT_ACTIONS, id: 'maretha.document.info', disabled: true },
			],
		});

		expect(resolve()).toEqual([]);
		dispose();
		expect(resolve().map((item) => item.id)).toEqual(['maretha.document.info']);
	});

	it('lets a client replace the built-in action and restores it when the client is removed', async () => {
		const dispose = registry.register({
			id: 'client.document-actions',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'maretha.document.info',
					component: ClientDocumentInfoComponent,
					order: 25,
				}),
			],
		});

		expect(resolve().length).toBe(1);
		expect(resolve()[0].component).toBe(ClientDocumentInfoComponent);
		expect(resolve()[0].extensionId).toBe('client.document-actions');
		expect(resolve()[0].order).toBe(25);
		dispose();
		expect(await resolve()[0].loadComponent?.()).toBe(DocumentInfoActionComponent);
	});

	it('offers compare versions in the standard header for a versioned document, overridably', async () => {
		const compare = (candidate: DocumentActionContext) =>
			registry
				.resolve(POLYMER_SLOTS.DOCUMENT_ACTIONS, candidate)
				.items.filter((item) => item.id === 'maretha.document.compare-versions');
		const versioned = (major: number, minor: number) => ({
			uid: 'document-1',
			properties: { 'uid:major_version': major, 'uid:minor_version': minor },
		});
		const header = { document: versioned(0, 1), noEdit: false, standardHeaderActions: true };
		const items = compare(header);
		expect(items.map((item) => [item.extensionId, item.order])).toEqual([
			['maretha.core.document-actions', 25],
		]);
		expect(await items[0].loadComponent?.()).toBe(CompareVersionsActionComponent);
		expect(compare({ ...header, document: versioned(2, 0) }).length).toBe(1);
		expect(compare({ ...header, document: versioned(0, 0) })).toEqual([]);
		expect(compare({ ...header, document: null })).toEqual([]);
		expect(compare({ ...header, standardHeaderActions: false })).toEqual([]);
		const dispose = registry.register({
			id: 'client.document-actions',
			overrides: [
				{
					slot: POLYMER_SLOTS.DOCUMENT_ACTIONS,
					id: 'maretha.document.compare-versions',
					disabled: true,
				},
			],
		});
		expect(compare(header)).toEqual([]);
		dispose();
		expect(compare(header).length).toBe(1);
	});
});
