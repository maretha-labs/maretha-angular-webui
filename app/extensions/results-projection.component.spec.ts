import { WebUiLocale } from './i18n/webui-locale';
import { WebUiMessages } from './webui-messages';
import { Component, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AgGridAngular } from 'ag-grid-angular';
import { ResultsProjectionComponent } from './results-projection.component';
import { ResultsProjectionRegistry } from './results-projection-registry';
import { ResultsPagingSettings } from './results-paging-settings';
import {
	ResultsColumnLayout,
	ResultsProjectionHostTemplateDirective,
	ResultsProjectionTemplateDirective,
} from './results-projection';

@Component({
	standalone: true,
	imports: [
		ResultsProjectionComponent,
		ResultsProjectionTemplateDirective,
		ResultsProjectionHostTemplateDirective,
	],
	changeDetection: ChangeDetectionStrategy.Eager,
	template: `
		<nx-results-projection
			#one
			[rows]="rows"
			[columns]="columns"
			[selection]="selection"
			[contextEpoch]="epoch"
			[scope]="scope"
			(selectionChange)="selection = $event"
		>
			<ng-template nxResultsHostTemplate="selectiontoolbar" let-rows="rows"
				>toolbar-{{ rows.length }}</ng-template
			>
			<ng-template nxResultsHostTemplate="selectionActions">selection-actions</ng-template>
			<ng-template nxResultsHostTemplate="actions">actions</ng-template>
			<ng-template nxResultsTemplate="cell" let-row="row" let-column="column"
				>cell-{{ row.title }}-{{ column?.id }}</ng-template
			>
			<ng-template nxResultsTemplate="checkbox"
				><button type="button">checkbox</button></ng-template
			>
			<ng-template nxResultsTemplate="rowdetail">row-detail</ng-template>
			<ng-template nxResultsTemplate="settings">settings</ng-template>
			<ng-template nxResultsHostTemplate="form">form</ng-template>
			<ng-template nxResultsTemplate="action">action</ng-template>
		</nx-results-projection>
		<nx-results-projection
			#two
			[rows]="otherRows"
			[columns]="columns"
			[selection]="otherSelection"
			[scope]="otherScope"
			(selectionChange)="otherSelection = $event"
		/>
	`,
})
class ProjectionHostComponent {
	@ViewChild('one', { static: true }) one!: ResultsProjectionComponent;
	rows = [{ uid: 'one', title: 'First', type: 'File' }];
	otherRows = [{ uid: 'two', title: 'Second', type: 'Note' }];
	selection: readonly string[] = [];
	otherSelection: readonly string[] = [];
	columns = [{ id: 'title', label: 'Title', value: (row: { title: string }) => row.title }];
	epoch = 0;
	scope = 'one-scope';
	otherScope = 'two-scope';
}

@Component({ standalone: true, changeDetection: ChangeDetectionStrategy.Eager, template: 'detail' })
class RegisteredDetailProjection {}

