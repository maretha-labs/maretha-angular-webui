import type { DocumentActionContext } from '@maretha/webui-sdk';
import { isPublishableDocument } from '../../../helpers/selection-publication.service';
import { usesStandardDocumentHeader } from '../../../helpers/standard-document-surfaces';

export function usesStandardPublishAction(context: DocumentActionContext): boolean {
	return context.standardHeaderActions === true && usesStandardDocumentHeader(context.document);
}

export function canPublishStandardDocument(context: DocumentActionContext): boolean {
	return (
		usesStandardPublishAction(context) &&
		!!context.document &&
		(!context.noEdit || context.document['isVersion'] === true) &&
		isPublishableDocument(context.document)
	);
}
