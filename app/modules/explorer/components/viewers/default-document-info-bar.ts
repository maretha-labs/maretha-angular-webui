import {
	defineContribution,
	DOCUMENT_INFO_BAR_SLOT,
	provideWebUiExtensions,
} from '@maretha/webui-sdk';
import { usesStandardDocumentHeader } from '../../helpers/standard-document-surfaces';
export function provideDefaultDocumentInfoBar() {
	return provideWebUiExtensions({
		id: 'maretha.core.document-info-bar',
		contributions: [
			defineContribution(DOCUMENT_INFO_BAR_SLOT, {
				id: 'maretha.document.notice.standard-version',
				order: 25,
				when: ({ document }) => !!document?.['isVersion'] && usesStandardDocumentHeader(document),
				loadComponent: () =>
					import('./standard-version-notice.component').then(
						(m) => m.StandardVersionNoticeComponent,
					),
			}),
			// Stock nuxeo-document-info-bar order: workflow and task bars, record bar, trash bar.
			...(['workflow', 'retention', 'trash'] as const).map((kind, index) =>
				defineContribution(DOCUMENT_INFO_BAR_SLOT, {
					id: `maretha.document.notice.${kind}`,
					order: -20 + index * 5,
					inputs: { kind },
					loadComponent: () =>
						import('./document-info-bar.component').then((m) => m.DocumentInfoBarComponent),
					when: (context) => {
						const document = context.document as any;
						if (!document) return false;
						switch (kind) {
							case 'workflow':
								return !context.searchActive;
							case 'retention':
								return !!document.isUnderRetentionOrLegalHold;
							case 'trash':
								return document.isTrashed === true;
						}
					},
				}),
			),
		],
	});
}
