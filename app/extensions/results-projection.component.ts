import { WebUiMessagePipe } from './webui-messages';
import { WebUiLocale } from './i18n/webui-locale';
import { gridLocale } from './i18n/grid-locale';
import { WebUiMessages } from './webui-messages';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	contentChildren,
	input,
	output,
	TemplateRef,
	inject,
	effect,
	signal,
	untracked,
	Type,
	PendingTasks,
	ErrorHandler,
} from '@angular/core';
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { CdkVirtualForOf } from '@angular/cdk/scrolling';
import { AgGridAngular } from 'ag-grid-angular';
import {
	ClientSideRowModelModule,
	LocaleModule,
	GridStateModule,
	ColumnApiModule,
	RenderApiModule,
	RowApiModule,
	RowSelectionModule,
	ScrollApiModule,
	TextFilterModule,
	themeQuartz,
	type BodyScrollEndEvent,
	type ColDef,
	type ColumnMovedEvent,
	type ColumnResizedEvent,
	type GridApi,
	type GridReadyEvent,
	type Module,
	type SelectionChangedEvent,
	type RowClickedEvent,
	type SortChangedEvent,
} from 'ag-grid-community';
import {
	AgGridProjectionActionsComponent,
	AgGridProjectionCellComponent,
	AgGridProjectionCheckboxComponent,
	AgGridProjectionColumnSettingsComponent,
	AgGridProjectionFullWidthComponent,
	AgGridProjectionSelectAllComponent,
} from './ag-grid-projection-cells.component';
import {
	ResultsProjectionColumn,
	ResultsColumnLayout,
	ResultsProjectionContext,
	ResultsProjectionHostContext,
	ResultsProjectionRow,
	ResultsProjectionTemplateDirective,
	ResultsProjectionHostTemplateDirective,
	ResultsProjectionTemplateName,
	ResultsProjectionComponents,
	ResultsProjectionComponentLoader,
} from './results-projection';
import { ResultsProjectionRegistry } from './results-projection-registry';
import { ResultsPagingSettings } from './results-paging-settings';

export type ResultsProjectionMode = 'table' | 'list' | 'grid';

/**
 * Default, accessible renderer for the Polymer result/list/grid/table projection family.
 * Projected templates are instance-local and always receive a fresh context from this host.
 */
/** The settings cell: a 28px gear button with 2px of frame on each side (stock: a 1.5em gutter). */
const SETTINGS_COLUMN_WIDTH = 32;

