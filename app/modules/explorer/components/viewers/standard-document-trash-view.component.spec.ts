import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from 'app/helpers/auth.service';
import { ContentColumnHeaderComponent } from './content-column-header.component';
import { StandardDocumentTrashViewComponent } from './standard-document-trash-view.component';

describe('Standard document Trash scope', () => {
	const parent = (uid: string, repository = 'default') => ({
		uid,
		repository,
		path: '/parent/' + uid,
		type: 'Workspace',
		contextParameters: { permissions: ['RemoveChildren'] },
	});
	const row = (uid: string) => ({ uid, title: uid, isTrashed: true, properties: {} });
	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [StandardDocumentTrashViewComponent],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: AuthService, useValue: { userInfo: () => ({ id: 'test' }) } },
			],
		}).overrideComponent(StandardDocumentTrashViewComponent, { set: { template: '' } });
	});
	afterEach(() => TestBed.inject(HttpTestingController).verify());
	function setup(uid = 'parent', repository = 'default') {
		const fixture = TestBed.createComponent(StandardDocumentTrashViewComponent);
		fixture.componentRef.setInput('context', { document: parent(uid, repository), noEdit: false });
		fixture.detectChanges();
		return {
			fixture,
			component: fixture.componentInstance,
			http: TestBed.inject(HttpTestingController),
		};
	}
	const provider = (request: { url: string }) =>
		request.url.endsWith('/advanced_document_content/execute');
	it('requests direct children from the parent repository and ignores a late previous-parent response', async () => {
		const { fixture, component, http } = setup('first', 'other');
		const first = http.expectOne(provider);
		expect(first.request.params.get('ecm_parentId')).toBe('first');
		expect(first.request.params.get('ecm_trashed')).toBe('true');
		expect(first.request.params.get('pageSize')).toBe('40');
		expect(first.request.params.has('ecm_path')).toBeFalse();
		expect(first.request.headers.get('X-NXRepository')).toBe('other');
		fixture.componentRef.setInput('context', { document: parent('second'), noEdit: false });
		fixture.detectChanges();
		http
			.expectOne(provider)
			.flush({ entries: [row('second-child')], resultsCount: 1, isNextPageAvailable: false });
		await Promise.resolve();
		first.flush({ entries: [row('first-child')], resultsCount: 1, isNextPageAvailable: false });
		await fixture.whenStable();
		expect(component.rows().map((document) => document.uid)).toEqual(['second-child']);
		expect(component.loading()).toBeFalse();
		const context = component.selectionContext();
		expect(context.items).toBe(component.rows());
		expect(context.displayMode).toBe('table');
		expect(context.columns?.map((column) => column.field)).toEqual([
			'dc:title',
			'dc:modified',
			'dc:lastContributor',
		]);
		expect(context.queryScope).toEqual({
			repository: 'default',
			providerName: 'advanced_document_content',
			queryParams: [],
			namedParameters: { ecm_parentId: 'second', ecm_trashed: 'true' },
		});
	});
	it('describes the applied query, filters included, only once it has loaded', async () => {
		const { fixture, component, http } = setup('parent', 'other');
		http
			.expectOne(provider)
			.flush({ entries: [row('child')], resultsCount: 1, isNextPageAvailable: false });
		await fixture.whenStable();
		component.titleFilter.set('report');
		component.toggleAggregate('dc_modified_agg', 'last24h');
		expect(component.selectionContext().queryScope).toBeUndefined();
		const filtered = http.expectOne(provider);
		expect(filtered.request.params.get('title')).toBe('report*');
		filtered.flush({ entries: [], resultsCount: 0, isNextPageAvailable: false });
		await fixture.whenStable();
		expect(component.selectionContext().queryScope).toEqual({
			repository: 'other',
			providerName: 'advanced_document_content',
			queryParams: [],
			namedParameters: {
				ecm_parentId: 'parent',
				ecm_trashed: 'true',
				title: 'report*',
				dc_modified_agg: '["last24h"]',
			},
		});
	});
	it('keeps committed restore and purge removals out of an index-lag response', async () => {
		const { fixture, component, http } = setup();
		http.expectOne(provider).flush({
			entries: [row('restored'), row('remaining')],
			resultsCount: 2,
			isNextPageAvailable: false,
		});
		await fixture.whenStable();
		component.select(['restored']);
		const refresh = component.selectionContext().refresh(['restored']);
		http.expectOne(provider).flush({
			entries: [row('restored'), row('remaining')],
			resultsCount: 2,
			isNextPageAvailable: false,
		});
		await refresh;
		expect(component.rows().map((document) => document.uid)).toEqual(['remaining']);
		expect(component.total()).toBe(1);
		expect(component.selectedIds()).toEqual([]);
	});
	it('binds the folder View column header filters to the Trash filters', async () => {
		const { fixture, component, http } = setup();
		http.expectOne(provider).flush({ entries: [], resultsCount: 0, isNextPageAvailable: false });
		await fixture.whenStable();
		const columns = component.columns();
		expect(
			columns.every((column) => column.headerComponent === ContentColumnHeaderComponent),
		).toBeTrue();
		const { content, id } = columns.find(
			(column) => column.id === 'modified',
		)!.headerComponentParams;
		expect(id).toBe('modified');
		expect(content.titleFilter()).toBe('');
		expect(content.busy()).toBeFalse();
		content.toggleAggregate('dc_modified_agg', 'last24h');
		expect(component.selectedAggregates()['dc_modified_agg']).toEqual(['last24h']);
		expect(content.aggregateFilters()['dc_modified_agg']).toEqual(['last24h']);
		const reload = http.expectOne(provider);
		expect(reload.request.params.get('dc_modified_agg')).toBe('["last24h"]');
		reload.flush({ entries: [], resultsCount: 0, isNextPageAvailable: false });
		await fixture.whenStable();
	});
	it('resets the visible columns and the layout from the Columns Settings dialog', async () => {
		const { fixture, component, http } = setup();
		http.expectOne(provider).flush({ entries: [], resultsCount: 0, isNextPageAvailable: false });
		await fixture.whenStable();
		component.toggleColumn('version');
		component.changeColumnLayout([{ id: 'title', width: 300 }]);
		expect(component.columns().find((column) => column.id === 'version')?.hidden).toBeFalse();
		component.resetColumns();
		expect([...component.visibleColumns()]).toEqual(['title', 'modified', 'lastContributor']);
		expect(component.columnLayout()).toEqual([]);
	});
	it('refuses Empty Trash when fresh permissions have been revoked', async () => {
		const { fixture, component, http } = setup();
		http
			.expectOne(provider)
			.flush({ entries: [row('child')], resultsCount: 1, isNextPageAvailable: false });
		await fixture.whenStable();
		const empty = component.emptyTrash();
		http
			.expectOne((request) => request.url.endsWith('/repo/default/id/parent'))
			.flush({ ...parent('parent'), contextParameters: { permissions: [] } });
		await empty;
		http.expectNone((request) => request.method === 'POST');
		expect(component.rows().length).toBe(1);
		expect(component.error()).toContain('Permission');
		expect(component.busy()).toBeFalse();
	});
	it('adds translation metadata to date buckets while preserving contributors with the same ID', async () => {
		const { component, http, fixture } = setup();
		http.expectOne(provider).flush({
			entries: [],
			aggregations: {
				dc_modified_agg: { buckets: [{ key: 'lastWeek', docCount: 1 }] },
				dc_last_contributor_agg: {
					extendedBuckets: [
						{
							key: 'lastWeek',
							fetchedKey: {
								id: 'lastWeek',
								properties: { firstName: 'Customer', lastName: '{name}' },
							},
							docCount: 1,
						},
					],
				},
			},
		});
		await fixture.whenStable();
		expect(component.aggregations()['dc_modified_agg']?.[0].labelKey).toBe(
			'label.ui.aggregate.lastWeek',
		);
		expect(component.aggregations()['dc_last_contributor_agg']?.[0].labelKey).toBeUndefined();
		expect(component.aggregations()['dc_last_contributor_agg']?.[0].label).toBe('Customer {name}');
	});
});
