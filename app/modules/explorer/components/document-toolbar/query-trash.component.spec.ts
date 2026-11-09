import { TestBed } from '@angular/core/testing';
import { WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { QueryBulkActionService } from 'app/modules/search/helpers/query-bulk-action.service';
import { QueryTrashComponent } from './query-trash.component';

describe('QueryTrashComponent', () => {
	const scope = {
		repository: 'default',
		providerName: 'default_search',
		queryParams: [],
		namedParameters: { ecm_fulltext: 'draft' },
	};
	function context(overrides: any = {}) {
		return {
			queryScope: scope,
			totalCount: 2,
			noEdit: false,
			busy: false,
			setBusy: jasmine.createSpy(),
			refresh: jasmine.createSpy().and.resolveTo(),
			...overrides,
		};
	}
	it('preserves a customer label and resolves an explicit label key in the selected locale', () => {
		TestBed.configureTestingModule({
			imports: [QueryTrashComponent],
			providers: [{ provide: QueryBulkActionService, useValue: {} }],
		});
		const fixture = TestBed.createComponent(QueryTrashComponent);
		fixture.componentRef.setInput('context', context());
		fixture.componentRef.setInput('label', 'Customer archive');
		TestBed.inject(WebUiMessages).register('test', { fr: { 'customer.archive': 'Archiver' } });
		TestBed.inject(WebUiLocale).setLocale('fr');
		fixture.detectChanges();
		expect(fixture.componentInstance.labelText()).toBe('Customer archive');
		fixture.componentRef.setInput('labelKey', 'customer.archive');
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Archiver');
		fixture.componentRef.setInput('operation', 'restore');
		expect(fixture.componentInstance.confirmationVerb()).toBe('Restore');
		fixture.componentRef.setInput('operation', 'trash');
		expect(fixture.componentInstance.confirmationVerb()).toBe('Move');
	});
	it('retains a pending receipt when abort fails and translates its error until retry succeeds', async () => {
		const bulk = jasmine.createSpyObj<QueryBulkActionService>('bulk', ['trash', 'status', 'abort']);
		bulk.trash.and.returnValue(of({ commandId: 'job', state: 'RUNNING' }));
		bulk.status.and.returnValue(throwError(() => new Error('offline')));
		bulk.abort.and.returnValue(throwError(() => new Error('offline')));
		TestBed.configureTestingModule({
			imports: [QueryTrashComponent],
			providers: [{ provide: QueryBulkActionService, useValue: bulk }],
		});
		const fixture = TestBed.createComponent(QueryTrashComponent);
		fixture.componentRef.setInput('context', context());
		fixture.detectChanges();
		const action = fixture.componentInstance;
		await action.abort();
		expect(bulk.abort).not.toHaveBeenCalled();
		action.open();
		await action.start();
		await action.abort();
		expect(action.error()).toContain('could not abort');
		TestBed.inject(WebUiMessages).register('test', {
			fr: {
				'app.state.the-server-could-not-abort-this-job-db90a8': 'Annulation impossible.',
			},
		});
		TestBed.inject(WebUiLocale).setLocale('fr');
		expect(action.error()).toBe('Annulation impossible.');
		expect(action.commandId()).toBe('job');
		bulk.abort.and.returnValue(of({ commandId: 'job', state: 'ABORTED' }));
		await action.abort();
		expect(action.status()).toBe('Abort requested.');
		expect(bulk.trash).toHaveBeenCalledTimes(1);
	});
	it('captures scope on open and refuses confirmation after filters change', async () => {
		const bulk = jasmine.createSpyObj<QueryBulkActionService>('bulk', ['trash', 'status', 'abort']);
		TestBed.configureTestingModule({
			imports: [QueryTrashComponent],
			providers: [{ provide: QueryBulkActionService, useValue: bulk }],
		});
		const fixture = TestBed.createComponent(QueryTrashComponent);
		const c = context();
		fixture.componentRef.setInput('context', c);
		fixture.detectChanges();
		fixture.componentInstance.open();
		fixture.componentRef.setInput(
			'context',
			context({ queryScope: { ...scope, namedParameters: { ecm_fulltext: 'changed' } } }),
		);
		await fixture.componentInstance.start();
		fixture.detectChanges();
		expect(bulk.trash).not.toHaveBeenCalled();
		expect(fixture.nativeElement.textContent).toContain('scope changed');
	});
	it('fails closed for an empty query without opening a confirmation', () => {
		const bulk = jasmine.createSpyObj<QueryBulkActionService>('bulk', ['trash', 'status', 'abort']);
		TestBed.configureTestingModule({
			imports: [QueryTrashComponent],
			providers: [{ provide: QueryBulkActionService, useValue: bulk }],
		});
		const fixture = TestBed.createComponent(QueryTrashComponent);
		fixture.componentRef.setInput('context', context({ totalCount: 0 }));
		fixture.detectChanges();
		fixture.componentInstance.open();
		expect(fixture.componentInstance.confirm()).toBeFalse();
		expect(bulk.trash).not.toHaveBeenCalled();
		expect(
			(fixture.nativeElement.querySelector('button') as HTMLButtonElement).disabled,
		).toBeTrue();
	});
	it('keeps an accepted command receipt when later polling fails', async () => {
		const bulk = jasmine.createSpyObj<QueryBulkActionService>('bulk', ['trash', 'status', 'abort']);
		bulk.trash.and.returnValue(of({ commandId: 'job', state: 'RUNNING' }));
		bulk.status.and.returnValue(throwError(() => new Error('offline')));
		TestBed.configureTestingModule({
			imports: [QueryTrashComponent],
			providers: [{ provide: QueryBulkActionService, useValue: bulk }],
		});
		const fixture = TestBed.createComponent(QueryTrashComponent);
		fixture.componentRef.setInput('context', context());
		fixture.detectChanges();
		fixture.componentInstance.open();
		await fixture.componentInstance.start();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('accepted');
		expect(bulk.trash).toHaveBeenCalledTimes(1);
	});
	it('calls an uncertain 5xx submission outcome unknown', async () => {
		const bulk = jasmine.createSpyObj<QueryBulkActionService>('bulk', ['trash', 'status', 'abort']);
		bulk.trash.and.returnValue(throwError(() => ({ status: 503 })));
		TestBed.configureTestingModule({
			imports: [QueryTrashComponent],
			providers: [{ provide: QueryBulkActionService, useValue: bulk }],
		});
		const fixture = TestBed.createComponent(QueryTrashComponent);
		fixture.componentRef.setInput('context', context());
		fixture.detectChanges();
		fixture.componentInstance.open();
		await fixture.componentInstance.start();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('outcome is unknown');
	});
	it('reports an unavailable automationUi capability instead of falling back to client enumeration', async () => {
		const bulk = jasmine.createSpyObj<QueryBulkActionService>('bulk', ['trash', 'status', 'abort']);
		bulk.trash.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
		TestBed.configureTestingModule({
			imports: [QueryTrashComponent],
			providers: [{ provide: QueryBulkActionService, useValue: bulk }],
		});
		const fixture = TestBed.createComponent(QueryTrashComponent);
		fixture.componentRef.setInput('context', context());
		fixture.detectChanges();
		fixture.componentInstance.open();
		await fixture.componentInstance.start();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Bulk.RunAction endpoint was not found');
		expect(bulk.trash).toHaveBeenCalledTimes(1);
	});
	it('refreshes after a terminal partial job and releases the toolbar', async () => {
		const bulk = jasmine.createSpyObj<QueryBulkActionService>('bulk', ['trash', 'status', 'abort']);
		bulk.trash.and.returnValue(of({ commandId: 'job', state: 'RUNNING' }));
		bulk.status.and.returnValue(
			of({ commandId: 'job', state: 'PARTIAL', processed: 1, errorCount: 1 }),
		);
		TestBed.configureTestingModule({
			imports: [QueryTrashComponent],
			providers: [{ provide: QueryBulkActionService, useValue: bulk }],
		});
		const fixture = TestBed.createComponent(QueryTrashComponent);
		const c = context({ queryToken: 9 });
		fixture.componentRef.setInput('context', c);
		fixture.detectChanges();
		fixture.componentInstance.open();
		await fixture.componentInstance.start();
		expect(c.refresh).toHaveBeenCalledTimes(1);
		expect(c.setBusy.calls.allArgs()).toEqual([[true], [false]]);
	});
});
