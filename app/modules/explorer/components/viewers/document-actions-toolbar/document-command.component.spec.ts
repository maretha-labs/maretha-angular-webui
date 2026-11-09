import { TestBed } from '@angular/core/testing';
import { EventEmitter, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'app/helpers/auth.service';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { of, Subject, throwError } from 'rxjs';
import { BsModalService } from 'ngx-bootstrap/modal';
import { DocumentEditDialogComponent } from '../../editors/document-edit-dialog.component';
import { DocumentCommandComponent } from './document-command.component';
import { canRunDocumentCommand } from './document-command-policy';
import { DocumentTrashService } from '../../../helpers/document-trash.service';
import { DocumentAttachmentsService } from '../../../helpers/document-attachments.service';
import { DocumentClipboardService } from '../../../helpers/document-clipboard.service';
import { DocumentCollectionsService } from '../../../helpers/document-collections.service';

describe('Contributed document commands', () => {
	const document = {
		uid: 'one',
		isTrashed: true,
		contextParameters: { permissions: ['Remove', 'Write', 'WriteProperties'] },
		ng: {},
	};
	function setup() {
		const manager = {
			getDocumentInfo: jasmine.createSpy().and.callFake(() => of(document)),
			reloadDocument: jasmine.createSpy().and.returnValue(of({})),
			toggleNotification: jasmine.createSpy().and.returnValue(of({})),
			toggleLock: jasmine.createSpy().and.returnValue(of({})),
		};
		const collections = { toggleFavoriteDocument: jasmine.createSpy().and.returnValue(of({})) };
		const trash = {
			purgeDocuments: jasmine.createSpy().and.returnValue(of({})),
			restoreDocumentsFromTrash: jasmine
				.createSpy()
				.and.returnValue(throwError(() => new Error('403'))),
		};
		TestBed.configureTestingModule({
			providers: [
				{ provide: DocumentTrashService, useValue: trash },
				{ provide: DocumentAttachmentsService, useValue: {} },
				{ provide: DocumentClipboardService, useValue: {} },
				{ provide: DocumentCollectionsService, useValue: collections },
				{ provide: DocumentsManagerService, useValue: manager },
				{
					provide: AuthService,
					useValue: { userInfo: signal({ id: 'alice', isAdministrator: false }) },
				},
				{ provide: Router, useValue: { navigate: jasmine.createSpy().and.resolveTo(true) } },
				{
					provide: BsModalService,
					useValue: {
						show: jasmine.createSpy('show').and.callFake(() => ({
							onHidden: new EventEmitter(),
							content: { interceptClose: jasmine.createSpy().and.resolveTo() },
						})),
					},
				},
			],
		});
		const fixture = TestBed.createComponent(DocumentCommandComponent);
		fixture.componentRef.setInput('context', { document, noEdit: false });
		fixture.componentRef.setInput('command', 'purge');
		fixture.detectChanges();
		return { fixture, trash, manager, collections };
	}
	const mutable = { ...document, isTrashed: false, facets: ['Notifiable', 'Publishable'] };
	for (const standardHeaderActions of [false, true]) {
		it(`opens a centered guarded modal for ${standardHeaderActions ? 'standard' : 'contributed'} document editing`, async () => {
			const { fixture } = setup();
			const editable = { ...mutable, type: 'Picture' };
			fixture.componentRef.setInput('command', 'edit');
			fixture.componentRef.setInput('context', {
				document: editable,
				noEdit: false,
				standardHeaderActions,
			});
			await fixture.componentInstance.execute();
			const show = TestBed.inject(BsModalService).show as jasmine.Spy;
			expect(show).toHaveBeenCalledOnceWith(
				DocumentEditDialogComponent,
				jasmine.objectContaining({
					class: 'modal-dialog-centered nx-document-edit-dialog',
					keyboard: true,
					ignoreBackdropClick: false,
				}),
			);
			const options = show.calls.mostRecent().args[1];
			expect(options.initialState.documentType).toBe('Picture');
			expect(options.initialState.data.documents[0]).toEqual(editable);
			expect(options.initialState.data.documents[0]).not.toBe(editable);
			await options.closeInterceptor();
			expect(show.calls.mostRecent().returnValue.content.interceptClose).toHaveBeenCalledTimes(1);
		});
	}
	it('keeps one modal on repeated activation and exposes its close event to overflow focus restoration', async () => {
		const { fixture } = setup();
		fixture.componentRef.setInput('command', 'edit');
		fixture.componentRef.setInput('context', {
			document: { ...mutable, type: 'File' },
			noEdit: false,
		});
		const opened = jasmine.createSpy('opened');
		fixture.nativeElement.addEventListener('document-action-opened', opened);
		await fixture.componentInstance.execute();
		await fixture.componentInstance.execute();
		const show = TestBed.inject(BsModalService).show as jasmine.Spy;
		expect(show).toHaveBeenCalledTimes(1);
		const hidden = show.calls.mostRecent().returnValue.onHidden;
		expect(opened.calls.mostRecent().args[0].detail.onHidden).toBe(hidden);
		hidden.emit();
		await fixture.componentInstance.execute();
		expect(show).toHaveBeenCalledTimes(2);
	});
	it('does not open the editor when the context forbids editing', async () => {
		const { fixture } = setup();
		fixture.componentRef.setInput('command', 'edit');
		fixture.componentRef.setInput('context', {
			document: { ...mutable, type: 'File' },
			noEdit: true,
		});
		await fixture.componentInstance.execute();
		expect(TestBed.inject(BsModalService).show).not.toHaveBeenCalled();
	});
	it('uses fresh favorite membership and refreshes the changed document', async () => {
		const { fixture, manager, collections } = setup();
		fixture.componentRef.setInput('command', 'favorite');
		fixture.componentRef.setInput('context', { document: mutable, noEdit: false });
		manager.getDocumentInfo.and.returnValue(
			of({
				...mutable,
				contextParameters: { ...mutable.contextParameters, favorites: { isFavorite: true } },
			}),
		);
		await fixture.componentInstance.execute();
		expect(collections.toggleFavoriteDocument).toHaveBeenCalledOnceWith(['one'], false);
		expect(manager.reloadDocument).toHaveBeenCalledOnceWith('one');
	});
	it('does not mutate a document after selection changes during the preflight', async () => {
		const { fixture, manager, collections } = setup();
		fixture.componentRef.setInput('command', 'favorite');
		fixture.componentRef.setInput('context', { document: mutable, noEdit: false });
		const response = new Subject<any>();
		manager.getDocumentInfo.and.returnValue(response);
		const pending = fixture.componentInstance.execute();
		fixture.componentRef.setInput('context', {
			document: { ...mutable, uid: 'two' },
			noEdit: false,
		});
		response.next(mutable);
		response.complete();
		await pending;
		expect(collections.toggleFavoriteDocument).not.toHaveBeenCalled();
	});
	it('rechecks permission after the preflight and leaves foreign unlocks to the server', async () => {
		const { fixture, manager } = setup();
		fixture.componentRef.setInput('command', 'lock');
		fixture.componentRef.setInput('context', { document: mutable, noEdit: false });
		manager.getDocumentInfo.and.returnValue(
			of({ ...mutable, contextParameters: { permissions: ['Read'] } }),
		);
		await fixture.componentInstance.execute();
		expect(manager.toggleLock).not.toHaveBeenCalled();
		// Stock shows Unlock to a reader while the document is locked; the server decides.
		manager.getDocumentInfo.and.returnValue(
			of({ ...mutable, lockOwner: 'bob', contextParameters: { permissions: ['Read'] } }),
		);
		await fixture.componentInstance.execute();
		expect(manager.toggleLock).toHaveBeenCalledTimes(1);
		manager.getDocumentInfo.and.returnValue(of({ ...mutable, lockOwner: 'alice' }));
		await fixture.componentInstance.execute();
		expect(manager.toggleLock).toHaveBeenCalledTimes(2);
	});
	it('never purges without confirmation and invalidates confirmation when the target changes', async () => {
		const { fixture, trash } = setup();
		await fixture.componentInstance.execute();
		expect(trash.purgeDocuments).not.toHaveBeenCalled();
		fixture.componentInstance.activate();
		fixture.componentRef.setInput('context', {
			document: { ...document, uid: 'two' },
			noEdit: false,
		});
		fixture.detectChanges();
		await fixture.componentInstance.execute();
		expect(trash.purgeDocuments).not.toHaveBeenCalled();
		fixture.componentInstance.activate();
		await fixture.componentInstance.execute();
		expect(trash.purgeDocuments).toHaveBeenCalledOnceWith(['two']);
	});
	it('reports a failed restore and releases the control for retry', async () => {
		const { fixture, trash } = setup();
		fixture.componentRef.setInput('command', 'restore');
		await fixture.componentInstance.execute();
		expect(trash.restoreDocumentsFromTrash).toHaveBeenCalledOnceWith(['one']);
		expect(fixture.componentInstance.error()).toContain('failed');
		expect(fixture.componentInstance.busy()).toBeFalse();
	});
	it('reloads the restored document so its current trash state and permissions are rendered', async () => {
		const { fixture, trash, manager } = setup();
		trash.restoreDocumentsFromTrash.and.returnValue(of({}));
		fixture.componentRef.setInput('command', 'restore');
		await fixture.componentInstance.execute();
		expect(manager.reloadDocument).toHaveBeenCalledOnceWith('one');
	});
	it('does not refresh an old document when restore completes after the context changed', async () => {
		const { fixture, trash, manager } = setup();
		const pending = new Subject<any>();
		trash.restoreDocumentsFromTrash.and.returnValue(pending);
		fixture.componentRef.setInput('command', 'restore');
		const execution = fixture.componentInstance.execute();
		fixture.componentRef.setInput('context', {
			document: { ...document, uid: 'two' },
			noEdit: false,
		});
		pending.next({});
		pending.complete();
		await execution;
		expect(manager.reloadDocument).not.toHaveBeenCalled();
	});
	it('delegates notification toggling with the fresh subscription state', async () => {
		const { fixture, manager } = setup();
		fixture.componentRef.setInput('command', 'notifications');
		fixture.componentRef.setInput('context', { document: mutable, noEdit: false });
		const subscribed = { ...mutable, ng: { canNotify: true } };
		manager.getDocumentInfo.and.returnValue(of(subscribed));
		await fixture.componentInstance.execute();
		expect(manager.toggleNotification).toHaveBeenCalledOnceWith(subscribed);
		expect(manager.reloadDocument).toHaveBeenCalledOnceWith('one');
	});
	it('uses permissions instead of legacy optimistic write flags for mutations', () => {
		const context = {
			document: {
				...document,
				isTrashed: false,
				contextParameters: { permissions: ['Read'] },
				ng: { canWrite: true },
			},
			noEdit: false,
		};
		expect(canRunDocumentCommand(context, 'edit')).toBeFalse();
		expect(canRunDocumentCommand(context, 'trash')).toBeFalse();
		expect(canRunDocumentCommand(context, 'notifications')).toBeTrue();
		expect(canRunDocumentCommand({ ...context, noEdit: true }, 'notifications')).toBeFalse();
		expect(canRunDocumentCommand(context, 'publish')).toBeFalse();
		expect(canRunDocumentCommand({ document, noEdit: true }, 'restore')).toBeFalse();
		expect(
			canRunDocumentCommand(
				{ document: { ...document, hasLegalHold: true }, noEdit: false },
				'purge',
			),
		).toBeFalse();
	});
	it('allows version membership only for explicit standard headers, custom types included, and preserves protected/default rules', () => {
		for (const command of ['favorite', 'collect', 'clipboard'] as const) {
			for (const type of ['Note', 'Audio', 'Video', 'File', 'Picture', 'Collection', 'Folder']) {
				const version = { ...mutable, type, isVersion: true };
				expect(canRunDocumentCommand({ document: version, noEdit: false }, command))
					.withContext(type + ' default ' + command)
					.toBeFalse();
				// Stock hides Add to Clipboard on a version.
				expect(
					canRunDocumentCommand(
						{ document: version, noEdit: false, standardHeaderActions: true },
						command,
					),
				)
					.withContext(type + ' scoped ' + command)
					.toBe(command !== 'clipboard');
				expect(
					canRunDocumentCommand(
						{ document: version, noEdit: true, standardHeaderActions: true },
						command,
					),
				).toBeFalse();
				expect(
					canRunDocumentCommand(
						{
							document: { ...version, isTrashed: true },
							noEdit: false,
							standardHeaderActions: true,
						},
						command,
					),
				).toBeFalse();
			}
			for (const type of ['Custom']) {
				expect(
					canRunDocumentCommand(
						{
							document: { ...mutable, type, isVersion: true },
							noEdit: false,
							standardHeaderActions: true,
						},
						command,
					),
				)
					.withContext(type + ' ' + command)
					.toBe(command !== 'clipboard');
			}
		}
		const collection = {
			...mutable,
			type: 'Collection',
			isVersion: true,
			facets: ['Collection', 'NotCollectionMember'],
		};
		const context = { document: collection, noEdit: false, standardHeaderActions: true };
		// Stock: a version is never copied to the clipboard; the live collection is.
		expect(canRunDocumentCommand(context, 'clipboard')).toBeFalse();
		expect(
			canRunDocumentCommand(
				{ ...context, document: { ...collection, isVersion: false } },
				'clipboard',
			),
		).toBeTrue();
		expect(canRunDocumentCommand(context, 'favorite')).toBeFalse();
		expect(canRunDocumentCommand(context, 'collect')).toBeFalse();
		expect(
			canRunDocumentCommand(
				{ ...context, document: { ...collection, facets: ['NotCollectionMember'] } },
				'clipboard',
			),
		).toBeFalse();
	});
	it('uses fresh favorite membership for a scoped version and rejects newly unavailable membership', async () => {
		const { fixture, manager, collections } = setup();
		const version = { ...mutable, type: 'Note', isVersion: true };
		fixture.componentRef.setInput('command', 'favorite');
		fixture.componentRef.setInput('context', {
			document: version,
			noEdit: false,
			standardHeaderActions: true,
		});
		manager.getDocumentInfo.and.returnValue(
			of({ ...version, contextParameters: { favorites: { isFavorite: true } } }),
		);
		await fixture.componentInstance.execute();
		expect(collections.toggleFavoriteDocument).toHaveBeenCalledOnceWith(['one'], false, 'default');
		collections.toggleFavoriteDocument.calls.reset();
		manager.getDocumentInfo.and.returnValue(of({ ...version, facets: ['NotCollectionMember'] }));
		await fixture.componentInstance.execute();
		expect(collections.toggleFavoriteDocument).not.toHaveBeenCalled();
	});
	it('does not change scoped version membership after switching repositories during preflight', async () => {
		const { fixture, manager, collections } = setup();
		const version = { ...mutable, type: 'Note', isVersion: true, repository: 'one' };
		fixture.componentRef.setInput('command', 'favorite');
		fixture.componentRef.setInput('context', {
			document: version,
			noEdit: false,
			standardHeaderActions: true,
		});
		const response = new Subject<any>();
		manager.getDocumentInfo.and.returnValue(response);
		const pending = fixture.componentInstance.execute();
		fixture.componentRef.setInput('context', {
			document: { ...version, repository: 'two' },
			noEdit: false,
			standardHeaderActions: true,
		});
		response.next(version);
		response.complete();
		await pending;
		expect(collections.toggleFavoriteDocument).not.toHaveBeenCalled();
	});
	it('keeps scoped mutations and refreshes in their repository', async () => {
		const { fixture, manager, collections } = setup();
		const scoped = { ...mutable, type: 'Note', repository: 'archive' };
		fixture.componentRef.setInput('context', {
			document: scoped,
			noEdit: false,
			standardHeaderActions: true,
		});
		manager.getDocumentInfo.and.returnValue(of(scoped));
		for (const command of ['favorite', 'notifications', 'lock']) {
			fixture.componentRef.setInput('command', command);
			await fixture.componentInstance.execute();
		}
		expect(collections.toggleFavoriteDocument).toHaveBeenCalledOnceWith(['one'], true, 'archive');
		expect(manager.toggleNotification).toHaveBeenCalledOnceWith(scoped, 'archive');
		expect(manager.toggleLock).toHaveBeenCalledOnceWith(scoped, 'archive');
		expect(manager.reloadDocument).toHaveBeenCalledTimes(3);
		expect(manager.reloadDocument).toHaveBeenCalledWith('one', 'archive');
	});
	it('does not refresh the next route when a scoped mutation finishes late', async () => {
		const { fixture, manager } = setup();
		const scoped = { ...mutable, type: 'Note', repository: 'archive' };
		fixture.componentRef.setInput('command', 'lock');
		fixture.componentRef.setInput('context', {
			document: scoped,
			noEdit: false,
			standardHeaderActions: true,
		});
		manager.getDocumentInfo.and.returnValue(of(scoped));
		const mutation = new Subject<any>();
		manager.toggleLock.and.returnValue(mutation);
		const execution = fixture.componentInstance.execute();
		await Promise.resolve();
		fixture.componentRef.setInput('context', {
			document: { ...scoped, repository: 'other' },
			noEdit: false,
			standardHeaderActions: true,
		});
		mutation.next({});
		mutation.complete();
		await execution;
		expect(manager.reloadDocument).not.toHaveBeenCalled();
	});
});
