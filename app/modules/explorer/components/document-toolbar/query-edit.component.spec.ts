import { TestBed } from '@angular/core/testing';
import { WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import { of, throwError } from 'rxjs';
import { QueryBulkActionService } from 'app/modules/search/helpers/query-bulk-action.service';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { QueryEditComponent } from './query-edit.component';

describe('QueryEditComponent', () => {
	const scope = {
		repository: 'default',
		providerName: 'default_search',
		queryParams: [],
		namedParameters: { ecm_path: '["/work"]', quickFilters: 'mine' },
	};
	const context = (overrides: any = {}) => ({
		queryScope: scope,
		queryToken: 7,
		queryExclusions: ['excluded'],
		totalCount: 12,
		noEdit: false,
		busy: false,
		setBusy: jasmine.createSpy(),
		refresh: jasmine.createSpy().and.resolveTo(),
		...overrides,
	});
	it('reloads directory labels on a locale switch while retaining changes, and stops after closing', async () => {
		const choices = jasmine
			.createSpy('choices')
			.and.resolveTo([{ id: 'article', label: 'Article' }]);
		TestBed.configureTestingModule({
			imports: [QueryEditComponent],
			providers: [
				{ provide: QueryBulkActionService, useValue: {} },
				{ provide: DocumentLayoutGatewayService, useValue: { bulkDirectoryChoices: choices } },
			],
		});
		const fixture = TestBed.createComponent(QueryEditComponent);
		fixture.componentRef.setInput('context', context());
		fixture.detectChanges();
		const editor = fixture.componentInstance;
		await editor.open();
		editor.layoutContext.commit([{ property: 'dc:nature', mode: 'replace', value: 'article' }]);
		const initialCalls = choices.calls.count();
		TestBed.inject(WebUiLocale).setLocale('fr');
		fixture.detectChanges();
		await fixture.whenStable();
		expect(choices.calls.count()).toBeGreaterThan(initialCalls);
		expect(editor.changes).toEqual([{ property: 'dc:nature', mode: 'replace', value: 'article' }]);
		editor.close();
		const afterClose = choices.calls.count();
		TestBed.inject(WebUiLocale).setLocale('ar');
		fixture.detectChanges();
		await fixture.whenStable();
		expect(editor.editing()).toBeFalse();
		expect(choices.calls.count()).toBe(afterClose);
	});
	it('localizes a directory failure and recovers without clearing the draft', async () => {
		const choices = jasmine.createSpy('choices').and.rejectWith(new Error('offline'));
		TestBed.configureTestingModule({
			imports: [QueryEditComponent],
			providers: [
				{ provide: QueryBulkActionService, useValue: {} },
				{ provide: DocumentLayoutGatewayService, useValue: { bulkDirectoryChoices: choices } },
			],
		});
		const fixture = TestBed.createComponent(QueryEditComponent);
		fixture.componentRef.setInput('context', context());
		fixture.detectChanges();
		const editor = fixture.componentInstance;
		await editor.open();
		expect(editor.directoryError()).toContain('Directory choices');
		TestBed.inject(WebUiMessages).register('test', {
			fr: {
				'app.state.directory-choices-could-not-be-loaded-retry-b-5c648e':
					'Réessayer le répertoire.',
			},
		});
		TestBed.inject(WebUiLocale).setLocale('fr');
		expect(editor.directoryError()).toBe('Réessayer le répertoire.');
		editor.layoutContext.commit([{ property: 'dc:nature', mode: 'replace', value: 'literal-id' }]);
		choices.and.resolveTo([]);
		await editor.loadDirectories();
		expect(editor.directoryError()).toBe('');
		expect(editor.directoryLoading()).toBeFalse();
		expect(editor.changes[0].value).toBe('literal-id');
	});
	it('captures the provider query, exclusion ids and fields before submitting one BAF Document.Update job', async () => {
		const bulk = jasmine.createSpyObj<QueryBulkActionService>('bulk', [
			'update',
			'status',
			'abort',
		]);
		bulk.update.and.returnValue(of({ commandId: 'edit-job', state: 'RUNNING' }));
		bulk.status.and.returnValue(
			of({ commandId: 'edit-job', state: 'PARTIAL', processed: 11, errorCount: 1 }),
		);
		await TestBed.configureTestingModule({
			imports: [QueryEditComponent],
			providers: [
				{ provide: QueryBulkActionService, useValue: bulk },
				{
					provide: DocumentLayoutGatewayService,
					useValue: { bulkDirectoryChoices: async () => [{ id: 'nature', label: 'Nature' }] },
				},
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(QueryEditComponent);
		const c = context();
		fixture.componentRef.setInput('context', c);
		fixture.detectChanges();
		await fixture.componentInstance.open();
		fixture.componentInstance.layoutContext.commit([
			{ property: 'dc:subjects', mode: 'addValues', value: ['new'] },
		]);
		fixture.detectChanges();
		fixture.componentInstance.requestConfirmation();
		fixture.componentInstance.layoutContext.commit([
			{ property: 'dc:subjects', mode: 'addValues', value: ['changed-after-review'] },
		]);
		await fixture.componentInstance.start();
		fixture.detectChanges();
		expect(bulk.update).toHaveBeenCalledWith(
			scope,
			{
				properties: 'dc:subjects=["new"]\n',
				propertiesBehaviors: 'dc:subjects=append_excluding_duplicates\n',
			},
			['excluded'],
		);
		expect(c.refresh).toHaveBeenCalled();
		expect(fixture.nativeElement.textContent).toContain('1 failed');
	});
	it('fails closed when the captured scope or exclusions change before confirmation', async () => {
		const bulk = jasmine.createSpyObj<QueryBulkActionService>('bulk', [
			'update',
			'status',
			'abort',
		]);
		await TestBed.configureTestingModule({
			imports: [QueryEditComponent],
			providers: [
				{ provide: QueryBulkActionService, useValue: bulk },
				{
					provide: DocumentLayoutGatewayService,
					useValue: { bulkDirectoryChoices: async () => [] },
				},
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(QueryEditComponent);
		fixture.componentRef.setInput('context', context());
		fixture.detectChanges();
		await fixture.componentInstance.open();
		fixture.componentInstance.layoutContext.commit([
			{ property: 'dc:nature', mode: 'replace', value: 'nature' },
		]);
		fixture.componentRef.setInput('context', context({ queryToken: 8 }));
		fixture.componentInstance.requestConfirmation();
		await fixture.componentInstance.start();
		expect(bulk.update).not.toHaveBeenCalled();
		expect(fixture.componentInstance.error()).toContain('scope changed');
	});
	it('keeps an accepted job pending when status cannot be read and does not submit another one', async () => {
		const bulk = jasmine.createSpyObj<QueryBulkActionService>('bulk', [
			'update',
			'status',
			'abort',
		]);
		bulk.update.and.returnValue(of({ commandId: 'accepted', state: 'RUNNING' }));
		bulk.status.and.returnValue(throwError(() => new Error('offline')));
		await TestBed.configureTestingModule({
			imports: [QueryEditComponent],
			providers: [
				{ provide: QueryBulkActionService, useValue: bulk },
				{
					provide: DocumentLayoutGatewayService,
					useValue: { bulkDirectoryChoices: async () => [] },
				},
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(QueryEditComponent);
		fixture.componentRef.setInput('context', context());
		fixture.detectChanges();
		await fixture.componentInstance.open();
		fixture.componentInstance.layoutContext.commit([
			{ property: 'dc:nature', mode: 'replace', value: 'article' },
		]);
		fixture.componentInstance.requestConfirmation();
		await fixture.componentInstance.start();
		await fixture.componentInstance.open();
		fixture.detectChanges();
		expect(bulk.update).toHaveBeenCalledTimes(1);
		expect(fixture.componentInstance.pendingStatus()).toBeTrue();
		expect(fixture.componentInstance.error()).toContain('accepted');
		expect(fixture.nativeElement.textContent).toContain('Retry status');
		bulk.abort.and.returnValue(of({ commandId: 'accepted', state: 'ABORTED' }));
		([...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[])
			.find((button) => button.textContent?.includes('Abort job'))!
			.click();
		expect(bulk.abort).toHaveBeenCalledWith('default', 'accepted');
	});
});