describe('ResultsProjectionComponent', () => {
	beforeEach(() => TestBed.configureTestingModule({ imports: [ProjectionHostComponent] }));
	async function render() {
		const fixture = TestBed.createComponent(ProjectionHostComponent);
		fixture.nativeElement.style.height = '600px';
		document.body.append(fixture.nativeElement);
		fixture.detectChanges();
		await fixture.whenStable();
		await new Promise((resolve) => setTimeout(resolve));
		fixture.detectChanges();
		return fixture;
	}
	async function settleGrid(fixture: ComponentFixture<ResultsProjectionComponent>) {
		await fixture.whenStable();
		await new Promise((resolve) => setTimeout(resolve));
		fixture.detectChanges();
	}
	async function renderConfigurableGrid() {
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		fixture.nativeElement.style.cssText = 'width: 800px; height: 600px';
		document.body.append(fixture.nativeElement);
		fixture.componentRef.setInput('rows', [{ uid: 'one', title: 'First', modified: '2026-09-18' }]);
		fixture.componentRef.setInput('columns', [
			{ id: 'title', label: 'Title', width: 200 },
			{ id: 'modified', label: 'Modified', width: 250 },
		]);
		fixture.componentRef.setInput('columnLayoutEnabled', true);
		fixture.componentRef.setInput('remoteSort', true);
		fixture.detectChanges();
		await settleGrid(fixture);
		const grid = fixture.debugElement.query(By.directive(AgGridAngular))
			.componentInstance as AgGridAngular;
		return { fixture, api: grid.api };
	}
	it('uses the declared table geometry for rows, header, selection and the viewport', async () => {
		const { fixture, api } = await renderConfigurableGrid();
		expect(api.getGridOption('headerHeight')).toBe(47);
		expect(api.getDisplayedRowAtIndex(0)?.rowHeight).toBe(47);
		expect(api.getColumn('__selection')?.getActualWidth()).toBe(48);
		fixture.componentRef.setInput('tableHeaderHeight', 51);
		fixture.componentRef.setInput('tableRowHeight', 52);
		fixture.componentRef.setInput('selectionColumnWidth', 64);
		fixture.componentRef.setInput('rows', [{ uid: 'one' }, { uid: 'two' }]);
		fixture.detectChanges();
		await settleGrid(fixture);
		expect(api.getGridOption('headerHeight')).toBe(51);
		expect(api.getDisplayedRowAtIndex(0)?.rowHeight).toBe(52);
		expect(api.getDisplayedRowAtIndex(1)?.rowTop).toBe(52);
		expect(api.getColumn('__selection')?.getActualWidth()).toBe(64);
		expect(fixture.componentInstance.agHeight()).toContain('157px');
		fixture.componentRef.setInput('rows', []);
		fixture.detectChanges();
		await settleGrid(fixture);
		const shell = fixture.nativeElement.querySelector('.nx-results-projection__grid-shell');
		expect(shell.style.getPropertyValue('--nx-results-table-header-height')).toBe('51px');
	});

	it('shows the select-all box only while there are rows', async () => {
		const { fixture } = await renderConfigurableGrid();
		const selectAll = () =>
			fixture.nativeElement.querySelector('nx-ag-grid-projection-select-all input');
		expect(selectAll()).not.toBeNull();
		fixture.componentRef.setInput('rows', []);
		fixture.detectChanges();
		await settleGrid(fixture);
		expect(fixture.nativeElement.querySelector('nx-ag-grid-projection-select-all')).not.toBeNull();
		expect(selectAll()).toBeNull();
		fixture.componentRef.setInput('rows', [{ uid: 'two', title: 'Second' }]);
		fixture.detectChanges();
		await settleGrid(fixture);
		expect(selectAll()).not.toBeNull();
	});
	it('clears earlier flex sizing when a host supplies measured or saved column widths', async () => {
		const { fixture, api } = await renderConfigurableGrid();
		fixture.componentRef.setInput('columns', [
			{ id: 'title', label: 'Title', flex: 2 },
			{ id: 'modified', label: 'Modified', flex: 1 },
		]);
		fixture.detectChanges();
		await settleGrid(fixture);
		expect(api.getColumn('title')?.getFlex()).toBe(2);
		fixture.componentRef.setInput('columns', [
			{ id: 'title', label: 'Title', flex: 2, width: 380 },
			{ id: 'modified', label: 'Modified', flex: 1, width: 220 },
		]);
		fixture.detectChanges();
		await settleGrid(fixture);
		expect(api.getColumn('title')?.getFlex()).toBeFalsy();
		expect(api.getColumn('title')?.getActualWidth()).toBe(380);
		expect(api.getColumn('modified')?.getActualWidth()).toBe(220);
		fixture.componentRef.setInput('columns', [
			{ id: 'title', label: 'Title', flex: 2 },
			{ id: 'modified', label: 'Modified', flex: 1 },
		]);
		fixture.detectChanges();
		await settleGrid(fixture);
		expect(api.getColumn('title')?.getFlex()).toBe(2);
		expect(api.getColumn('modified')?.getFlex()).toBe(1);
	});

	it('changes grid locale and direction while retaining user column state and literal labels', async () => {
		const { fixture, api } = await renderConfigurableGrid();
		TestBed.inject(WebUiMessages).register('test', {
			ar: { 'fields.title': 'العنوان', Modified: 'Must stay literal' },
		});
		fixture.componentRef.setInput('columns', [
			{ id: 'title', label: 'Title', labelKey: 'fields.title', width: 200 },
			{ id: 'modified', label: 'Modified', width: 250 },
		]);
		fixture.detectChanges();
		api.applyColumnState({
			state: [
				{ colId: 'modified', width: 321 },
				{ colId: 'title', sort: 'desc' },
			],
			applyOrder: true,
		});
		await settleGrid(fixture);
		TestBed.inject(WebUiLocale).setLocale('ar');
		fixture.detectChanges();
		await settleGrid(fixture);
		const next = fixture.debugElement.query(By.directive(AgGridAngular))
			.componentInstance as AgGridAngular;
		expect(next.api).not.toBe(api);
		expect(next.api.getGridOption('enableRtl')).toBeTrue();
		expect(next.api.getColumnState().find((column) => column.colId === 'modified')?.width).toBe(
			321,
		);
		expect(next.api.getColumnState().find((column) => column.colId === 'title')?.sort).toBe('desc');
		expect(fixture.nativeElement.textContent).toContain('العنوان');
		expect(fixture.nativeElement.textContent).toContain('Modified');
		expect(fixture.nativeElement.textContent).not.toContain('Must stay literal');
		fixture.destroy();
	});
	it('lets the page scroll a pageScroll table: auto-height grid without an inline height', async () => {
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		fixture.nativeElement.style.cssText = 'width: 800px';
		document.body.append(fixture.nativeElement);
		fixture.componentRef.setInput('rows', [{ uid: 'one', title: 'First' }]);
		fixture.componentRef.setInput('columns', [
			{ id: 'title', label: 'Title', value: (row: { title: string }) => row.title },
		]);
		fixture.componentRef.setInput('pageScroll', true);
		fixture.detectChanges();
		await settleGrid(fixture);
		const grid = fixture.nativeElement.querySelector('.nx-results-projection__ag-grid');
		expect(grid.classList).toContain('nx-results-projection__ag-grid--page-scroll');
		expect(grid.style.height).toBe('');
		expect(fixture.nativeElement.querySelector('.ag-layout-auto-height')).not.toBeNull();
		fixture.nativeElement.remove();
	});
	it('requires an explicit opt-in for grid scroll paging and stops when disabled again', async () => {
		const { fixture, api } = await renderConfigurableGrid();
		const projection = fixture.componentInstance;
		const settings = TestBed.inject(ResultsPagingSettings);
		const loadMore = jasmine.createSpy('loadMore');
		projection.loadMore.subscribe(loadMore);
		const event = { api } as Parameters<typeof projection.agBodyScrollEnd>[0];
		projection.agBodyScrollEnd(event);
		expect(loadMore).not.toHaveBeenCalled();
		settings.apply({ scrollPagingEnabled: true });
		projection.agBodyScrollEnd(event);
		projection.agBodyScrollEnd(event);
		expect(loadMore).toHaveBeenCalledTimes(1);
		settings.apply({ scrollPagingEnabled: false });
		projection.agBodyScrollEnd(event);
		expect(loadMore).toHaveBeenCalledTimes(1);
		settings.apply({ scrollPagingEnabled: true });
		projection.agBodyScrollEnd(event);
		expect(loadMore).toHaveBeenCalledTimes(2);
	});
	it('mounts fallback rows and keeps simultaneous instances scoped', async () => {
		const fixture = await render();
		const projections = fixture.nativeElement.querySelectorAll('nx-results-projection');
		expect(projections[0].textContent).toContain('toolbar-1');
		expect(projections[0].textContent).toContain('cell-First-title');
		expect(projections[1].textContent).toContain('Second');
		expect(projections[1].textContent).not.toContain('one-scope');
	});
	it('honors every mounted row and host projection hook', async () => {
		const fixture = await render();
		const text = fixture.nativeElement.querySelector('nx-results-projection').textContent;
		for (const expected of [
			'toolbar-1',
			'selection-actions',
			'actions',
			'checkbox',
			'cell-First-title',
			'row-detail',
			'settings',
			'form',
			'action',
		])
			expect(text).toContain(expected);
	});
	it('selects with the keyboard and ignores controls inside rows', async () => {
		const fixture = await render();
		const row = fixture.nativeElement.querySelector('[row-index="0"]') as HTMLElement;
		expect(row).withContext('AG Grid renders a mounted result row').not.toBeNull();
		fixture.componentInstance.one.agCellKeyDown({
			data: fixture.componentInstance.rows[0],
			event: new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
		});
		fixture.detectChanges();
		expect(fixture.componentInstance.selection).toEqual(['one']);
		fixture.componentInstance.one.rowClick(
			new MouseEvent('click'),
			fixture.componentInstance.rows[0],
		);
		expect(fixture.componentInstance.selection).toEqual([]);
		fixture.detectChanges();
		fixture.componentInstance.one.rowClick(
			new MouseEvent('click'),
			fixture.componentInstance.rows[0],
		);
		fixture.detectChanges();
		const controlKey = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
		Object.defineProperty(controlKey, 'target', { value: document.createElement('button') });
		fixture.componentInstance.one.agCellKeyDown({
			data: fixture.componentInstance.rows[0],
			event: controlKey,
		});
		fixture.detectChanges();
		expect(fixture.componentInstance.selection).toEqual(['one']);
	});
	it('opts into row navigation and completed user column changes without changing defaults', () => {
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		const row = { uid: 'one', title: 'First' };
		fixture.componentRef.setInput('rows', [row]);
		fixture.componentRef.setInput('columns', [
			{ id: 'title', label: 'Title' },
			{ id: 'modified', label: 'Modified' },
		]);
		let activated = 0;
		let layout: readonly { id: string; width?: number }[] | undefined;
		fixture.componentInstance.rowActivated.subscribe(() => activated++);
		fixture.componentInstance.columnLayoutChange.subscribe((value) => (layout = value));
		const columnEvent: any = {
			finished: true,
			source: 'uiColumnMoved',
			api: {
				getColumnState: () => [
					{ colId: '__selection', width: 48 },
					{ colId: 'modified', width: 250, flex: null },
					{ colId: 'title', width: 400, flex: 2 },
				],
			},
		};
		fixture.componentInstance.onColumnLayoutChanged(columnEvent);
		expect(layout).toBeUndefined();
		fixture.componentRef.setInput('rowActivation', true);
		fixture.componentRef.setInput('columnLayoutEnabled', true);
		fixture.componentInstance.rowClick(new MouseEvent('click'), row);
		fixture.componentInstance.agCellKeyDown({
			data: row,
			event: new KeyboardEvent('keydown', { key: 'Enter' }),
		});
		expect(activated).toBe(2);
		const linkEvent = new MouseEvent('click');
		Object.defineProperty(linkEvent, 'target', { value: document.createElement('a') });
		fixture.componentInstance.rowClick(linkEvent, row);
		expect(activated).toBe(2);
		fixture.componentInstance.onColumnLayoutChanged({ ...columnEvent, finished: false });
		fixture.componentInstance.onColumnLayoutChanged({ ...columnEvent, source: 'api' });
		expect(layout).toBeUndefined();
		fixture.componentInstance.onColumnLayoutChanged(columnEvent);
		expect(layout).toEqual([{ id: 'modified', width: 250 }, { id: 'title' }]);
		fixture.componentRef.setInput('loading', true);
		fixture.componentInstance.rowClick(new MouseEvent('click'), row);
		expect(activated).toBe(2);
	});
	it('emits resized widths and reordered columns using the mounted grid column API', async () => {
		const { fixture, api } = await renderConfigurableGrid();
		const layouts: (readonly ResultsColumnLayout[])[] = [];
		fixture.componentInstance.columnLayoutChange.subscribe((layout) => layouts.push(layout));
		expect(
			api.applyColumnState({
				state: [{ colId: '__selection' }, { colId: 'modified' }, { colId: 'title' }],
				applyOrder: true,
			}),
		).toBeTrue();
		await settleGrid(fixture);
		expect(layouts).toEqual([]);
		api.setColumnWidths([{ key: 'modified', newWidth: 320 }], true, 'uiColumnResized');
		await settleGrid(fixture);
		expect(layouts).toEqual([
			[
				{ id: 'modified', width: 320 },
				{ id: 'title', width: 200 },
			],
		]);
	});
	it('emits remote sorting from real grid header clicks through the column state API', async () => {
		const { fixture } = await renderConfigurableGrid();
		const sorts: { columnId: string; direction: 'asc' | 'desc' | null }[] = [];
		fixture.componentInstance.sortChange.subscribe((sort) => sorts.push(sort));
		const header = fixture.nativeElement.querySelector(
			'.ag-header-cell[col-id="title"] .ag-header-cell-label',
		) as HTMLElement;
		expect(header).not.toBeNull();
		for (const direction of ['asc', 'desc', null] as const) {
			header.click();
			await settleGrid(fixture);
			expect(sorts[sorts.length - 1]).toEqual({ columnId: 'title', direction });
		}
		expect(sorts.length).toBe(3);
	});

	it('renders the column-settings gear as the last header cell and hands its button to the host', async () => {
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		fixture.nativeElement.style.cssText = 'width: 800px; height: 600px';
		document.body.append(fixture.nativeElement);
		fixture.componentRef.setInput('rows', [{ uid: 'one', title: 'First' }]);
		fixture.componentRef.setInput('columns', [{ id: 'title', label: 'Title' }]);
		fixture.detectChanges();
		await settleGrid(fixture);
		expect(fixture.nativeElement.querySelector('.ag-header-cell[col-id="__settings"]')).toBeNull();
		fixture.componentRef.setInput('columnChooser', true);
		fixture.detectChanges();
		await settleGrid(fixture);
		const headers = [...fixture.nativeElement.querySelectorAll('.ag-header-cell')] as HTMLElement[];
		const gearCell = headers[headers.length - 1];
		expect(gearCell.getAttribute('col-id')).toBe('__settings');
		expect(gearCell.getBoundingClientRect().width).toBe(32);
		const gear = gearCell.querySelector('button') as HTMLButtonElement;
		expect(gear.getAttribute('aria-label')).toBe('Columns Settings');
		const opened: HTMLElement[] = [];
		fixture.componentInstance.columnChooserOpen.subscribe((element) => opened.push(element));
		gear.click();
		expect(opened).toEqual([gear]);
		fixture.nativeElement.remove();
	});

	it('allows opted-in navigation for read-only lists while respecting busy, disabled and stale rows', () => {
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		const row = { uid: 'one', title: 'First' };
		fixture.componentRef.setInput('rows', [row]);
		fixture.componentRef.setInput('readOnly', true);
		fixture.componentRef.setInput('selectionEnabled', false);
		let activated = 0;
		let selected = 0;
		fixture.componentInstance.rowActivated.subscribe(() => activated++);
		fixture.componentInstance.selectionChange.subscribe(() => selected++);
		fixture.componentInstance.rowClick(new MouseEvent('click'), row);
		expect(activated).toBe(0);
		fixture.componentRef.setInput('rowActivation', true);
		fixture.componentInstance.rowClick(new MouseEvent('click'), row);
		fixture.componentInstance.agCellKeyDown({
			data: row,
			event: new KeyboardEvent('keydown', { key: 'Enter' }),
		});
		expect(activated).toBe(2);
		expect(selected).toBe(0);
		fixture.componentRef.setInput('rowActivationDisabled', true);
		fixture.componentInstance.rowClick(new MouseEvent('click'), row);
		fixture.componentRef.setInput('rowActivationDisabled', false);
		fixture.componentRef.setInput('loading', true);
		fixture.componentInstance.rowClick(new MouseEvent('click'), row);
		fixture.componentRef.setInput('loading', false);
		fixture.componentRef.setInput('rowDisabled', () => true);
		fixture.componentInstance.rowClick(new MouseEvent('click'), row);
		fixture.componentRef.setInput('rowDisabled', () => false);
		fixture.componentRef.setInput('rows', [{ ...row }]);
		fixture.componentInstance.rowClick(new MouseEvent('click'), row);
		expect(activated).toBe(2);
		fixture.componentRef.setInput('rows', [row]);
		fixture.componentRef.setInput('selectionEnabled', true);
		fixture.componentInstance.rowClick(new MouseEvent('click'), row);
		expect(activated).toBe(2);
	});
	it('does not let a retained row context change a replacement row', async () => {
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		const original = { uid: 'one', title: 'First', type: 'File' };
		fixture.componentRef.setInput('rows', [original]);
		fixture.componentRef.setInput('contextEpoch', 0);
		fixture.detectChanges();
		const context = fixture.componentInstance.rowContext(original, 0);
		let selectionEmits = 0;
		let actionEmits = 0;
		fixture.componentInstance.selectionChange.subscribe(() => selectionEmits++);
		fixture.componentInstance.action.subscribe(() => actionEmits++);
		fixture.componentRef.setInput('rows', [{ uid: 'one', title: 'Replacement', type: 'File' }]);
		fixture.componentRef.setInput('contextEpoch', 1);
		fixture.detectChanges();
		context.toggleSelection();
		context.invokeAction('open');
		expect(selectionEmits).toBe(0);
		expect(actionEmits).toBe(0);
	});
	it('preserves selected ids across a row replacement and skips disabled rows when selecting all', () => {
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		fixture.componentRef.setInput('rows', [
			{ uid: 'one', title: 'First' },
			{ uid: 'blocked', title: 'Blocked' },
		]);
		fixture.componentRef.setInput('selection', ['one']);
		fixture.componentRef.setInput('rowDisabled', (row: { uid: string }) => row.uid === 'blocked');
		let emitted: readonly string[] = [];
		fixture.componentInstance.selectionChange.subscribe((ids) => (emitted = ids));
		fixture.detectChanges();
		expect(fixture.componentInstance.isSelected({ uid: 'one' })).toBeTrue();
		fixture.componentInstance.toggleAll();
		expect(emitted).toEqual([]);
		fixture.componentRef.setInput('selection', []);
		fixture.detectChanges();
		fixture.componentInstance.toggleAll();
		expect(emitted).toEqual(['one']);
	});
	it('falls back for absent templates and blocks host callbacks while readonly or loading', () => {
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		fixture.nativeElement.style.height = '600px';
		document.body.append(fixture.nativeElement);
		fixture.componentRef.setInput('rows', [{ uid: 'one', title: 'First' }]);
		fixture.componentRef.setInput('columns', [{ id: 'title', label: 'Title' }]);
		fixture.componentRef.setInput('readOnly', true);
		let emitted: readonly string[] | undefined;
		fixture.componentInstance.selectionChange.subscribe((ids) => (emitted = ids));
		fixture.detectChanges();
		expect(
			fixture.componentInstance.value(
				{ uid: 'one', title: 'First' },
				{ id: 'title', label: 'Title' },
			),
		).toBe('First');
		fixture.componentInstance.hostContext().clearSelection();
		fixture.componentInstance.hostContext().toggleAll();
		expect(emitted).toBeUndefined();
		fixture.componentRef.setInput('readOnly', false);
		fixture.componentRef.setInput('loading', true);
		fixture.detectChanges();
		fixture.componentInstance.hostContext().toggleAll();
		expect(emitted).toBeUndefined();
	});
	it('reacts to registered detail projections by falling back from fixed-height virtualization', () => {
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		fixture.componentRef.setInput('rows', [{ uid: 'one', title: 'First' }]);
		fixture.componentRef.setInput('virtualized', true);
		expect(fixture.componentInstance.shouldVirtualize()).toBeTrue();
		const unregister = TestBed.inject(ResultsProjectionRegistry).register({
			id: 'test.detail',
			projection: 'rowdetail',
			component: RegisteredDetailProjection,
		});
		expect(fixture.componentInstance.shouldVirtualize()).toBeFalse();
		unregister();
		expect(fixture.componentInstance.shouldVirtualize()).toBeTrue();
	});

	it('chunks grid rows, honours keyboard selection sources and routes context callbacks', () => {
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		const rows = Array.from({ length: 17 }, (_, index) => ({
			uid: `r${index}`,
			title: `T${index}`,
			type: 'File',
		}));
		fixture.componentRef.setInput('rows', rows);
		fixture.componentRef.setInput('selection', []);
		fixture.detectChanges();
		const projection = fixture.componentInstance;
		const chunks = projection.gridRows();
		expect(chunks.length).toBe(2);
		expect(chunks[1].length).toBe(2);
		expect(projection.trackByGridRow(3)).toBe(3);

		const emitted: string[][] = [];
		projection.selectionChange.subscribe((ids) => emitted.push([...ids]));
		const actions: unknown[] = [];
		projection.action.subscribe((event) => actions.push(event));

		projection.agSelectionChanged({ source: 'api', selectedNodes: [] } as never);
		expect(emitted.length).toBe(0);
		projection.agSelectionChanged({
			source: 'spaceKey',
			selectedNodes: [{ data: rows[0] }],
		} as never);
		expect(emitted.pop()).toEqual(['r0']);

		projection.agRowClicked({ data: rows[1], event: new MouseEvent('click') } as never);
		expect(emitted.pop()).toEqual(['r1']);

		const button = document.createElement('button');
		button.addEventListener('keydown', (event) => projection.selectRow(event, rows[3]));
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
		expect(emitted.length).toBe(0);
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
		expect(emitted.pop()).toEqual(['r3']);

		const hostContext = projection.hostContext();
		hostContext.clearSelection();
		expect(emitted.pop()).toEqual([]);
		hostContext.invokeAction('export', 1);
		expect(actions.pop()).toEqual({ action: 'export', argument: 1 });

		const rowContext = projection.rowContext(rows[2], 2);
		rowContext.invokeAction('open', 'arg');
		expect(actions.pop()).toEqual({ action: 'open', row: rows[2], argument: 'arg' });
		rowContext.activateRow();
		rowContext.toggleSelection();
		expect(emitted.pop()).toEqual(['r2']);
		button.addEventListener('keydown', (event) => rowContext.selectRow(event));
		button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', cancelable: true }));
		expect(emitted.pop()).toEqual(['r2']);

		expect(projection.hasDetails()).toBeFalse();
		expect(projection.componentInputs('ctx')).toEqual({ context: 'ctx' });
		const row = document.createElement('div');
		row.addEventListener('keydown', (event) => projection.keyDown(event, rows[4]));
		row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
		expect(emitted.pop()).toEqual(['r4']);

		expect(projection.allSelected()).toBeFalse();
		fixture.componentRef.setInput(
			'selection',
			rows.map((entry) => entry.uid),
		);
		fixture.detectChanges();
		expect(projection.allSelected()).toBeTrue();
		fixture.componentRef.setInput('selection', [...rows.map((entry) => entry.uid)].reverse());
		fixture.detectChanges();
		expect(projection.allSelected()).toBeTrue();
	});
});