@Component({
	selector: 'nx-results-projection',
	standalone: true,
	imports: [NgTemplateOutlet, NgComponentOutlet, CdkVirtualForOf, AgGridAngular, WebUiMessagePipe],
	template: `
		@if (projectionComponent('selectiontoolbar', hostContext()); as component) {
			<ng-container *ngComponentOutlet="component; inputs: componentInputs(hostContext())" />
		} @else {
			<ng-container *ngTemplateOutlet="template('selectiontoolbar'); context: hostContext()" />
		}
		@if (projectionComponent('selectionActions', hostContext()); as component) {
			<ng-container *ngComponentOutlet="component; inputs: componentInputs(hostContext())" />
		} @else {
			<ng-container *ngTemplateOutlet="template('selectionActions'); context: hostContext()" />
		}
		@if (projectionComponent('actions', hostContext()); as component) {
			<ng-container *ngComponentOutlet="component; inputs: componentInputs(hostContext())" />
		} @else {
			<ng-container *ngTemplateOutlet="template('actions'); context: hostContext()" />
		}
		@if (
			mode() === 'table' && !projectionComponent('default', hostContext()) && !template('default')
		) {
			<div
				class="nx-results-projection__grid-shell"
				[style.--nx-results-table-header-height.px]="tableHeaderHeight()"
			>
				@for (view of gridViews(); track view.language) {
					<ag-grid-angular
						class="nx-results-projection__ag-grid"
						[class.nx-results-projection__ag-grid--empty]="!rows().length && !loading()"
						[class.nx-results-projection__ag-grid--page-scroll]="pageScroll() && rows().length > 0"
						[domLayout]="pageScroll() && rows().length > 0 ? 'autoHeight' : 'normal'"
						[modules]="agGridModules"
						[localeText]="gridMessages()"
						[enableRtl]="locale.direction() === 'rtl'"
						[initialState]="view.state"
						[theme]="agTheme"
						[rowData]="agRows()"
						[columnDefs]="agColumns()"
						[getRowId]="agRowId"
						[headerHeight]="tableHeaderHeight()"
						[rowHeight]="tableRowHeight()"
						[style.height]="pageScroll() && rows().length > 0 ? null : agHeight()"
						[rowSelection]="agSelectionOptions"
						(gridReady)="onGridReady($event)"
						(sortChanged)="onSortChanged($event)"
						(columnMoved)="onColumnLayoutChanged($event)"
						(columnResized)="onColumnLayoutChanged($event)"
						(selectionChanged)="agSelectionChanged($event)"
						[animateRows]="false"
						[suppressCellFocus]="false"
						[loading]="loading()"
						[suppressNoRowsOverlay]="true"
						(rowClicked)="agRowClicked($event)"
						(cellKeyDown)="agCellKeyDown($event)"
						(bodyScrollEnd)="agBodyScrollEnd($event)"
						[isFullWidthRow]="agIsFullWidthRow"
						[fullWidthCellRenderer]="agFullWidthRenderer"
						[fullWidthCellRendererParams]="agFullWidthRendererParams"
					/>
				}
				@if (!rows().length && !loading()) {
					@if (projectionComponent('empty', hostContext()); as component) {
						<div class="nx-results-projection__empty-content">
							<ng-container
								*ngComponentOutlet="component; inputs: componentInputs(hostContext())"
							/>
						</div>
					} @else {
						@if (template('empty')) {
							<div class="nx-results-projection__empty-content">
								<ng-container *ngTemplateOutlet="template('empty'); context: hostContext()" />
							</div>
						}
						@if (!template('empty')) {
							<p class="nx-results-projection__empty" role="status">
								{{ 'app.sdk.results-projection.no-results-e8d3f0' | webuiMessage: 'No results.' }}
							</p>
						}
					}
				}
			</div>
		} @else if (
			rows().length || template('default') || projectionComponent('default', hostContext())
		) {
			@if (projectionComponent('default', hostContext()); as component) {
				<ng-container *ngComponentOutlet="component; inputs: componentInputs(hostContext())" />
			} @else if (template('default'); as customDefault) {
				<ng-container *ngTemplateOutlet="customDefault; context: hostContext()" />
			} @else {
				@if (mode() === 'list') {
					<ul class="nx-results-projection__cards list-group list-group-flush" role="list">
						<ng-container *ngTemplateOutlet="cardRows" />
					</ul>
				} @else {
					<div class="nx-results-projection__cards nx-results-projection__grid" role="list">
						<ng-container *ngTemplateOutlet="cardRows" />
					</div>
				}
				<ng-template #cardRows>
					@if (mode() === 'grid' && shouldVirtualize()) {
						<ng-container
							*cdkVirtualFor="let group of gridRows(); trackBy: trackByGridRow; let index = index"
						>
							<div class="nx-results-projection__grid-row">
								@for (row of group; track row.uid; let itemIndex = $index) {
									<ng-container
										*ngTemplateOutlet="
											cardRow;
											context: { $implicit: row, index: index * gridColumns + itemIndex }
										"
									/>
								}
							</div>
						</ng-container>
					} @else if (shouldVirtualize()) {
						<ng-container
							*cdkVirtualFor="let row of rows(); trackBy: trackByRow; let index = index"
						>
							<ng-container
								*ngTemplateOutlet="cardRow; context: { $implicit: row, index: index }"
							/>
						</ng-container>
					} @else if (mode() === 'grid') {
						<div class="nx-results-projection__grid-row">
							@for (row of rows(); track row.uid; let index = $index) {
								<ng-container
									*ngTemplateOutlet="cardRow; context: { $implicit: row, index: index }"
								/>
							}
						</div>
					} @else {
						@for (row of rows(); track row.uid; let index = $index) {
							<ng-container
								*ngTemplateOutlet="cardRow; context: { $implicit: row, index: index }"
							/>
						}
					}
				</ng-template>
				<ng-template #cardRow let-row let-index="index">
					@if (projectionComponent('item', rowContext(row, index)); as component) {
						<ng-container
							*ngComponentOutlet="component; inputs: componentInputs(rowContext(row, index))"
						/>
					} @else if (template('item'); as item) {
						<ng-container *ngTemplateOutlet="item; context: rowContext(row, index)" />
					} @else {
						<article
							role="listitem"
							tabindex="0"
							[class.nx-results-projection__selected]="isSelected(row)"
							(keydown)="keyDown($event, row)"
							(click)="rowClick($event, row)"
						>
							<input
								type="checkbox"
								[attr.aria-label]="
									'sdk.results.select' | webuiMessage: 'Select {label}' : { label: label(row) }
								"
								[checked]="isSelected(row)"
								[disabled]="selectionDisabled(row)"
								(click)="$event.stopPropagation()"
								(change)="toggle(row)"
							/>
							@if (cellComponent(rowContext(row, index), 'title'); as component) {
								<ng-container
									*ngComponentOutlet="component; inputs: componentInputs(rowContext(row, index))"
								/>
							} @else {
								<ng-container *ngTemplateOutlet="cellTemplate(); context: rowContext(row, index)" />
								@if (!cellTemplate()) {
									<strong>{{ label(row) }}</strong
									><span>{{ row.type }}</span>
								}
							}
							@if (projectionComponent('action', rowContext(row, index)); as component) {
								<ng-container
									*ngComponentOutlet="component; inputs: componentInputs(rowContext(row, index))"
								/>
							} @else {
								<ng-container
									*ngTemplateOutlet="template('action'); context: rowContext(row, index)"
								/>
							}
						</article>
					}
				</ng-template>
			}
		} @else if (!loading()) {
			@if (projectionComponent('empty', hostContext()); as component) {
				<ng-container *ngComponentOutlet="component; inputs: componentInputs(hostContext())" />
			} @else {
				<ng-container *ngTemplateOutlet="template('empty'); context: hostContext()" />
				@if (!template('empty')) {
					<p role="status">
						{{ 'app.sdk.results-projection.no-results-e8d3f0' | webuiMessage: 'No results.' }}
					</p>
				}
			}
		}
		@if (projectionComponent('form', hostContext()); as component) {
			<ng-container *ngComponentOutlet="component; inputs: componentInputs(hostContext())" />
		} @else {
			<ng-container *ngTemplateOutlet="template('form'); context: hostContext()" />
		}
	`,
	styles: `
		:host {
			display: block;
		}
		.nx-results-projection__grid-shell {
			position: relative;
		}
		.nx-results-projection__ag-grid {
			display: block;
			width: 100%;
			min-height: 128px;
			height: var(--nx-results-projection-grid-height, min(60vh, 600px));
			--ag-background-color: var(--nuxeo-box, #fff);
			--ag-foreground-color: var(--nuxeo-text-default, #222);
			--ag-header-background-color: var(--nuxeo-box, #fff);
			--ag-border-color: var(--nuxeo-border, #ddd);
			--ag-row-border-color: var(--nuxeo-border, #ddd);
			--ag-selected-row-background-color: color-mix(
				in srgb,
				var(--nuxeo-primary-color, #06f) 10%,
				var(--nuxeo-box, #fff)
			);
		}
		.nx-results-projection__ag-grid--empty {
			height: 128px;
		}
		.nx-results-projection__ag-grid--page-scroll {
			height: auto;
			min-height: 0;
		}
		// AG Grid's auto-height layout reserves 150px for its rows area, which draws an empty band
		// under short result sets; the grid only grows with its rows.
		.nx-results-projection__ag-grid--page-scroll
			::ng-deep
			.ag-layout-auto-height
			.ag-grid-scrolling-rows,
		.nx-results-projection__ag-grid--page-scroll
			::ng-deep
			.ag-layout-auto-height
			.ag-center-cols-viewport,
		.nx-results-projection__ag-grid--page-scroll
			::ng-deep
			.ag-layout-auto-height
			.ag-center-cols-container {
			min-height: 0;
		}
		// Header cells hold their own filter controls, which show focus; the grid's 3px inset ring
		// around the whole cell is not drawn.
		.nx-results-projection__ag-grid ::ng-deep .ag-header-cell:focus-visible,
		.nx-results-projection__ag-grid ::ng-deep .ag-header-cell:focus-within {
			box-shadow: none;
			outline: none;
		}
		// Stock nuxeo-data-table: the column-settings gear is the last header cell, flush with
		// the frame, not a toolbar control above the table.
		.nx-results-projection__ag-grid ::ng-deep .nx-results-projection__settings-header {
			padding: 0;
		}
		.nx-results-projection__empty {
			position: absolute;
			inset: var(--nx-results-table-header-height, 47px) 0 auto;
			display: grid;
			place-items: center;
			height: 80px;
			margin: 0;
			pointer-events: none;
			z-index: 1;
		}
		.nx-results-projection__empty-content {
			position: absolute;
			inset: var(--nx-results-table-header-height, 47px) 0 auto;
			display: grid;
			place-items: center;
			height: 80px;
			z-index: 1;
		}
		.nx-results-projection__cards {
			display: grid;
			gap: 0.5rem;
		}
		.nx-results-projection__grid {
			/* Virtual grid rows are the measured items; they must stack vertically. */
			display: block;
			container-type: inline-size;
		}
		.nx-results-projection__grid-row {
			display: var(--nx-results-grid-row-display, grid);
			width: 100%;
			gap: var(--nx-results-grid-gap, 1.5rem);
			grid-template-columns: repeat(1, minmax(0, 1fr));
		}
		@container (min-width: 768px) {
			.nx-results-projection__grid-row {
				grid-template-columns: repeat(3, minmax(0, 1fr));
			}
		}
		@container (min-width: 1200px) {
			.nx-results-projection__grid-row {
				grid-template-columns: repeat(5, minmax(0, 1fr));
			}
		}
		.nx-results-projection__ag-grid input[type='checkbox'] {
			width: 18px;
			height: 18px;
			accent-color: var(--nuxeo-primary-color);
		}
		.nx-results-projection__cards article {
			display: grid;
			gap: 0.25rem;
			padding: 0.75rem;
			border: 1px solid var(--bs-border-color, currentColor);
			cursor: pointer;
		}
		.nx-results-projection__selected {
			background: var(--bs-primary-bg-subtle, Canvas);
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsProjectionComponent<R extends ResultsProjectionRow = ResultsProjectionRow> {
	readonly rows = input.required<readonly R[]>();
	readonly selection = input<readonly string[]>([]);
	readonly mode = input<ResultsProjectionMode>('table');
	/** Enables CdkVirtualFor when this projection is hosted by a virtual scroll viewport. */
	readonly virtualized = input(false);
	/** Hosts with paged providers can opt into server sorting; existing views retain local sorting. */
	readonly remoteSort = input(false);
	readonly sortChange = output<{ columnId: string; direction: 'asc' | 'desc' | null }>();
	readonly columns = input<readonly ResultsProjectionColumn<R>[]>([]);
	/** Default hosts retain selection on body click/Enter; source adapters opt into navigation. */
	readonly rowActivation = input(false);
	/** Hosts can suspend navigation independently of mutation/selection availability. */
	readonly rowActivationDisabled = input(false);
	readonly rowActivated = output<R>();
	/** Emit user moves/resizes only; persistence belongs to an explicitly opted-in host. */
	readonly columnLayoutEnabled = input(false);
	readonly columnLayoutChange = output<readonly ResultsColumnLayout[]>();
	/** Stock data table: the column-settings gear is the last header cell of the table. */
	readonly columnChooser = input(false);
	/** The gear button that was clicked: the host opens its chooser and restores focus to it. */
	readonly columnChooserOpen = output<HTMLElement>();
	readonly readOnly = input(false);
	/** Hides the selection column for non-selectable dashboard/queue result views. */
	readonly selectionEnabled = input(true);
	readonly loading = input(false);
	/** The table grows with its rows and the page scrolls (stock document page); the grid keeps no
	 *  viewport of its own, so the wheel over the rows moves the page. Paging is the host's
	 *  load-more control. */
	readonly pageScroll = input(false);
	/** Presentation dimensions drive both AG Grid geometry and the containing viewport. */
	readonly tableHeaderHeight = input(47);
	readonly tableRowHeight = input(47);
	readonly selectionColumnWidth = input(48);
	readonly scope = input<unknown>(undefined);
	readonly hostId = input('results');
	readonly searchId = input<string>();
	/** Pass only the current view's compiled hooks; changing views never fetches search data. */
	readonly components = input<ResultsProjectionComponents>({});
	private readonly loadedComponents = signal<ReadonlyMap<string, Type<unknown>>>(new Map());
	private readonly componentLoads = new WeakMap<
		ResultsProjectionComponentLoader,
		Promise<Type<unknown>>
	>();
	private readonly componentTasks = inject(PendingTasks);
	private readonly componentErrors = inject(ErrorHandler);
	private readonly loadComponents = effect((onCleanup) => {
		const loaders = this.components();
		let active = true;
		const tasks: (() => void)[] = [];
		onCleanup(() => {
			active = false;
			for (const done of tasks) done();
		});
		this.loadedComponents.set(new Map());
		for (const [name, load] of Object.entries(loaders)) {
			if (!load) continue;
			const complete = this.componentTasks.add();
			let finished = false;
			const done = () => {
				if (!finished) complete();
				finished = true;
			};
			tasks.push(done);
			let pending = this.componentLoads.get(load);
			if (!pending) {
				pending = Promise.resolve()
					.then(load)
					.catch((error: unknown) => {
						this.componentLoads.delete(load);
						throw error;
					});
				this.componentLoads.set(load, pending);
			}
			void pending
				.then((component) => {
					if (active)
						this.loadedComponents.update((loaded) => new Map(loaded).set(name, component));
				})
				.catch((error: unknown) => {
					if (active) this.componentErrors.handleError(error);
				})
				.finally(done);
		}
	});
	/** Invalidate retained template contexts whenever the host replaces its result set. */
	readonly contextEpoch = input(0);
	readonly rowDisabled = input<(row: R) => boolean>(() => false);
	readonly selectionChange = output<readonly string[]>();
	/** Requests the next page at the loaded bottom only when scroll paging is enabled. */
	readonly loadMore = output<void>();
	readonly action = output<{
		readonly action: string;
		readonly row?: R;
		readonly argument?: unknown;
	}>();
	private readonly templates = contentChildren(ResultsProjectionTemplateDirective, {
		descendants: false,
	});
	private readonly hostTemplates = contentChildren(ResultsProjectionHostTemplateDirective, {
		descendants: false,
	});
	readonly locale = inject(WebUiLocale);
	private readonly messages = inject(WebUiMessages);
	readonly gridMessages = computed(() => gridLocale(this.messages));
	private readonly registry = inject(ResultsProjectionRegistry);
	private readonly paging = inject(ResultsPagingSettings);
	readonly visibleColumns = computed(() =>
		this.columns()
			.filter((column) => !column.hidden)
			.map((column) =>
				column.labelKey
					? { ...column, label: this.messages.text(column.labelKey, column.label) }
					: column,
			),
	);
	private readonly agApi = signal<GridApi<R> | null>(null);
	/** Locale/RTL are creation-time grid options. Snapshot user state before replacing it. */
	readonly gridViews = computed(() => {
		const language = this.locale.locale();
		const api = untracked(this.agApi);
		return [{ language, state: api && !api.isDestroyed() ? api.getState() : undefined }];
	});
	readonly agSelectionOptions = {
		mode: 'multiRow' as const,
		checkboxes: false,
		headerCheckbox: false,
		enableClickSelection: false as const,
		isRowSelectable: (node: { data?: R }) => !!node.data && !this.selectionDisabled(node.data),
	};
	readonly agHeight = computed(
		() =>
			`min(${Math.max(128, this.tableHeaderHeight() + 2 + this.rows().length * this.tableRowHeight())}px, var(--nx-results-projection-grid-height, min(60vh, 600px)))`,
	);
	agSelectionChanged(event: SelectionChangedEvent<R>): void {
		if (!['spaceKey', 'keyboardSelectAll'].includes(event.source) || this.selectionDisabled())
			return;
		const visibleIds = new Set(this.rows().map((row) => row.uid));
		const ids = new Set(this.selection().filter((id) => !visibleIds.has(id)));
		for (const node of event.selectedNodes || []) if (node.data) ids.add(node.data.uid);
		this.selectionChange.emit([...ids]);
	}
	onSortChanged(event: SortChangedEvent<R>): void {
		if (!this.remoteSort() || event.source !== 'uiColumnSorted') return;
		const columns = event.api.getColumnState();
		const sorted = columns.find((column) => column.sort);
		this.sortChange.emit({
			columnId: sorted?.colId ?? event.columns?.[0]?.getColId() ?? '',
			direction: sorted?.sort ?? null,
		});
	}

	onColumnLayoutChanged(event: ColumnMovedEvent<R> | ColumnResizedEvent<R>): void {
		if (
			!this.columnLayoutEnabled() ||
			!event.finished ||
			!['uiColumnMoved', 'uiColumnResized', 'uiColumnDragged'].includes(event.source)
		)
			return;
		const ids = new Set(this.visibleColumns().map((column) => column.id));
		this.columnLayoutChange.emit(
			event.api
				.getColumnState()
				.filter((column) => ids.has(column.colId))
				.map((column) => ({
					id: column.colId,
					...(!column.flex && typeof column.width === 'number' ? { width: column.width } : {}),
				})),
		);
	}

	onGridReady(event: GridReadyEvent<R>): void {
		this.agApi.set(event.api);
	}
	private readonly syncGridSelection = effect(() => {
		const selected = this.selected();
		const api = this.agApi();
		this.rows();
		if (!api || api.isDestroyed()) return;
		untracked(() => {
			api.forEachNode((node) => node.setSelected(!!node.data && selected.has(node.data.uid)));
			api.refreshCells({ force: true });
			api.refreshHeader();
		});
	});
	readonly agGridModules: Module[] = [
		LocaleModule,
		GridStateModule,
		ClientSideRowModelModule,
		ColumnApiModule,
		TextFilterModule,
		RowSelectionModule,
		RowApiModule,
		ScrollApiModule,
		RenderApiModule,
	];
	readonly agTheme = themeQuartz.withParams({
		accentColor: 'var(--nuxeo-primary-color, #0066cc)',
		backgroundColor: 'var(--nuxeo-box, #fff)',
		foregroundColor: 'var(--nuxeo-text-default, #222)',
		headerBackgroundColor: 'var(--nuxeo-box, #fff)',
		borderColor: 'var(--nuxeo-border, #ddd)',
		rowBorder: { color: 'var(--nuxeo-border, #ddd)', style: 'solid', width: 1 },
	});
	private bottomReached = false;
	private bottomKey = '';
	readonly agRowId = (params: { data: R }) => params.data.uid;
	readonly agIsFullWidthRow = (params: { rowNode: { data?: R } }) => {
		const row = params.rowNode.data;
		return !!row && this.hasDetail(row, this.rows().indexOf(row));
	};
	readonly agFullWidthRenderer = AgGridProjectionFullWidthComponent;
	readonly agFullWidthRendererParams: { host: ResultsProjectionComponent<R> } = { host: this };
	readonly agRows = computed(() => [...this.rows()]);
	readonly agColumns = computed<ColDef<R>[]>(() => {
		const columns: ColDef<R>[] = [];
		if (this.selectionEnabled())
			columns.push({
				colId: '__selection',
				headerName: '',
				width: this.selectionColumnWidth(),
				minWidth: this.selectionColumnWidth(),
				maxWidth: this.selectionColumnWidth(),
				pinned: this.locale.direction() === 'rtl' ? 'right' : 'left',
				...(this.columnLayoutEnabled()
					? {
							lockPosition: (this.locale.direction() === 'rtl' ? 'right' : 'left') as
								| 'left'
								| 'right',
							suppressMovable: true,
						}
					: {}),
				sortable: false,
				filter: false,
				cellRenderer: AgGridProjectionCheckboxComponent,
				cellRendererParams: { host: this },
				headerComponent: AgGridProjectionSelectAllComponent,
				headerComponentParams: { host: this },
			});
		for (const [index, column] of this.visibleColumns().entries())
			columns.push({
				colId: column.id,
				headerName: column.label,
				headerComponent: column.headerComponent,
				headerComponentParams: column.headerComponentParams,
				width: column.width,
				flex:
					this.columnLayoutEnabled() && column.width !== undefined
						? null
						: (column.flex ??
							(index === 0 || column.id === 'title' || column.id === 'path' ? 2 : 1)),
				...(this.columnLayoutEnabled() ? { resizable: true, suppressMovable: false } : {}),
				minWidth: column.minWidth ?? 100,
				sortable: column.sortable ?? true,
				filter: this.remoteSort() ? false : 'agTextColumnFilter',
				comparator: this.remoteSort() ? () => 0 : undefined,
				valueGetter: (params) => this.value(params.data!, column),
				cellRenderer: AgGridProjectionCellComponent,
				cellRendererParams: { host: this, projectionColumn: column },
			});
		if (this.hasActions())
			columns.push({
				colId: '__actions',
				headerName: this.messages.text('results.actions', 'Actions'),
				width: 96,
				minWidth: 64,
				sortable: false,
				filter: false,
				cellRenderer: AgGridProjectionActionsComponent,
				cellRendererParams: { host: this },
			});
		if (this.columnChooser())
			columns.push({
				colId: '__settings',
				headerName: '',
				width: SETTINGS_COLUMN_WIDTH,
				minWidth: SETTINGS_COLUMN_WIDTH,
				maxWidth: SETTINGS_COLUMN_WIDTH,
				lockPosition: this.locale.direction() === 'rtl' ? 'left' : 'right',
				suppressMovable: true,
				resizable: false,
				sortable: false,
				filter: false,
				headerClass: 'nx-results-projection__settings-header',
				headerComponent: AgGridProjectionColumnSettingsComponent,
				headerComponentParams: { host: this },
			});
		return columns;
	});
	readonly selected = computed(() => new Set(this.selection()), {
		equal: (a, b) => a.size === b.size && [...a].every((id) => b.has(id)),
	});
	readonly allSelected = computed(() => {
		const eligible = this.rows().filter((row) => !this.selectionDisabled(row));
		return eligible.length > 0 && eligible.every((row) => this.selected().has(row.uid));
	});
	readonly trackByRow = (_index: number, row: R) => row.uid;
	private hasActions(): boolean {
		return !!(
			this.rows().some((row, index) => this.hasRowActions(row, index)) ||
			this.template('action') ||
			this.template('settings')
		);
	}
	hasRowActions(row: R, index: number): boolean {
		const context = this.rowContext(row, index);
		return !!(
			this.projectionComponent('action', context) ||
			this.projectionComponent('settings', context) ||
			this.template('action') ||
			this.template('settings')
		);
	}
	hasDetails(): boolean {
		return !!(
			this.template('rowdetail') ||
			this.template('detail') ||
			this.rows().some((row, index) => !!this.detailComponent(row, index))
		);
	}
	hasDetail(row: R, index: number): boolean {
		return !!(this.detailTemplate() || this.detailComponent(row, index));
	}
	detailComponent(row: R, index: number) {
		const context = this.rowContext(row, index);
		return (
			this.projectionComponent('rowdetail', context) || this.projectionComponent('detail', context)
		);
	}
	detailTemplate(): TemplateRef<unknown> | null {
		return this.template('rowdetail') || this.template('detail');
	}
	/** Detail templates can span multiple/variable-height rows, which fixed-size virtual scrolling cannot measure. */
	shouldVirtualize(): boolean {
		return (
			this.virtualized() &&
			!this.template('rowdetail') &&
			!this.template('detail') &&
			!this.rows().some((row, index) => this.hasRegisteredDetail(row, index))
		);
	}
	/** Fifteen is the least common multiple of the 1/3/5 responsive card columns. */
	readonly gridColumns = 15;
	gridRows(): readonly (readonly R[])[] {
		const rows = this.rows();
		return Array.from({ length: Math.ceil(rows.length / this.gridColumns) }, (_, index) =>
			rows.slice(index * this.gridColumns, (index + 1) * this.gridColumns),
		);
	}
	readonly trackByGridRow = (index: number) => index;
	private hasRegisteredDetail(row: R, index: number): boolean {
		const context = this.rowContext(row, index);
		return !!(
			this.projectionComponent('rowdetail', context) || this.projectionComponent('detail', context)
		);
	}

	template(name: ResultsProjectionTemplateName): TemplateRef<unknown> | null {
		return (
			this.templates().find((candidate) => {
				const attribute = candidate as unknown as { nxResultsTemplate?: unknown };
				return attribute.nxResultsTemplate === name;
			})?.template ??
			this.hostTemplates().find((candidate) => candidate.nxResultsHostTemplate === name)
				?.template ??
			null
		);
	}
	/** A registered client component replaces a first-party template; absence falls back to projection. */
	projectionComponent(name: string, context: unknown): Type<unknown> | null {
		return this.registeredComponent(name, context) ?? this.loadedComponents().get(name) ?? null;
	}
	/** Check both registered cell hooks before the definition's column-specific fallback. */
	cellComponent(context: ResultsProjectionContext<R>, columnId = context.column?.id) {
		const name = columnId ? `cell:${columnId}` : 'cell';
		return (
			this.registeredComponent(name, context) ??
			this.registeredComponent('cell', context) ??
			this.loadedComponents().get(name) ??
			this.loadedComponents().get('cell') ??
			null
		);
	}
	private registeredComponent(name: string, context: unknown) {
		return this.registry.resolve(
			this.hostId(),
			name as ResultsProjectionTemplateName,
			this.mode(),
			context,
			this.searchId(),
		);
	}
	componentInputs(context: unknown): Record<string, unknown> {
		return { context };
	}
	cellTemplate(column?: ResultsProjectionColumn<R>): TemplateRef<unknown> | null {
		return (
			(column ? this.template(`cell:${column.id}` as ResultsProjectionTemplateName) : null) ??
			this.template('cell')
		);
	}
	disabled(row?: R): boolean {
		return this.loading() || this.readOnly() || !!(row && this.rowDisabled()(row));
	}
	/** Selection can be disabled without suppressing projected row actions. */
	selectionDisabled(row?: R): boolean {
		return !this.selectionEnabled() || this.disabled(row);
	}
	isSelected(row: R): boolean {
		return this.selected().has(row.uid);
	}
	label(row: R): string {
		return String(row.title ?? row.uid);
	}
	value(row: R, column: ResultsProjectionColumn<R>): unknown {
		return column.value?.(row) ?? (row as Record<string, unknown>)[column.id] ?? '';
	}
	toggle(row: R): void {
		if (this.selectionDisabled(row)) return;
		const selected = new Set(this.selection());
		if (selected.has(row.uid)) selected.delete(row.uid);
		else selected.add(row.uid);
		this.selectionChange.emit([...selected]);
	}
	toggleAll(): void {
		if (this.selectionDisabled()) return;
		const selected = new Set(this.selection());
		if (this.allSelected())
			this.rows()
				.filter((row) => !this.selectionDisabled(row))
				.forEach((row) => selected.delete(row.uid));
		else
			this.rows()
				.filter((row) => !this.selectionDisabled(row))
				.forEach((row) => selected.add(row.uid));
		this.selectionChange.emit([...selected]);
	}
	keyDown(event: KeyboardEvent, row: R): void {
		if (event.target !== event.currentTarget) return;
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		if (this.rowActivation() && event.key === 'Enter') this.activateRow(row);
		else this.toggle(row);
	}
	private activateRow(row: R): void {
		// Read-only lists can navigate without selecting; selectable hosts retain their busy guard.
		if (
			this.loading() ||
			this.rowActivationDisabled() ||
			this.rowDisabled()(row) ||
			(this.selectionEnabled() && this.readOnly()) ||
			!this.rows().includes(row)
		)
			return;
		this.rowActivated.emit(row);
	}
	rowClick(event: MouseEvent, row: R): void {
		const target = event.target as Element | null;
		if (target?.closest('button,a,input,select,textarea,label,[data-nx-results-interactive]'))
			return;
		if (this.rowActivation()) this.activateRow(row);
		else this.toggle(row);
	}
	agRowClicked(event: RowClickedEvent<R>): void {
		if (event.data && event.event instanceof MouseEvent) this.rowClick(event.event, event.data);
	}
	agCellKeyDown(event: { event?: Event | null; data?: R }): void {
		if (!event.data || !(event.event instanceof KeyboardEvent)) return;
		if (!['Enter', ' '].includes(event.event.key)) return;
		const target = event.event.target as Element | null;
		if (target?.closest('button,a,input,select,textarea,label,[data-nx-results-interactive]'))
			return;
		event.event.preventDefault();
		if (this.rowActivation() && event.event.key === 'Enter') this.activateRow(event.data);
		else this.toggle(event.data);
	}
	agBodyScrollEnd(event: BodyScrollEndEvent<R>): void {
		if (!this.paging.scrollPagingEnabled()) {
			this.bottomReached = false;
			return;
		}
		const key = `${this.contextEpoch()}:${this.rows().length}`;
		if (key !== this.bottomKey) {
			this.bottomKey = key;
			this.bottomReached = false;
		}
		const api = event.api;
		if (
			!this.loading() &&
			!this.bottomReached &&
			api.getDisplayedRowCount() > 0 &&
			api.getLastDisplayedRowIndex() >= api.getDisplayedRowCount() - 1
		) {
			this.bottomReached = true;
			this.loadMore.emit();
		}
	}
	selectRow(event: Event, row: R): void {
		if (event instanceof KeyboardEvent) {
			if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
			event.preventDefault();
			this.toggle(row);
			return;
		}
		this.rowClick(event as MouseEvent, row);
	}
	rowContext(
		row: R,
		index: number,
		column?: ResultsProjectionColumn<R>,
	): ResultsProjectionContext<R> {
		const epoch = this.contextEpoch();
		const rows = this.rows();
		const scope = this.scope();
		const searchId = this.searchId();
		const current = () =>
			this.contextEpoch() === epoch &&
			this.rows() === rows &&
			this.scope() === scope &&
			this.searchId() === searchId &&
			this.rows().some((candidate) => candidate === row);
		return {
			searchId,
			row,
			index,
			selected: this.isSelected(row),
			selection: this.selected(),
			readonly: this.readOnly(),
			loading: this.loading(),
			columns: this.visibleColumns(),
			column,
			value: column ? this.value(row, column) : undefined,
			scope: this.scope(),
			toggleSelection: () => {
				if (current()) this.toggle(row);
			},
			selectRow: (event) => {
				if (current()) this.selectRow(event, row);
			},
			activateRow: () => {
				if (current() && this.rowActivation()) this.activateRow(row);
			},
			invokeAction: (action, argument) => {
				if (current() && !this.disabled(row)) this.action.emit({ action, row, argument });
			},
		};
	}
	hostContext(): ResultsProjectionHostContext<R> {
		const epoch = this.contextEpoch();
		const rows = this.rows();
		const scope = this.scope();
		const searchId = this.searchId();
		const current = () =>
			this.contextEpoch() === epoch &&
			this.rows() === rows &&
			this.scope() === scope &&
			this.searchId() === searchId;
		return {
			searchId,
			rows: this.rows(),
			selection: this.selected(),
			readonly: this.readOnly(),
			loading: this.loading(),
			columns: this.visibleColumns(),
			scope: this.scope(),
			toggleAll: () => {
				if (current()) this.toggleAll();
			},
			clearSelection: () => {
				if (current() && !this.disabled()) this.selectionChange.emit([]);
			},
			invokeAction: (action, argument) => {
				if (current() && !this.disabled()) this.action.emit({ action, argument });
			},
		};
	}
}
