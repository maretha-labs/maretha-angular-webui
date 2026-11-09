import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResultsToolbarContext } from '@maretha/webui-sdk';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { SpreadsheetRow } from './results-spreadsheet';
import { ResultsSpreadsheetComponent } from './results-spreadsheet.component';

const schemas = [
	{
		name: 'dublincore',
		prefix: 'dc',
		fields: {
			title: 'string',
			nature: {
				type: 'string',
				constraints: [{ name: 'directoryResolver', parameters: { directory: 'nature' } }],
			},
		},
	},
];
const writable: SpreadsheetRow = {
	uid: 'doc-1',
	changeToken: '1',
	properties: { 'dc:title': 'Contract', 'dc:nature': 'article' },
	contextParameters: { permissions: ['Read', 'Write'] },
};
const readable: SpreadsheetRow = {
	uid: 'doc-2',
	changeToken: '1',
	properties: { 'dc:title': 'Policy', 'dc:nature': null },
	contextParameters: { permissions: ['Read'] },
};

describe('Results spreadsheet editor', () => {
	let fixture: ComponentFixture<ResultsSpreadsheetComponent>;
	let http: HttpTestingController;
	let gateway: jasmine.SpyObj<
		Pick<DocumentLayoutGatewayService, 'update' | 'bulkDirectoryChoices'>
	>;
	let refresh: jasmine.Spy;
	const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
	const component = () => fixture.componentInstance;
	const field = (name: string) =>
		component()
			.fields()
			.find((entry) => entry.field === name)!;

	beforeEach(() => {
		gateway = jasmine.createSpyObj('gateway', ['update', 'bulkDirectoryChoices']);
		gateway.bulkDirectoryChoices.and.resolveTo([
			{ id: 'article', label: 'Article' },
			{ id: 'report', label: 'Report' },
		]);
		TestBed.configureTestingModule({
			imports: [ResultsSpreadsheetComponent],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: DocumentLayoutGatewayService, useValue: gateway },
			],
		});
		http = TestBed.inject(HttpTestingController);
		refresh = jasmine.createSpy('refresh').and.resolveTo();
		fixture = TestBed.createComponent(ResultsSpreadsheetComponent);
		fixture.componentRef.setInput('context', {
			busy: false,
			totalCount: 2,
			queryScope: {
				repository: 'default',
				providerName: 'default_search',
				queryParams: ['p1'],
				namedParameters: { ecm_fulltext: 'contract' },
			},
			columns: [
				{ field: 'dc:title', label: 'Title' },
				{ field: 'dc:nature', label: 'Nature' },
			],
			refresh,
		} as unknown as ResultsToolbarContext);
		fixture.detectChanges();
	});
	afterEach(() => {
		if (component().opened()) {
			component().dirty.clear();
			component().close();
		}
		http.verify();
	});

	async function open(): Promise<void> {
		const opening = component().open();
		http.expectOne((request) => request.url.endsWith('/config/schemas')).flush(schemas);
		const first = http.expectOne((request) =>
			request.url.endsWith('/search/pp/default_search/execute'),
		);
		expect(first.request.params.get('currentPageIndex')).toBe('0');
		expect(first.request.params.getAll('queryParams')).toEqual(['p1']);
		expect(first.request.params.get('ecm_fulltext')).toBe('contract');
		expect(first.request.headers.get('X-NXRepository')).toBe('default');
		expect(first.request.headers.get('enrichers-document')).toBe('permissions');
		first.flush({ entries: [writable], isNextPageAvailable: true });
		await tick();
		const second = http.expectOne((request) => request.params.get('currentPageIndex') === '1');
		second.flush({ entries: [readable], isNextPageAvailable: false });
		await opening;
		fixture.detectChanges();
		await fixture.whenStable();
	}

	it('loads every page of the applied query into an editable grid', async () => {
		await open();
		const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
		expect(dialog.open).toBeTrue();
		expect(
			component()
				.rows()
				.map((row) => row.uid),
		).toEqual(['doc-1', 'doc-2']);
		expect(dialog.textContent).toContain('Title');
		expect(dialog.textContent).toContain('Nature');
		expect(gateway.bulkDirectoryChoices).toHaveBeenCalledOnceWith('nature', false);
		const nature = component().columnDefs()[1];
		expect(nature.cellEditor).toBe('agSelectCellEditor');
		expect(nature.cellEditorParams).toEqual({ values: ['', 'article', 'report'] });
		const editable = component().columnDefs()[0].editable as (params: unknown) => boolean;
		expect(editable({ data: writable })).toBeTrue();
		expect(editable({ data: readable })).toBeFalse();
	});

	it('saves only changed documents with their change token, then refreshes on close', async () => {
		await open();
		expect(component().setValue(writable, field('dc:title'), 'Contract')).toBeFalse();
		expect(component().setValue(writable, field('dc:title'), 'Renamed')).toBeTrue();
		expect(component().displayValue(writable, field('dc:title'))).toBe('Renamed');
		const updated = {
			...writable,
			changeToken: '2',
			properties: { ...writable.properties, 'dc:title': 'Renamed' },
		};
		gateway.update.and.resolveTo(updated as never);
		await component().save();
		expect(gateway.update).toHaveBeenCalledOnceWith(
			writable as never,
			{ 'dc:title': 'Renamed' },
			'default',
		);
		expect(component().dirty.size).toBe(0);
		expect(component().rows()[0]).toBe(updated);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('1 rows saved');
		await component().save();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Everything up to date');
		component().close();
		expect(refresh).toHaveBeenCalledTimes(1);
		expect((fixture.nativeElement.querySelector('dialog') as HTMLDialogElement).open).toBeFalse();
	});

	it('keeps failed changes and asks before discarding them', async () => {
		await open();
		component().setValue(writable, field('dc:nature'), 'report');
		component().setValue(writable, field('dc:nature'), 'article');
		expect(component().dirty.size).toBe(0);
		component().setValue(writable, field('dc:nature'), 'report');
		gateway.update.and.rejectWith(new Error('conflict'));
		await component().save();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
			'Failed to save changes',
		);
		expect(component().dirty.get('doc-1')).toEqual({ 'dc:nature': 'report' });
		const confirm = spyOn(window, 'confirm').and.returnValue(false);
		component().close();
		expect(confirm).toHaveBeenCalled();
		expect(component().opened()).toBeTrue();
		confirm.and.returnValue(true);
		component().close();
		expect(component().opened()).toBeFalse();
		expect(refresh).not.toHaveBeenCalled();
	});

	it('saves each change when autosave is on', async () => {
		await open();
		component().autosave.set(true);
		gateway.update.and.resolveTo(writable as never);
		component().setValue(writable, field('dc:title'), 'Autosaved');
		await tick();
		expect(gateway.update).toHaveBeenCalledOnceWith(
			writable as never,
			{ 'dc:title': 'Autosaved' },
			'default',
		);
	});

	it('reports a failed load and leaves directory fields read-only without choices', async () => {
		gateway.bulkDirectoryChoices.and.rejectWith(new Error('offline'));
		await open();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Directory choices could not be loaded');
		const editable = component().columnDefs()[1].editable as (params: unknown) => boolean;
		expect(editable({ data: writable })).toBeFalse();
		spyOn(window, 'confirm').and.returnValue(true);
		component().close();
		const opening = component().open();
		http
			.expectOne((request) => request.url.endsWith('/config/schemas'))
			.flush('', {
				status: 500,
				statusText: 'Server Error',
			});
		http.expectOne((request) => request.url.endsWith('/execute')).flush({ entries: [] });
		await opening;
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Failed to fetch results');
	});
});
