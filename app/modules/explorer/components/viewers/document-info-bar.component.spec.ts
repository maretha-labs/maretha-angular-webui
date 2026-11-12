import { TestBed } from '@angular/core/testing';
import { WebUiMessages } from '@maretha/webui-sdk';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ToastService } from 'app/helpers/toast.service';
import { of, Subject, throwError } from 'rxjs';
import { DocumentTrashService } from '../../helpers/document-trash.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { DocumentInfoBarComponent } from './document-info-bar.component';

describe('Document notices', () => {
	function setup(kind: 'retention' | 'trash' | 'workflow', document: any, noEdit = false) {
		const trash = {
			restoreDocumentsFromTrash: jasmine.createSpy('restore').and.returnValue(of({})),
			purgeDocuments: jasmine.createSpy('purge').and.returnValue(of({})),
		};
		const manager = { reloadDocument: jasmine.createSpy('reload').and.returnValue(of({})) };
		const toastr = jasmine.createSpyObj<ToastService>('ToastService', ['error']);
		TestBed.configureTestingModule({
			imports: [DocumentInfoBarComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: DocumentTrashService, useValue: trash },
				{ provide: DocumentsManagerService, useValue: manager },
				{ provide: ToastService, useValue: toastr },
			],
		});
		const fixture = TestBed.createComponent(DocumentInfoBarComponent);
		fixture.componentRef.setInput('context', { document, noEdit });
		fixture.componentRef.setInput('kind', kind);
		fixture.detectChanges();
		const element: HTMLElement = fixture.nativeElement;
		const buttons = () =>
			Array.from(element.querySelectorAll('button.action')).map((button) =>
				button.getAttribute('aria-label'),
			);
		return { fixture, element, buttons, trash, manager, toastr };
	}

	it('shows one stock record bar for legal hold and retention', () => {
		const held = {
			uid: 'doc',
			hasLegalHold: true,
			retainUntil: '2030-06-15T12:00:00Z',
			isUnderRetentionOrLegalHold: true,
		};
		const { fixture, element } = setup('retention', held);
		expect(element.querySelector('#retentionInfoBar.bar.record')).not.toBeNull();
		expect(element.querySelector('#legalHold')?.textContent).toBe(
			'The document is under legal hold',
		);
		expect(element.querySelector<HTMLElement>('#retention')?.hidden).toBeTrue();
		expect(element.querySelectorAll('nx-webui-icon').length).toBe(2);

		fixture.componentRef.setInput('context', {
			document: { ...held, hasLegalHold: false },
			noEdit: false,
		});
		fixture.detectChanges();
		expect(element.querySelector('#legalHold')).toBeNull();
		const retention = element.querySelector<HTMLElement>('#retention')!;
		expect(retention.hidden).toBeFalse();
		expect(retention.textContent).toContain('The document is under retention until June 15, 2030');

		fixture.componentRef.setInput('context', {
			document: { ...held, hasLegalHold: false, retainUntil: '9999-01-01T00:00:00.000+00:00' },
			noEdit: false,
		});
		fixture.detectChanges();
		expect(element.querySelector('#retention')).toBeNull();
		expect(element.querySelector('#indeterminateRetention')?.textContent).toBe(
			'The document is under indeterminate retention',
		);

		TestBed.inject(WebUiMessages).register('test', {
			ro: { 'documentPage.retainIndeterminate': 'Păstrare nedeterminată' },
		});
		TestBed.inject(WebUiMessages).locale.set('ro');
		fixture.detectChanges();
		expect(element.querySelector('#indeterminateRetention')?.textContent).toBe(
			'Păstrare nedeterminată',
		);
	});

	it('shows the stock trash bar with restore and permanent delete by permission', () => {
		const trashed = {
			uid: 'doc',
			isTrashed: true,
			contextParameters: { permissions: ['Read', 'Write', 'Remove'] },
		};
		const { fixture, element, buttons } = setup('trash', trashed);
		expect(element.querySelector('#trashedInfoBar.bar.trashed')?.textContent).toContain(
			'You are viewing a trashed document.',
		);
		expect(buttons()).toEqual(['Untrash document', 'Delete document permanently']);

		fixture.componentRef.setInput('context', {
			document: { ...trashed, contextParameters: { permissions: ['Read', 'Remove'] } },
			noEdit: false,
		});
		fixture.detectChanges();
		expect(element.textContent).toContain('To restore, please contact your admin.');
		expect(buttons()).toEqual(['Delete document permanently']);

		fixture.componentRef.setInput('context', {
			document: { ...trashed, isVersion: true },
			noEdit: false,
		});
		fixture.detectChanges();
		expect(buttons()).toEqual(['Untrash document']);

		fixture.componentRef.setInput('context', { document: trashed, noEdit: true });
		fixture.detectChanges();
		expect(buttons()).toEqual([]);
	});

	it('restores the document then reloads it', async () => {
		const trashed = {
			uid: 'doc',
			repository: 'other',
			isTrashed: true,
			contextParameters: { permissions: ['Write'] },
		};
		const { fixture, element, trash, manager } = setup('trash', trashed);
		element.querySelector<HTMLButtonElement>('button.action')!.click();
		await fixture.whenStable();
		expect(trash.restoreDocumentsFromTrash).toHaveBeenCalledOnceWith(['doc'], 'other');
		expect(manager.reloadDocument).toHaveBeenCalledOnceWith('doc');

		const refreshDocument = jasmine.createSpy('refreshDocument');
		fixture.componentRef.setInput('context', { document: trashed, noEdit: false, refreshDocument });
		await fixture.componentInstance.untrash();
		expect(refreshDocument).toHaveBeenCalledTimes(1);
		expect(manager.reloadDocument).toHaveBeenCalledTimes(1);
	});

	it('reports a failed restore with the stock message', async () => {
		const { fixture, trash, toastr } = setup('trash', {
			uid: 'doc',
			isTrashed: true,
			contextParameters: { permissions: ['Write'] },
		});
		trash.restoreDocumentsFromTrash.and.returnValue(throwError(() => new Error('Backend detail')));
		await fixture.componentInstance.untrash();
		expect(toastr.error).toHaveBeenCalledOnceWith('Error while restoring the document');
		expect(fixture.componentInstance.busy()).toBeFalse();
	});

	it('asks before deleting permanently, as stock does', async () => {
		const { fixture, trash } = setup('trash', {
			uid: 'doc',
			isTrashed: true,
			contextParameters: { permissions: ['Remove'] },
		});
		const confirm = spyOn(window, 'confirm').and.returnValue(false);
		await fixture.componentInstance.deleteForever();
		expect(confirm).toHaveBeenCalledOnceWith('Delete the document?');
		expect(trash.purgeDocuments).not.toHaveBeenCalled();
		confirm.and.returnValue(true);
		await fixture.componentInstance.deleteForever();
		expect(trash.purgeDocuments).toHaveBeenCalledOnceWith(['doc'], 'default');
	});

	it('renders the workflow and task bars', () => {
		const { element } = setup('workflow', {
			uid: 'doc',
			contextParameters: { pendingTasks: [], runningWorkflows: [] },
		});
		expect(element.querySelector('nx-workflow-info')).not.toBeNull();
	});
	it('ignores re-entrant or uid-less actions and reports a failed permanent delete', async () => {
		const trashed = {
			uid: 'doc',
			isTrashed: true,
			contextParameters: { permissions: ['Write', 'Remove'] },
		};
		const { fixture, trash, manager, toastr } = setup('trash', trashed);
		const restore = new Subject<unknown>();
		trash.restoreDocumentsFromTrash.and.returnValue(restore);
		spyOn(window, 'confirm').and.returnValue(true);
		const first = fixture.componentInstance.untrash();
		expect(fixture.componentInstance.busy()).toBeTrue();
		await fixture.componentInstance.untrash();
		await fixture.componentInstance.deleteForever();
		expect(trash.restoreDocumentsFromTrash).toHaveBeenCalledTimes(1);
		expect(window.confirm).not.toHaveBeenCalled();
		expect(trash.purgeDocuments).not.toHaveBeenCalled();
		// The user navigated away while the restore was in flight: never reload the old document.
		fixture.componentRef.setInput('context', {
			document: { ...trashed, uid: 'other' },
			noEdit: false,
		});
		restore.next({});
		restore.complete();
		await first;
		expect(manager.reloadDocument).not.toHaveBeenCalled();
		expect(fixture.componentInstance.busy()).toBeFalse();

		fixture.componentRef.setInput('context', { document: { isTrashed: true }, noEdit: false });
		await fixture.componentInstance.untrash();
		await fixture.componentInstance.deleteForever();
		expect(trash.restoreDocumentsFromTrash).toHaveBeenCalledTimes(1);
		expect(trash.purgeDocuments).not.toHaveBeenCalled();

		fixture.componentRef.setInput('context', { document: trashed, noEdit: false });
		trash.purgeDocuments.and.returnValue(throwError(() => new Error('Backend detail')));
		await fixture.componentInstance.deleteForever();
		expect(trash.purgeDocuments).toHaveBeenCalledOnceWith(['doc'], 'default');
		expect(toastr.error).toHaveBeenCalledOnceWith('Error deleting document.');
		expect(fixture.componentInstance.busy()).toBeFalse();
	});
});
