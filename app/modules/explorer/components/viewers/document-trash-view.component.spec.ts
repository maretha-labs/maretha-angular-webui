import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { ResultsSelectionContext, WebUiMessages } from '@maretha/webui-sdk';
import { DocumentTrashService } from '../../helpers/document-trash.service';
import { DocumentTrashViewComponent } from './document-trash-view.component';
import { canChangeTrash, TrashSelectionActionComponent } from './trash-selection-action.component';

const document = {
	uid: 'trashed',
	title: 'Test',
	isTrashed: true,
	contextParameters: { permissions: ['Write', 'Remove'] },
};
function context(): ResultsSelectionContext {
	return {
		document: { uid: 'folder', path: '/folder' },
		noEdit: false,
		selectedDocuments: [document],
		busy: false,
		setBusy: jasmine.createSpy('busy'),
		refresh: jasmine.createSpy('refresh').and.resolveTo(),
		reportError: jasmine.createSpy('error'),
	};
}
describe('Trash contributions', () => {
	it('requires permissions on every selected document and respects read-only and retention states', () => {
		expect(canChangeTrash(context(), 'restore')).toBeTrue();
		expect(canChangeTrash({ ...context(), noEdit: true }, 'restore')).toBeFalse();
		for (const extra of [
			{ contextParameters: { permissions: ['Read'] } },
			{ isTrashed: false },
			{ hasLegalHold: true },
		]) {
			expect(
				canChangeTrash(
					{ ...context(), selectedDocuments: [document, { ...document, ...extra }] },
					'purge',
				),
			).toBeFalse();
		}
		// The server's Everything grant covers Write and Remove.
		expect(
			canChangeTrash(
				{
					...context(),
					selectedDocuments: [{ ...document, contextParameters: { permissions: ['Everything'] } }],
				},
				'purge',
			),
		).toBeTrue();
	});
	it('reports typed messages for repository mismatch and denied actions without changing selection', async () => {
		const restore = jasmine.createSpy().and.returnValue(throwError(() => new Error('denied')));
		TestBed.configureTestingModule({
			providers: [
				{ provide: DocumentTrashService, useValue: { restoreDocumentsFromTrash: restore } },
			],
		});
		const f = TestBed.createComponent(TrashSelectionActionComponent);
		const value = {
			...context(),
			reportMessage: jasmine.createSpy('message'),
			selectedDocuments: [{ ...document, repository: 'other' }],
		};
		f.componentRef.setInput('context', value);
		f.componentRef.setInput('action', 'restore');
		await f.componentInstance.execute();
		expect(value.reportMessage).toHaveBeenCalledWith('selection.repository', jasmine.any(String));
		expect(restore).not.toHaveBeenCalled();
		f.componentRef.setInput('context', { ...value, reportMessage: undefined });
		await f.componentInstance.execute();
		expect(value.reportError).toHaveBeenCalled();
		f.componentRef.setInput('context', { ...value, selectedDocuments: [document] });
		await f.componentInstance.execute();
		expect(value.reportMessage).toHaveBeenCalledWith('trash.actionFailed', jasmine.any(String));
		expect(value.refresh).not.toHaveBeenCalled();
		f.componentRef.setInput('context', { ...value, busy: true });
		f.componentInstance.activate();
		await f.componentInstance.execute();
		expect(restore).toHaveBeenCalledTimes(1);
	});

	it('does nothing when the selection became ineligible before execution', async () => {
		const restore = jasmine.createSpy().and.returnValue(of({}));
		TestBed.configureTestingModule({
			providers: [
				{ provide: DocumentTrashService, useValue: { restoreDocumentsFromTrash: restore } },
			],
		});
		const fixture = TestBed.createComponent(TrashSelectionActionComponent);
		fixture.componentRef.setInput('context', { ...context(), selectedDocuments: [] });
		fixture.componentRef.setInput('action', 'restore');
		await fixture.componentInstance.execute();
		expect(restore).not.toHaveBeenCalled();
		// Restore needs no confirmation: activation executes straight away.
		fixture.componentRef.setInput('context', context());
		fixture.componentInstance.activate();
		await fixture.whenStable();
		expect(restore).toHaveBeenCalledTimes(1);
	});
	it('requires confirmation of the same selection before permanent deletion', async () => {
		const trash = { purgeDocuments: jasmine.createSpy().and.returnValue(of({})) };
		TestBed.configureTestingModule({
			providers: [{ provide: DocumentTrashService, useValue: trash }],
		});
		const fixture = TestBed.createComponent(TrashSelectionActionComponent);
		fixture.componentRef.setInput('context', context());
		fixture.componentRef.setInput('action', 'purge');
		await fixture.componentInstance.execute();
		expect(trash.purgeDocuments).not.toHaveBeenCalled();
		fixture.componentInstance.activate();
		fixture.componentRef.setInput('context', {
			...context(),
			selectedDocuments: [{ ...document, uid: 'other' }],
		});
		await fixture.componentInstance.execute();
		expect(trash.purgeDocuments).not.toHaveBeenCalled();
		fixture.componentInstance.activate();
		await fixture.componentInstance.execute();
		expect(trash.purgeDocuments).toHaveBeenCalledOnceWith(['other'], 'default');
	});
	it('releases the busy state and reports server refusal without clearing selection', async () => {
		const value = context();
		TestBed.configureTestingModule({
			providers: [
				{
					provide: DocumentTrashService,
					useValue: { restoreDocumentsFromTrash: () => throwError(() => new Error('403')) },
				},
			],
		});
		const fixture = TestBed.createComponent(TrashSelectionActionComponent);
		fixture.componentRef.setInput('context', value);
		fixture.componentRef.setInput('action', 'restore');
		await fixture.componentInstance.execute();
		expect(value.setBusy).toHaveBeenCalledWith(true);
		expect(value.setBusy).toHaveBeenCalledWith(false);
		expect(value.reportError).toHaveBeenCalled();
		expect(value.refresh).not.toHaveBeenCalled();
	});
	it('refreshes the viewed document after restoring that selected document', async () => {
		const value = {
			...context(),
			document: { ...document },
			refreshDocument: jasmine.createSpy('refreshDocument'),
		};
		TestBed.configureTestingModule({
			providers: [
				{
					provide: DocumentTrashService,
					useValue: { restoreDocumentsFromTrash: () => of({}) },
				},
			],
		});
		const fixture = TestBed.createComponent(TrashSelectionActionComponent);
		fixture.componentRef.setInput('context', value);
		fixture.componentRef.setInput('action', 'restore');
		await fixture.componentInstance.execute();
		expect(value.refresh).toHaveBeenCalledWith(['trashed']);
		expect(value.refreshDocument).toHaveBeenCalledTimes(1);
	});
	it('retries the failed page and ignores obsolete folder responses', async () => {
		const first = new Subject<any>();
		const loadMore = jasmine.createSpy().and.returnValues(
			first,
			of({ entries: [document], isNextPageAvailable: true }),
			throwError(() => new Error('offline')),
			of({ entries: [{ ...document, uid: 'second' }], isNextPageAvailable: false }),
		);
		TestBed.configureTestingModule({
			providers: [{ provide: DocumentTrashService, useValue: { loadMore } }],
		});
		const fixture = TestBed.createComponent(DocumentTrashViewComponent);
		fixture.componentRef.setInput('context', context());
		fixture.detectChanges();
		fixture.componentRef.setInput('context', {
			...context(),
			document: { uid: 'next', path: '/next' },
		});
		fixture.detectChanges();
		first.next({ entries: [{ uid: 'obsolete' }] });
		first.complete();
		await fixture.whenStable();
		expect(fixture.componentInstance.rows().map((row) => row.uid)).toEqual(['trashed']);
		fixture.componentInstance.loadMore();
		await fixture.whenStable();
		expect(fixture.componentInstance.error()).toContain('could not');
		fixture.componentInstance.retry();
		await fixture.whenStable();
		expect(loadMore.calls.allArgs()).toEqual([
			['/folder', 0],
			['/next', 0],
			['/next', 1],
			['/next', 1],
		]);
		expect(fixture.componentInstance.rows().map((row) => row.uid)).toEqual(['trashed', 'second']);
		const actions = fixture.componentInstance.selectionContext();
		expect(actions.items).toBe(fixture.componentInstance.rows());
		expect(actions.displayMode).toBe('table');
		expect(actions.columns?.map((column) => column.field)).toEqual(['dc:title', 'dc:modified']);
		expect(actions.queryScope).toEqual({
			repository: 'default',
			providerName: 'default_trash_search',
			queryParams: [],
			namedParameters: { ecm_path: '["/next"]' },
		});
		actions.setBusy(true);
		expect(fixture.componentInstance.busy()).toBeTrue();
		actions.reportMessage?.('fixture.trash', 'Cannot restore {name}', {
			name: 'Customer {literal}',
		});
		const messages = TestBed.inject(WebUiMessages);
		messages.register('trash-test', {
			fr: { 'fixture.trash': 'Restauration impossible : {name}' },
		});
		messages.locale.set('fr');
		expect(fixture.componentInstance.error()).toBe('Restauration impossible : Customer {literal}');
		actions.reportError('Customer server error');
		messages.locale.set('en-US');
		expect(fixture.componentInstance.error()).toBe('Customer server error');
	});
	it('suppresses an immediate stale restore result but permits a later manual refresh', async () => {
		TestBed.configureTestingModule({
			providers: [
				{
					provide: DocumentTrashService,
					useValue: {
						loadMore: () => of({ entries: [document], isNextPageAvailable: false }),
					},
				},
			],
		});
		const fixture = TestBed.createComponent(DocumentTrashViewComponent);
		fixture.componentRef.setInput('context', context());
		fixture.detectChanges();
		await fixture.whenStable();
		await fixture.componentInstance.selectionContext().refresh(['trashed']);
		expect(fixture.componentInstance.rows()).toEqual([]);
		fixture.componentInstance.reload();
		await fixture.whenStable();
		expect(fixture.componentInstance.rows().map((row) => row.uid)).toEqual(['trashed']);
	});
});
