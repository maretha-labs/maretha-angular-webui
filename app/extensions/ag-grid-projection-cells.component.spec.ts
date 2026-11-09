import { TestBed } from '@angular/core/testing';
import type { IHeaderParams } from 'ag-grid-community';
import {
	AgGridProjectionCellComponent,
	AgGridProjectionColumnSettingsComponent,
	AgGridProjectionFullWidthComponent,
} from './ag-grid-projection-cells.component';
import { ResultsProjectionColumn } from './results-projection';
import type { ResultsProjectionComponent } from './results-projection.component';

type ResizeCallback = (entries: { contentRect: { height: number } }[]) => void;

describe('AG Grid projection cells', () => {
	const row = { uid: 'one', title: 'First' };
	function host(columns: Partial<ResultsProjectionColumn>[], selection = true, actions = false) {
		return {
			rowContext: jasmine
				.createSpy('rowContext')
				.and.callFake((data: unknown, index: number, column?: ResultsProjectionColumn) => ({
					row: data,
					index,
					column,
				})),
			cellComponent: jasmine.createSpy('cellComponent').and.returnValue(null),
			visibleColumns: () => columns as ResultsProjectionColumn[],
			selectionEnabled: () => selection,
			hasRowActions: () => actions,
		};
	}
	function params(overrides: Record<string, unknown>) {
		return {
			data: row,
			node: { rowIndex: 3, rowHeight: 47, setRowHeight: jasmine.createSpy('setRowHeight') },
			api: { onRowHeightChanged: jasmine.createSpy('onRowHeightChanged') },
			projectionColumn: { id: 'title', label: 'Title' },
			...overrides,
		};
	}
	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [
				AgGridProjectionCellComponent,
				AgGridProjectionColumnSettingsComponent,
				AgGridProjectionFullWidthComponent,
			],
		})
			.overrideComponent(AgGridProjectionCellComponent, { set: { template: '' } })
			.overrideComponent(AgGridProjectionFullWidthComponent, { set: { template: '' } });
	});

	it('exposes the row, its index (0 for detached nodes) and the projection column context', () => {
		const fixture = TestBed.createComponent(AgGridProjectionCellComponent);
		const cell = fixture.componentInstance;
		const hostApi = host([]);
		cell.agInit(params({ host: hostApi }) as never);
		expect(cell.row).toBe(row as never);
		expect(cell.index).toBe(3);
		expect(cell.column.id).toBe('title');
		expect(cell.context()).toEqual({
			row,
			index: 3,
			column: { id: 'title', label: 'Title' },
		} as never);
		expect(cell.refresh(params({ host: hostApi, node: { rowIndex: null } }) as never)).toBeTrue();
		expect(cell.index).toBe(0);
		expect(hostApi.rowContext).toHaveBeenCalledTimes(1);
	});

	it('derives the full-width grid columns from widths, flex hints, selection and row actions', () => {
		const fixture = TestBed.createComponent(AgGridProjectionFullWidthComponent);
		const cell = fixture.componentInstance;
		const columns = [
			{ id: 'icon', width: 40 },
			{ id: 'title' },
			{ id: 'path', minWidth: 160 },
			{ id: 'modified', flex: 3 },
			{ id: 'author' },
		];
		cell.agInit(params({ host: host(columns, true, true) }) as never);
		expect(cell.cellGridColumns()).toBe(
			'48px 40px minmax(100px, 2fr) minmax(160px, 2fr) minmax(100px, 3fr) minmax(100px, 1fr) 96px',
		);
		cell.agInit(params({ host: host([{ id: 'author' }], false, false) }) as never);
		expect(cell.cellGridColumns()).toBe('minmax(100px, 2fr)');
		const hostApi = host(columns);
		cell.agInit(params({ host: hostApi }) as never);
		expect(cell.cellComponent(columns[2] as ResultsProjectionColumn)).toBeNull();
		expect(hostApi.rowContext).toHaveBeenCalledWith(row, 3, columns[2]);
		expect(hostApi.cellComponent).toHaveBeenCalledWith({ row, index: 3, column: columns[2] });
	});

	it('syncs the AG Grid row height to the rendered content only when it changes', () => {
		let callback: ResizeCallback | undefined;
		const observed: Element[] = [];
		const disconnect = jasmine.createSpy('disconnect');
		const original = window.ResizeObserver;
		class FakeResizeObserver {
			constructor(fn: ResizeCallback) {
				callback = fn;
			}
			observe(element: Element) {
				observed.push(element);
			}
			disconnect = disconnect;
		}
		window.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
		try {
			const fixture = TestBed.createComponent(AgGridProjectionFullWidthComponent);
			const cell = fixture.componentInstance;
			const current = params({ host: host([]) });
			cell.agInit(current as never);
			fixture.detectChanges();
			expect(observed).toEqual([fixture.nativeElement]);
			callback!([{ contentRect: { height: 0 } }]);
			callback!([{ contentRect: { height: 47 } }]);
			expect(current.node.setRowHeight).not.toHaveBeenCalled();
			callback!([{ contentRect: { height: 61.2 } }]);
			expect(current.node.setRowHeight).toHaveBeenCalledOnceWith(62);
			expect(current.api.onRowHeightChanged).toHaveBeenCalledTimes(1);
			fixture.destroy();
			expect(disconnect).toHaveBeenCalledTimes(1);
		} finally {
			window.ResizeObserver = original;
		}
	});

	it('column-settings header: hands the gear to the host and takes over programmatic cell focus', () => {
		const emitted: HTMLElement[] = [];
		const host = {
			columnChooserOpen: { emit: (gear: HTMLElement) => emitted.push(gear) },
		} as unknown as ResultsProjectionComponent;
		const settings = (eGridHeader: HTMLElement) =>
			({ eGridHeader, host }) as unknown as IHeaderParams & { host: ResultsProjectionComponent };
		const cell = document.createElement('div');
		const rebuilt = document.createElement('div');
		document.body.append(cell, rebuilt);
		const fixture = TestBed.createComponent(AgGridProjectionColumnSettingsComponent);
		document.body.append(fixture.nativeElement);
		fixture.componentInstance.agInit(settings(cell));
		fixture.detectChanges();
		const gear = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
		expect(gear.getAttribute('aria-label')).toBe('Columns Settings');
		// AG Grid restores focus to the bare cell after a header refresh: the gear takes it.
		cell.dispatchEvent(new FocusEvent('focus'));
		expect(document.activeElement).toBe(gear);
		gear.blur();
		// Keyboard navigation arrives from another element and keeps the cell focused.
		cell.dispatchEvent(new FocusEvent('focus', { relatedTarget: rebuilt }));
		expect(document.activeElement).not.toBe(gear);
		expect(fixture.componentInstance.refresh(settings(rebuilt))).toBeTrue();
		cell.dispatchEvent(new FocusEvent('focus'));
		expect(document.activeElement).not.toBe(gear);
		rebuilt.dispatchEvent(new FocusEvent('focus'));
		expect(document.activeElement).toBe(gear);
		gear.click();
		expect(emitted).toEqual([gear]);
		fixture.destroy();
		TestBed.createComponent(AgGridProjectionColumnSettingsComponent).destroy();
		cell.remove();
		rebuilt.remove();
	});
});
