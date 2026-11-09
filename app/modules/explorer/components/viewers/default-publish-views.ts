import {
	definePairedView,
	PUBLISH_ITEMS_SLOT,
	PUBLISH_PAGES_SLOT,
	provideWebUiExtensions,
} from '@maretha/webui-sdk';
import { isPublishableDocument } from '../../helpers/selection-publication.service';
import { hasPermission } from 'app/helpers/document-permissions';
export function provideDefaultPublishViews() {
	return provideWebUiExtensions({
		id: 'maretha.core.publish-views',
		contributions: definePairedView(
			{ items: PUBLISH_ITEMS_SLOT, pages: PUBLISH_PAGES_SLOT },
			{
				id: 'maretha.publish.section',
				viewId: 'section',
				label: 'Internal publication',
				labelKey: 'publication.internal',
				order: 10,
				when: (context) =>
					!context.noEdit &&
					(context.selectedDocuments
						? context.selectedDocuments.length > 0 &&
							context.selectedDocuments.every(isPublishableDocument)
						: hasPermission(context.document, 'WriteVersion')),
				loadComponent: () =>
					import('./publish-section-view.component').then((m) => m.PublishSectionViewComponent),
			},
		),
	});
}
