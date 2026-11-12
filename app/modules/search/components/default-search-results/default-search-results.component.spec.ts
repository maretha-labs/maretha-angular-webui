import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AgGridAngular } from 'ag-grid-angular';
import { ResultsProjectionComponent } from '@maretha/webui-sdk';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { HttpTestingController } from '@angular/common/http/testing';
import { of, Subject } from 'rxjs';
import type { ResultsProjectionContext } from '@maretha/webui-sdk';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { DocumentSearchService } from '../../helpers/document-search.service';
import { REPOSITORY_SEARCH } from '../../helpers/repository-search-definitions';
import { DefaultSearchResultsComponent } from './default-search-results.component';

@Component({
	changeDetection: ChangeDetectionStrategy.Eager,
	template:
		'<button class="custom-default-row" (click)="context().toggleSelection()">{{ context().searchId }}: {{ context().row.title }}</button>',
})
class CustomDefaultRowComponent {
	readonly context = input.required<ResultsProjectionContext>();
}

@Component({
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '<span class="custom-default-cell">{{ context().value }}</span>',
})
class CustomDefaultCellComponent {
	readonly context = input.required<ResultsProjectionContext>();
}

@Component({
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '<span class="custom-default-header">Custom {{ label }}</span>',
})
class CustomDefaultHeaderComponent {
	label = '';
	agInit(params: { displayName: string }): void {
		this.label = params.displayName;
	}
}

