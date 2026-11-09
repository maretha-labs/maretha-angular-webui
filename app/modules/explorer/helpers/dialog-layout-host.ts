import { Injector, StaticProvider } from '@angular/core';
import { DOCUMENT_LAYOUT_HOST, type DocumentLayoutHost } from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { DocumentsManagerService } from './documents-manager.service';

/** The SDK layout host for a document layout that is itself the dialog content. */
export function dialogLayoutHost(created: boolean): StaticProvider {
	return {
		provide: DOCUMENT_LAYOUT_HOST,
		deps: [BsModalRef, Injector],
		useFactory: (dialog: BsModalRef, injector: Injector): DocumentLayoutHost => ({
			complete: (documents) => {
				const manager = injector.get(DocumentsManagerService);
				for (const document of documents)
					manager.syncSavedDocument(document.uid, created).subscribe({ error: () => undefined });
				dialog.hide();
			},
			cancel: () => dialog.hide(),
		}),
	};
}
