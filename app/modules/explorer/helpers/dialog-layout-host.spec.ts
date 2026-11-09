import { Injector } from '@angular/core';
import { DOCUMENT_LAYOUT_HOST } from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { throwError } from 'rxjs';
import { dialogLayoutHost } from './dialog-layout-host';
import { DocumentsManagerService } from './documents-manager.service';

describe('dialogLayoutHost', () => {
	it('syncs saved documents and closes the dialog it is provided in', () => {
		const dialog = jasmine.createSpyObj<BsModalRef>('BsModalRef', ['hide']);
		const manager = jasmine.createSpyObj<DocumentsManagerService>('DocumentsManagerService', [
			'syncSavedDocument',
		]);
		// A failed listing refresh still closes the dialog; the save itself succeeded.
		manager.syncSavedDocument.and.returnValue(throwError(() => new Error('offline')));
		const host = Injector.create({
			providers: [
				{ provide: BsModalRef, useValue: dialog },
				{ provide: DocumentsManagerService, useValue: manager },
				dialogLayoutHost(true),
			],
		}).get(DOCUMENT_LAYOUT_HOST);
		host.complete([{ uid: 'contract-1', type: 'Contract', properties: {} }]);
		expect(manager.syncSavedDocument).toHaveBeenCalledOnceWith('contract-1', true);
		expect(dialog.hide).toHaveBeenCalledTimes(1);
		host.cancel();
		expect(dialog.hide).toHaveBeenCalledTimes(2);
		expect(manager.syncSavedDocument).toHaveBeenCalledTimes(1);
	});
});
