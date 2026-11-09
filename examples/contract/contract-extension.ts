import { defineDocumentView, provideWebUiExtensions } from '@maretha/webui-sdk';
export function provideContractExample() {
	return provideWebUiExtensions({
		id: 'client.contract',
		contributions: defineDocumentView({
			id: 'client.contract.editor',
			viewId: 'contract',
			label: 'Contract',
			icon: 'nuxeo:edit',
			order: 5,
			retain: true,
			when: ({ document }) => document?.['type'] === 'Contract',
			loadComponent: () => import('./contract-view.component').then((m) => m.ContractViewComponent),
		}),
	});
}
