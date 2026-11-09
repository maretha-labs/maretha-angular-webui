import { defineDocumentView, provideWebUiExtensions } from '@maretha/webui-sdk';
import {
	isStandardFolder,
	usesStandardDocumentHeader,
} from '../../helpers/standard-document-surfaces';

export function provideDefaultDocumentViews() {
	return provideWebUiExtensions({
		id: 'maretha.core.document-views',
		contributions: [
			...defineDocumentView({
				id: 'maretha.document.content',
				viewId: 'view',
				label: 'View',
				labelKey: 'browser.view',
				order: 10,
				when: (context) => !!context.document,
				loadComponent: () =>
					import('./document-content-view.component').then((m) => m.DocumentContentViewComponent),
			}),
			...defineDocumentView({
				id: 'maretha.document.permissions',
				viewId: 'permissions',
				label: 'Permissions',
				labelKey: 'browser.permissions',
				order: 20,
				when: (context) =>
					!!context.document &&
					context.document['isVersion'] !== true &&
					!usesStandardDocumentHeader(context.document),
				loadComponent: () =>
					import('./document-permissions-view.component').then(
						(m) => m.DocumentPermissionsViewComponent,
					),
			}),
			...defineDocumentView({
				id: 'maretha.document.standard-permissions',
				viewId: 'permissions',
				label: 'Permissions',
				labelKey: 'browser.permissions',
				order: 20,
				when: (context) =>
					!!context.document &&
					context.document['isVersion'] !== true &&
					usesStandardDocumentHeader(context.document),
				loadComponent: () =>
					import('./standard-document-permissions-view.component').then(
						(m) => m.StandardDocumentPermissionsViewComponent,
					),
			}),
			...defineDocumentView({
				id: 'maretha.document.history',
				viewId: 'history',
				label: 'History',
				labelKey: 'browser.history',
				order: 30,
				when: (context) =>
					!!context.document && ['File', 'Picture'].includes(String(context.document['type'])),
				loadComponent: () =>
					import('./standard-document-history-view.component').then(
						(m) => m.StandardDocumentHistoryViewComponent,
					),
			}),
			...defineDocumentView({
				id: 'maretha.document.standard-history',
				viewId: 'history',
				label: 'History',
				labelKey: 'browser.history',
				order: 30,
				when: (context) =>
					!!context.document && !['File', 'Picture'].includes(String(context.document['type'])),
				loadComponent: () =>
					import('./standard-document-history-view.component').then(
						(m) => m.StandardDocumentHistoryViewComponent,
					),
			}),
			...defineDocumentView({
				id: 'maretha.document.publication',
				viewId: 'publication',
				label: 'Publications',
				labelKey: 'browser.publications',
				order: 40,
				when: ({ document }) =>
					!!document &&
					!usesStandardDocumentHeader(document) &&
					!document['isProxy'] &&
					Array.isArray(document['facets']) &&
					document['facets'].includes('Publishable'),
				loadComponent: () =>
					import('./document-publication-view.component').then(
						(m) => m.DocumentPublicationViewComponent,
					),
			}),
			...defineDocumentView({
				id: 'maretha.document.standard-publication',
				viewId: 'publication',
				label: 'Publications',
				labelKey: 'browser.publications',
				order: 40,
				when: ({ document }) =>
					!!document &&
					usesStandardDocumentHeader(document) &&
					!document['isProxy'] &&
					Array.isArray(document['facets']) &&
					document['facets'].includes('Publishable'),
				loadComponent: () =>
					import('./standard-document-publication-view.component').then(
						(m) => m.StandardDocumentPublicationViewComponent,
					),
			}),
			...defineDocumentView({
				id: 'maretha.document.trash',
				viewId: 'trash',
				label: 'Trash',
				labelKey: 'browser.trash',
				order: 50,
				when: ({ document }) =>
					!!document &&
					!isStandardFolder(document) &&
					Array.isArray(document['facets']) &&
					document['facets'].includes('Folderish'),
				loadComponent: () =>
					import('./document-trash-view.component').then((m) => m.DocumentTrashViewComponent),
			}),
			...defineDocumentView({
				id: 'maretha.document.standard-trash',
				viewId: 'trash',
				label: 'Trash',
				labelKey: 'browser.trash',
				order: 50,
				when: ({ document }) =>
					!!document &&
					isStandardFolder(document) &&
					Array.isArray(document['facets']) &&
					document['facets'].includes('Folderish'),
				loadComponent: () =>
					import('./standard-document-trash-view.component').then(
						(m) => m.StandardDocumentTrashViewComponent,
					),
			}),
		],
	});
}