describe('Default search presentation definition', () => {
	it('loads only the active view hook and preserves request ownership when views and selection change', async () => {
		for (const key of Object.keys(localStorage))
			if (key.startsWith('maretha.search-view:')) localStorage.removeItem(key);
		const changed = new Subject<void>();
		const loadMore = jasmine.createSpy('loadMore').and.returnValue(
			of({
				entries: [{ uid: 'one', title: 'Example', properties: {} }],
				resultsCount: 1,
			}),
		);
		TestBed.configureTestingModule({
			imports: [DefaultSearchResultsComponent],
			providers: [
				...legacyTestProviders(),
				{
					provide: ActivatedRoute,
					useValue: {
						snapshot: { paramMap: convertToParamMap({}) },
						paramMap: of(convertToParamMap({})),
					},
				},
				{
					provide: DocumentSearchService,
					useValue: {
						searchPaneVisibility: () => true,
						currentPageProviderKey: 'default_search',
						searchParametersChanged$: changed,
						pageProviderChanged$: new Subject<void>(),
						loadMore,
						getCurrentQueryScope: () => undefined,
						getCurrentQueryToken: () => 0,
					},
				},
			],
		});
		const rowLoader = jasmine.createSpy('rowLoader').and.resolveTo(CustomDefaultRowComponent);
		const cellLoader = jasmine.createSpy('cellLoader').and.resolveTo(CustomDefaultCellComponent);
		const fixture = TestBed.createComponent(DefaultSearchResultsComponent);
		fixture.componentRef.setInput('definition', {
			...REPOSITORY_SEARCH.default,
			views: {
				list: { loadComponent: rowLoader },
				table: {
					columns: [
						{
							id: 'title',
							label: 'Title',
							value: (row: any) => row.title,
							headerComponent: CustomDefaultHeaderComponent,
						},
					],
					columnChooser: true,
					cells: { title: cellLoader },
				},
			},
		});
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.classList.contains('nx-search--default')).toBeTrue();
		expect(fixture.nativeElement.querySelector('.custom-default-row')?.textContent).toContain(
			'default: Example',
		);
		expect(rowLoader).toHaveBeenCalledTimes(1);
		expect(cellLoader).not.toHaveBeenCalled();
		expect(loadMore).toHaveBeenCalledOnceWith(0, 40, [], true, true);
		fixture.nativeElement.querySelector('.custom-default-row').click();
		fixture.detectChanges();
		expect(fixture.componentInstance.selectedIds()).toEqual(['one']);
		fixture.componentInstance.setDisplayMode('grid');
		expect(fixture.componentInstance.displayMode()).toBe('list');
		fixture.componentInstance.setDisplayMode('table');
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(cellLoader).toHaveBeenCalledTimes(1);
		expect(fixture.nativeElement.querySelector('.custom-default-header')).not.toBeNull();
		expect(
			fixture.nativeElement.querySelector('.nx-results-projection__settings-button'),
		).not.toBeNull();
		expect(fixture.componentInstance.resultColumns().map((column) => column.id)).toEqual(['title']);
		expect(loadMore).toHaveBeenCalledTimes(1);
		changed.next();
		await fixture.whenStable();
		expect(loadMore).toHaveBeenCalledTimes(2);
	});
	it('keeps stock list/grid/table presentations, header settings and view changes local', async () => {
		for (const key of Object.keys(localStorage))
			if (key.startsWith('maretha.search-view:')) localStorage.removeItem(key);
		const loadMore = jasmine.createSpy('loadMore').and.returnValue(
			of({
				entries: [{ uid: 'one', title: 'Example', type: 'File', properties: {} }],
				resultsCount: 1,
			}),
		);
		TestBed.configureTestingModule({
			imports: [DefaultSearchResultsComponent],
			providers: [
				...legacyTestProviders(),
				{
					provide: ActivatedRoute,
					useValue: {
						snapshot: { paramMap: convertToParamMap({}) },
						paramMap: of(convertToParamMap({})),
					},
				},
				{
					provide: DocumentSearchService,
					useValue: {
						searchPaneVisibility: () => true,
						currentPageProviderKey: 'default_search',
						searchParametersChanged$: new Subject<void>(),
						pageProviderChanged$: new Subject<void>(),
						loadMore,
						getCurrentQueryScope: () => undefined,
						getCurrentQueryToken: () => 0,
					},
				},
			],
		});
		const fixture = TestBed.createComponent(DefaultSearchResultsComponent);
		fixture.nativeElement.style.cssText = 'width: 1000px; height: 600px';
		document.body.append(fixture.nativeElement);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('nx-document-list-item')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('nx-results-sort-bar')).not.toBeNull();
		fixture.componentInstance.setDisplayMode('grid');
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('nx-document-grid-thumbnail')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('nx-results-sort-bar')).not.toBeNull();
		fixture.componentInstance.setDisplayMode('table');
		fixture.detectChanges();
		await fixture.whenStable();
		await new Promise((resolve) => setTimeout(resolve, 100));
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('nx-results-sort-bar')).toBeNull();
		const projection = fixture.debugElement.query(By.directive(ResultsProjectionComponent))
			.componentInstance as ResultsProjectionComponent;
		expect(projection.pageScroll()).toBeTrue();
		const grid = fixture.debugElement.query(By.directive(AgGridAngular))
			.componentInstance as AgGridAngular;
		expect(grid.api.getDisplayedRowAtIndex(0)?.rowHeight).toBe(52);
		expect(grid.api.getGridOption('headerHeight')).toBe(50);
		expect(grid.api.getColumn('__selection')?.getActualWidth()).toBe(64);
		const selectAll: HTMLInputElement = fixture.nativeElement.querySelector(
			'nx-ag-grid-projection-select-all input',
		);
		expect(getComputedStyle(selectAll).visibility).toBe('visible');
		selectAll.click();
		fixture.detectChanges();
		expect(fixture.componentInstance.selectedIds()).toEqual(['one']);
		await fixture.whenStable();
		fixture.detectChanges();
		fixture.nativeElement.querySelector('nx-ag-grid-projection-select-all input').click();
		fixture.detectChanges();
		expect(fixture.componentInstance.selectedIds()).toEqual([]);
		expect(loadMore).toHaveBeenCalledTimes(1);
		const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
			'.nx-results-projection__settings-button',
		);
		expect(trigger.closest('.default-search-results__views')).not.toBeNull();
		trigger.click();
		fixture.detectChanges();
		const dialog: HTMLDialogElement = fixture.nativeElement.querySelector(
			'nx-search-column-chooser dialog',
		);
		expect(dialog.open).toBeTrue();
		const toggle = (label: string) =>
			[...dialog.querySelectorAll('label')]
				.find((item) => item.textContent?.trim() === label)!
				.querySelector('input')!
				.click();
		toggle('Type');
		fixture.detectChanges();
		expect(
			fixture.componentInstance.resultColumns().find((column) => column.id === 'type')?.hidden,
		).toBeFalse();
		// Hiding the header that opened the chooser replaces it. The modal remains the same instance.
		toggle('Last contributor');
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(dialog.open).toBeTrue();
		expect(fixture.nativeElement.querySelector('nx-search-column-chooser dialog')).toBe(dialog);
		fixture.componentInstance.columnLayoutChanged([{ id: 'type', width: 300 }]);
		dialog.querySelector<HTMLButtonElement>('.search-column-chooser__reset')!.click();
		fixture.detectChanges();
		expect(dialog.open).toBeTrue();
		expect(
			fixture.componentInstance
				.resultColumns()
				.map((column) => ({ id: column.id, hidden: !!column.hidden, width: column.width })),
		).toEqual(
			REPOSITORY_SEARCH.default.views.table!.columns.map((column) => ({
				id: column.id,
				hidden: !!column.hidden,
				width: column.width,
			})),
		);
		expect(fixture.componentInstance.columnLayout()).toEqual([]);
		expect(fixture.componentInstance.columnVisibility()).toEqual({});
		expect(fixture.componentInstance.displayMode()).toBe('table');
		const preference = JSON.parse(
			localStorage.getItem(
				Object.keys(localStorage).find((key) => key.startsWith('maretha.search-view:'))!,
			)!,
		);
		expect(preference).toEqual(
			jasmine.objectContaining({ displayMode: 'table', columns: {}, columnLayout: [] }),
		);
		dialog.querySelector<HTMLButtonElement>('.search-column-chooser__close')!.click();
		await new Promise((resolve) => setTimeout(resolve, 20));
		fixture.detectChanges();
		expect(dialog.open).toBeFalse();
		expect(document.activeElement).toBe(
			fixture.nativeElement.querySelector('.nx-results-projection__settings-button'),
		);
		expect(loadMore).toHaveBeenCalledTimes(1);
		await fixture.whenStable();
		fixture.detectChanges();
		const header = fixture.nativeElement.querySelector('.column-label') as HTMLButtonElement;
		header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		header.click();
		await new Promise((resolve) => setTimeout(resolve, 20));
		await fixture.whenStable();
		expect(loadMore).toHaveBeenCalledTimes(2);
		fixture.componentInstance.setDisplayMode('list');
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		fixture.nativeElement.querySelector('.document-list-item__select').click();
		fixture.detectChanges();
		expect(fixture.componentInstance.selectedIds()).toEqual(['one']);
		expect(
			fixture.nativeElement.querySelector('.default-search-results__selection'),
		).not.toBeNull();
		expect(loadMore).toHaveBeenCalledTimes(2);
		const component = fixture.componentInstance;
		const widths = component
			.tableColumns()
			.filter((column) => !column.hidden)
			.map((column) => ({ id: column.id, width: Math.round(column.width!) }));
		component.columnLayoutChanged(widths);
		expect(component.columnLayout().every((column) => column.width === undefined)).toBeTrue();
		const resized = widths.map((column) =>
			column.id === 'title' ? { ...column, width: column.width + 80 } : column,
		);
		component.columnLayoutChanged(resized);
		const fixedTitle = component.tableColumns().find((column) => column.id === 'title')!.width;
		const modifiedWidth = component
			.tableColumns()
			.find((column) => column.id === 'modified')!.width!;
		component.tableWidth.update((width) => width + 200);
		expect(component.tableColumns().find((column) => column.id === 'title')!.width).toBe(
			fixedTitle,
		);
		expect(
			component.tableColumns().find((column) => column.id === 'modified')!.width,
		).toBeGreaterThan(modifiedWidth);
		expect(
			component
				.columnLayout()
				.filter((column) => column.width !== undefined)
				.map((column) => column.id),
		).toEqual(['title']);
	});
	it('renders the stock hidden cells and sorts only the stock sort-by columns', async () => {
		for (const key of Object.keys(localStorage))
			if (key.startsWith('maretha.search-view:')) localStorage.removeItem(key);
		const entry = (id: string, label: string, parent?: object) => ({
			'entity-type': 'directoryEntry',
			properties: { id, label, ...(parent ? { parent } : {}) },
		});
		const loadMore = jasmine.createSpy('loadMore').and.returnValue(
			of({
				entries: [
					{
						uid: 'one',
						title: 'Example',
						type: 'MyType',
						properties: {
							'dc:created': '2025-04-01T10:00:00Z',
							'dc:creator': {
								'entity-type': 'user',
								id: 'Administrator',
								properties: { username: 'Administrator', email: 'devnull@nuxeo.com' },
							},
							'dc:lastContributor': 'ghost',
							'dc:coverage': entry('france', 'France', entry('europe', 'Europe')),
							'dc:subjects': [entry('art', 'Art')],
						},
					},
				],
				resultsCount: 1,
			}),
		);
		TestBed.configureTestingModule({
			imports: [DefaultSearchResultsComponent],
			providers: [
				...legacyTestProviders(),
				{
					provide: ActivatedRoute,
					useValue: {
						snapshot: { paramMap: convertToParamMap({}) },
						paramMap: of(convertToParamMap({})),
					},
				},
				{
					provide: DocumentSearchService,
					useValue: {
						searchPaneVisibility: () => true,
						currentPageProviderKey: 'default_search',
						searchParametersChanged$: new Subject<void>(),
						pageProviderChanged$: new Subject<void>(),
						loadMore,
						getCurrentQueryScope: () => undefined,
						getCurrentQueryToken: () => 0,
					},
				},
			],
		});
		const http = TestBed.inject(HttpTestingController);
		const fixture = TestBed.createComponent(DefaultSearchResultsComponent);
		fixture.nativeElement.style.cssText = 'width: 2400px; height: 600px';
		document.body.append(fixture.nativeElement);
		fixture.detectChanges();
		await fixture.whenStable();
		const component = fixture.componentInstance;
		for (const id of ['type', 'created', 'author', 'coverage', 'subjects'])
			component.toggleColumn(id, true);
		component.setDisplayMode('table');
		fixture.detectChanges();
		await fixture.whenStable();
		const host = fixture.nativeElement as HTMLElement;
		for (
			let wait = 0;
			wait < 50 && !host.querySelector('[role="gridcell"] nx-ag-grid-projection-cell > *');
			wait++
		) {
			await new Promise((resolve) => setTimeout(resolve, 20));
			fixture.detectChanges();
		}
		const cell = (id: string) =>
			host.querySelector(`[role="gridcell"][col-id="${id}"]`) as HTMLElement;
		const tags = (id: string) =>
			Array.from(cell(id).querySelectorAll('.tag'), (tag) => tag.textContent!.trim());
		expect(tags('type')).toEqual(['mytype']);
		expect(cell('created').textContent!.trim()).toBe('April 1, 2025');
		expect(cell('author').textContent!.trim()).toBe('devnull@nuxeo.com');
		expect(cell('author').querySelector('.avatar')!.getAttribute('data-initials')).toBe('A');
		expect(cell('lastContributor').textContent!.trim()).toBe('ghost');
		expect(tags('coverage')).toEqual(['Europe/France']);
		expect(tags('subjects')).toEqual(['Art']);
		http.expectNone((request) => request.url.includes('/user/'));
		// nuxeo-default-search-results: only `sort-by` columns offer the sort control.
		const header = (id: string) =>
			host.querySelector(`.ag-header-cell[col-id="${id}"] .column-label`) as HTMLElement;
		expect(header('title').tagName).toBe('BUTTON');
		expect(header('author').tagName).toBe('BUTTON');
		expect(header('created').tagName).toBe('BUTTON');
		expect(header('type').tagName).toBe('SPAN');
		expect(header('coverage').tagName).toBe('SPAN');
		expect(header('type').querySelector('nx-webui-icon')).toBeNull();
		header('author').click();
		await new Promise((resolve) => setTimeout(resolve, 20));
		await fixture.whenStable();
		expect(loadMore.calls.mostRecent().args[2]).toEqual(['dc:creator']);
		fixture.destroy();
	});
});
