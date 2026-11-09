import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';

import { SearchComponent } from './search-pane.component';

describe('SearchComponent', () => {
	let component: SearchComponent;
	let fixture: ComponentFixture<SearchComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [SearchComponent],
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(SearchComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	function renderDefaultForm() {
		const service = (component as any).documentSearchService;
		const provider = {
			key: 'default_search',
			enabled: true,
			fields: {
				ecm_fulltext: { value: '', type: 'string' },
				ecm_collections: { value: [], type: 'collection' },
				ecm_tags: { value: [], type: 'tag' },
			},
			aggregations: {
				dc_modified_agg: {
					type: 'date_range',
					selection: [],
					buckets: [{ key: 'last24h', docCount: 2 }],
				},
			},
			quickFilters: {},
		};
		spyOn(service, 'getSavedSearches').and.returnValue(of([]));
		spyOn(service, 'getUserCollections').and.returnValue(of([]));
		service._pageProviders = { default_search: provider };
		service._pageProvidersUpdated.set(service._pageProviders);
		service.pageProviderChanged$.next(provider);
		fixture.detectChanges();
	}

	it('keeps the saved-search selector and queue action in one default form header with automatic search enabled', () => {
		renderDefaultForm();
		const header = fixture.nativeElement.querySelector('.stock-search-heading') as HTMLElement;
		expect(header.querySelector('label[for="default-saved-search"]')?.textContent).toContain(
			'Search Filters',
		);
		expect(header.querySelector('ng-select input')?.id).toBe('default-saved-search');
		const openQueue = spyOn(component, 'openQueue');
		(header.querySelector('.stock-search-heading__queue') as HTMLButtonElement).click();
		expect(openQueue).toHaveBeenCalledTimes(1);
		expect(fixture.nativeElement.querySelector('.auto-search-toggle')).toBeNull();
		expect(component.autoSearch).toBeTrue();
		expect(fixture.nativeElement.querySelector('.stock-reset fa-icon')).toBeNull();
		expect(
			(fixture.nativeElement.querySelector('.stock-reset') as HTMLButtonElement).disabled,
		).toBe(false);
	});

	it('submits text on Enter and facets automatically while the default auto-search control is hidden', fakeAsync(() => {
		renderDefaultForm();
		spyOnProperty((component as any).router, 'url', 'get').and.returnValue('/search/default');
		const publish = spyOn(component as any, 'publishSearchParameters');
		const input = fixture.nativeElement.querySelector('#core-fulltext') as HTMLInputElement;
		input.value = 'contract';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		tick(700);
		expect(publish).toHaveBeenCalledTimes(1);
		expect(publish.calls.mostRecent().args[0]).toEqual(
			jasmine.objectContaining({
				searchFields: jasmine.objectContaining({ ecm_fulltext: 'contract' }),
			}),
		);

		input.value = 'amended contract';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		tick(700);
		expect(publish).toHaveBeenCalledTimes(1);

		(fixture.nativeElement.querySelector('.stock-facet summary') as HTMLElement).click();
		(fixture.nativeElement.querySelector('.stock-facet input') as HTMLInputElement).click();
		tick(700);
		expect(publish).toHaveBeenCalledTimes(2);
		expect(publish.calls.mostRecent().args[0]).toEqual(
			jasmine.objectContaining({
				customFilters: jasmine.objectContaining({ dc_modified_agg: ['last24h'] }),
				searchFields: jasmine.objectContaining({ ecm_fulltext: 'amended contract' }),
			}),
		);

		(fixture.nativeElement.querySelector('.stock-reset') as HTMLButtonElement).click();
		tick(700);
		expect(publish).toHaveBeenCalledTimes(3);
		expect(component.parentSearchForm!.get('local')!.value).toBeFalse();
		expect(component.parentSearchForm!.get(['searchFields', 'ecm_fulltext'])!.value).toBeFalsy();
		expect(component.parentSearchForm!.get(['customFilters', 'dc_modified_agg'])!.value).toEqual(
			[],
		);
	}));

	it('initializes the default drawer without publishing a duplicate results query', fakeAsync(() => {
		spyOnProperty((component as any).router, 'url', 'get').and.returnValue('/search/default');
		const publish = spyOn(component as any, 'publishSearchParameters');
		renderDefaultForm();
		tick(700);
		expect(publish).not.toHaveBeenCalled();
	}));

	it('waits for Enter when the user types immediately after the default drawer initializes', fakeAsync(() => {
		spyOnProperty((component as any).router, 'url', 'get').and.returnValue('/search/default');
		const publish = spyOn(component as any, 'publishSearchParameters');
		renderDefaultForm();
		const input = fixture.nativeElement.querySelector('#core-fulltext') as HTMLInputElement;
		input.value = 'contract';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		tick(700);
		expect(publish).not.toHaveBeenCalled();
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		tick(700);
		expect(publish).toHaveBeenCalledTimes(1);
	}));

	it('keeps mirrored saved-search facets as the baseline while the user edits only text', fakeAsync(() => {
		spyOnProperty((component as any).router, 'url', 'get').and.returnValue(
			'/search/default/saved-1',
		);
		const publish = spyOn(component as any, 'publishSearchParameters');
		renderDefaultForm();
		const service = (component as any).documentSearchService;
		service.selectedSavedSearch.set({
			id: 'saved-1',
			title: 'Recent contracts',
			params: { ecm_fulltext: 'contract', dc_modified_agg: ['last24h'] },
		});
		TestBed.tick();
		const input = fixture.nativeElement.querySelector('#core-fulltext') as HTMLInputElement;
		input.value = 'amended contract';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		tick(700);
		expect(publish).not.toHaveBeenCalled();
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		tick(700);
		expect(publish).toHaveBeenCalledTimes(1);
	}));

	it('explicitly closes an open search instead of toggling it back open', () => {
		const service = (component as any).documentSearchService;
		service.showSearchPaneVisibility();
		expect(service.searchPaneVisibility()).toBeTrue();
		component.closeSearchPane();
		expect(service.searchPaneVisibility()).toBeFalse();
	});

	it('asks for its facets when the drawer opens, never while the search queue replaces the form', fakeAsync(() => {
		const service = (component as any).documentSearchService;
		const loadFilters = spyOn(service, 'loadFilters').and.returnValue(of(null));
		service.showSearchPaneVisibility();
		TestBed.tick();
		tick();
		expect(loadFilters).toHaveBeenCalledTimes(1);
		service.hideSearchPaneVisibility();
		TestBed.tick();
		tick();
		(component as any).queueActive = () => true;
		service.showSearchPaneVisibility();
		TestBed.tick();
		tick();
		expect(loadFilters).toHaveBeenCalledTimes(1);
	}));

	it('does not replace folder contents when the drawer initializes its form', fakeAsync(() => {
		const router = (component as any).router;
		spyOnProperty(router, 'url', 'get').and.returnValue('/browse/audit-folder');
		const publish = spyOn(component as any, 'publishSearchParameters');
		component.parentSearchForm!.get('local')!.setValue(false);
		tick(700);
		expect(publish).not.toHaveBeenCalled();
	}));

	it('publishes the search before routing to the results page from a document', () => {
		readySavedSearch();
		const router = (component as any).router;
		spyOnProperty(router, 'url', 'get').and.returnValue('/browse/audit-folder');
		const navigate = spyOn(router, 'navigate').and.resolveTo(true);
		const publish = spyOn(component as any, 'publishSearchParameters');
		component.search();
		expect(publish).toHaveBeenCalledOnceWith(component.parentSearchForm!.getRawValue());
		expect(navigate).toHaveBeenCalledOnceWith(['/search/default']);
	});

	it('routes to the selected saved search once and not while the URL already names it', () => {
		readySavedSearch();
		const router = (component as any).router;
		const url = spyOnProperty(router, 'url', 'get').and.returnValue('/browse/audit-folder');
		const navigate = spyOn(router, 'navigate').and.resolveTo(true);
		component.restoreSavedSearch({ id: 'saved-1', title: 'Drafts', params: { local: false } });
		component.search();
		expect(navigate).toHaveBeenCalledOnceWith(['/search/default', 'saved-1']);
		url.and.returnValue('/search/default/saved-1');
		component.search();
		expect(navigate).toHaveBeenCalledTimes(1);
	});

	function readySavedSearch() {
		component.parentSearchForm = new FormGroup({
			local: new FormControl(true),
			searchFields: new FormGroup({ title: new FormControl('draft') }),
			customFilters: new FormGroup({}),
			quickFilters: new FormGroup({}),
		});
		component.savedSearches = [];
		component.currentPageProviderKey = 'default_search';
		component.savedSearchesForm.setValue({ title: 'Drafts' });
		return (component as any).documentSearchService;
	}

	it('renders a saved-search success state and prevents a double create submission', () => {
		const service = readySavedSearch();
		const pending = new Subject<any>();
		spyOn(service, 'saveSearch').and.returnValue(pending);
		component.saveSearch();
		component.saveSearch();
		expect(service.saveSearch).toHaveBeenCalledTimes(1);
		pending.next({ id: 'saved-1', title: 'Drafts' });
		pending.complete();
		fixture.detectChanges();
		expect(component.savedSearchStatus).toContain('Saved Drafts.');
	});

	it('renders a persistence failure and accepts saved searches without quick filters', () => {
		const service = readySavedSearch();
		spyOn(service, 'saveSearch').and.returnValue(throwError(() => new Error('forbidden')));
		component.saveSearch();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
			'Unable to save',
		);
		component.restoreSavedSearch({ id: 'saved-1', title: 'Imported', params: { local: false } });
		expect(component.selectedSavedSearch?.id).toBe('saved-1');
		component.restoreSavedSearch({ id: 'bad', title: 'Bad', params: null });
		expect(component.savedSearchError).toContain('invalid');
	});

	it('validates sharing permission before it sends the automation request', () => {
		const service = readySavedSearch();
		component.selectedSavedSearch = { id: 'saved-1', title: 'Drafts', params: {} };
		component.sharePrincipal = 'marketing';
		spyOn(service, 'getSavedSearchPermissions').and.returnValue(
			of({ contextParameters: { permissions: [] } }),
		);
		spyOn(service, 'shareSavedSearch');
		component.shareSavedSearch();
		expect(service.shareSavedSearch).not.toHaveBeenCalled();
		expect(component.savedSearchError).toContain('Unable to share');
	});

	it('uses the WriteSecurity grant and snapshots notify before its permission read completes', () => {
		const service = readySavedSearch();
		const permissions = new Subject<any>();
		component.selectedSavedSearch = { id: 'saved-1', title: 'Drafts', params: {} };
		component.sharePrincipal = 'marketing';
		component.shareNotify = true;
		spyOn(service, 'getSavedSearchPermissions').and.returnValue(permissions);
		spyOn(service, 'shareSavedSearch').and.returnValue(of({}));
		component.shareSavedSearch();
		component.shareNotify = false;
		permissions.next({ contextParameters: { permissions: ['WriteSecurity'] } });
		permissions.complete();
		expect(service.shareSavedSearch).toHaveBeenCalledWith('saved-1', 'marketing', true);
	});

	it('opens save-as on request, resolves tag suggestions, and updates page providers', fakeAsync(() => {
		const service = readySavedSearch();
		const manager = (component as any).documentsManagerService;
		spyOn(manager, 'suggestTag').and.returnValue(
			of([{ id: 'tag-1', displayLabel: 'Tag One' }, { invalid: true }]),
		);
		component.tagInput$.next('  tag ');
		tick(350);
		expect(component.tagSuggestions).toEqual([{ id: 'tag-1', label: 'Tag One' }]);
		expect(component.tagsLoading).toBeFalse();

		service.saveAsOpen.set(true);
		TestBed.tick();
		expect(component.savedSearchDialog).toBe('save');
		component.closeSavedSearchDialog();

		const providers = {
			default_search: { enabled: true, fields: {}, aggregations: {}, quickFilters: {} } as any,
			nxql_search: { enabled: true, fields: {}, aggregations: {}, quickFilters: {} } as any,
			disabled_pp: { enabled: false, fields: {}, aggregations: {}, quickFilters: {} } as any,
		};
		(service as any)._pageProviders = providers;
		(service as any)._pageProvidersUpdated.set(providers);
		TestBed.tick();
		expect(Object.keys(component.pageProviders)).toEqual(['default_search', 'nxql_search']);

		spyOn(service, 'getSavedSearches').and.returnValue(of([{ id: 's1', title: 'S1', params: {} }]));
		service.pageProviderChanged$.next({ key: 'nxql_search' } as any);
		TestBed.tick();
		expect(component.currentPageProviderKey).toBe('nxql_search');
		expect(component.savedSearches?.length).toBe(1);
	}));

	it('mirrors a saved search applied by the results page into the form without publishing', () => {
		const service = readySavedSearch();
		const publish = spyOn(component as any, 'publishSearchParameters');
		service.selectedSavedSearch.set({
			id: 'saved-1',
			title: 'Ordered children',
			params: { local: false, title: 'draft' },
		});
		TestBed.tick();
		expect(component.selectedSavedSearch?.id).toBe('saved-1');
		expect(component.parentSearchForm!.getRawValue().searchFields.title).toBe('draft');
		expect(publish).not.toHaveBeenCalled();
		service.selectedSavedSearch.set(undefined);
		TestBed.tick();
		expect(component.selectedSavedSearch).toBeUndefined();
		expect(publish).not.toHaveBeenCalled();
	});
});
