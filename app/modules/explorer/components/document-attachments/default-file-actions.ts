import { canPreviewBlob } from './blob-preview.component';
import { blobAppLinks } from './blob-app-links';
import {
	BLOB_ACTIONS_SLOT,
	ChooseFilesActionComponent,
	defineContribution,
	FILE_UPLOAD_ACTIONS_SLOT,
	provideWebUiExtensions,
} from '@maretha/webui-sdk';
export function provideDefaultFileActions() {
	return provideWebUiExtensions({
		id: 'maretha.core.file-actions',
		contributions: [
			defineContribution(BLOB_ACTIONS_SLOT, {
				id: 'maretha.blob.preview',
				order: 0.5,
				when: canPreviewBlob,
				loadComponent: () => import('./blob-preview.component').then((m) => m.BlobPreviewComponent),
			}),
			defineContribution(FILE_UPLOAD_ACTIONS_SLOT, {
				id: 'maretha.upload.choose',
				component: ChooseFilesActionComponent,
			}),
			...(['download', 'replace', 'remove'] as const).map((action, order) =>
				defineContribution(BLOB_ACTIONS_SLOT, {
					id: `maretha.blob.${action}`,
					order,
					inputs: { action },
					when: (context) =>
						typeof context[action] === 'function' && (action === 'download' || !context.noEdit),
					loadComponent: () => import('./blob-action.component').then((m) => m.BlobActionComponent),
				}),
			),
			defineContribution(BLOB_ACTIONS_SLOT, {
				id: 'maretha.blob.app-links',
				order: 3,
				when: (context) => blobAppLinks(context).length > 0,
				loadComponent: () =>
					import('./blob-app-links.component').then((m) => m.BlobAppLinksComponent),
			}),
		],
	});
}
