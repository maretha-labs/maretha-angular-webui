import { LocalizedUiError } from '@maretha/webui-sdk';

/** A create request may have committed even when its follow-up read failed. */
export class DocumentCreationError extends LocalizedUiError {
	constructor(readonly documentId?: string) {
		super(
			documentId ? 'app.services.creation.details-failed' : 'app.services.creation.unknown',
			documentId
				? 'The document was created, but its details could not be loaded. Retry finishing this document.'
				: 'The server did not confirm whether creation finished. Inspect the destination before creating another document.',
		);
		this.name = 'DocumentCreationError';
	}
}
