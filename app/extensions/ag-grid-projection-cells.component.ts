import { WebUiMessagePipe } from './webui-messages';
import { WebUiIconComponent } from './webui-icons';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	Directive,
	ElementRef,
	inject,
	Input,
	OnDestroy,
	Type,
	viewChild,
} from '@angular/core';
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams, IHeaderParams } from 'ag-grid-community';
import { ResultsProjectionColumn, ResultsProjectionRow } from './results-projection';
import type { ResultsProjectionComponent } from './results-projection.component';

interface ProjectionCellParams<
	R extends ResultsProjectionRow = ResultsProjectionRow,
> extends ICellRendererParams<R> {
	readonly host: ResultsProjectionComponent<R>;
	readonly projectionColumn?: ResultsProjectionColumn<R>;
}

@Directive()
abstract class ProjectionCell<R extends ResultsProjectionRow> implements ICellRendererAngularComp {
	private readonly changeDetector = inject(ChangeDetectorRef);
	@Input() params!: ProjectionCellParams<R>;
	agInit(params: ProjectionCellParams<R>): void {
		this.params = params;
		this.changeDetector.markForCheck();
	}
	refresh(params: ProjectionCellParams<R>): boolean {
		this.params = params;
		this.changeDetector.markForCheck();
		return true;
	}
	get row(): R {
		return this.params.data!;
	}
	get index(): number {
		return this.params.node.rowIndex ?? 0;
	}
	get column(): ResultsProjectionColumn<R> {
		return this.params.projectionColumn!;
	}
	context(column = this.params.projectionColumn) {
		return this.params.host.rowContext(this.row, this.index, column);
	}
	component(name: string): Type<unknown> | null {
		return this.params.host.projectionComponent(name, this.context());
	}
}

@Component({
	selector: 'nx-ag-grid-projection-cell',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgComponentOutlet, NgTemplateOutlet],
	template: `@if (params.host.cellComponent(context()); as renderer) {
			<ng-container *ngComponentOutlet="renderer; inputs: params.host.componentInputs(context())" />
		} @else {
			<ng-container *ngTemplateOutlet="params.host.cellTemplate(column); context: context()" />
			@if (!params.host.cellTemplate(column)) {
				{{ params.host.value(row, column) }}
			}
		}`,
})
export class AgGridProjectionCellComponent<
	R extends ResultsProjectionRow = ResultsProjectionRow,
> extends ProjectionCell<R> {}

@Component({
	selector: 'nx-ag-grid-projection-checkbox',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgComponentOutlet, NgTemplateOutlet, WebUiMessagePipe],
	template: `@if (component('checkbox'); as renderer) {
			<ng-container *ngComponentOutlet="renderer; inputs: params.host.componentInputs(context())" />
		} @else {
			<ng-container *ngTemplateOutlet="params.host.template('checkbox'); context: context()" />
			@if (!params.host.template('checkbox')) {
				<input
					type="checkbox"
					[attr.aria-label]="
						'sdk.results.select'
							| webuiMessage: 'Select {label}' : { label: params.host.label(row) }
					"
					[checked]="params.host.isSelected(row)"
					[disabled]="params.host.selectionDisabled(row)"
					(click)="$event.stopPropagation()"
					(change)="params.host.toggle(row)"
				/>
			}
		}`,
})
export class AgGridProjectionCheckboxComponent<
	R extends ResultsProjectionRow = ResultsProjectionRow,
> extends ProjectionCell<R> {}

@Component({
	imports: [WebUiMessagePipe],
	selector: 'nx-ag-grid-projection-select-all',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	styles: `
		:host {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 100%;
			height: 100%;
		}
	`,
	// An empty folder or search has nothing to select: no box.
	template: `@if (host.rows().length) {
		<input
			type="checkbox"
			[attr.aria-label]="
				'app.modules.picturebook-content-layout.select-displayed-documents-7aa41d'
					| webuiMessage: 'Select displayed documents'
			"
			[checked]="host.allSelected()"
			[indeterminate]="!host.allSelected() && host.rows().some(isRowSelected)"
			[disabled]="host.selectionDisabled()"
			(click)="$event.stopPropagation()"
			(change)="host.toggleAll()"
		/>
	}`,
})
export class AgGridProjectionSelectAllComponent<
	R extends ResultsProjectionRow = ResultsProjectionRow,
> {
	private readonly changeDetector = inject(ChangeDetectorRef);
	params!: IHeaderParams & { host: ResultsProjectionComponent<R> };
	agInit(params: IHeaderParams & { host: ResultsProjectionComponent<R> }): void {
		this.params = params;
		this.changeDetector.markForCheck();
	}
	refresh(params: IHeaderParams & { host: ResultsProjectionComponent<R> }): boolean {
		this.params = params;
		this.changeDetector.markForCheck();
		return true;
	}
	readonly isRowSelected = (row: R) => this.host.isSelected(row);
	get host(): ResultsProjectionComponent<R> {
		return this.params.host;
	}
}

@Component({
	imports: [WebUiIconComponent, WebUiMessagePipe],
	selector: 'nx-ag-grid-projection-column-settings',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	styles: `
		:host {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 100%;
			height: 100%;
		}
		button {
			display: flex;
			align-items: center;
			justify-content: center;
			box-sizing: border-box;
			width: 28px;
			height: 28px;
			padding: 0;
			border: 0;
			border-radius: 0.2rem;
			background: transparent;
			color: var(--nuxeo-text-light, #606978);
			cursor: pointer;
			--webui-icon-size: 20px;
		}
		button:hover {
			background: color-mix(in srgb, var(--nuxeo-primary-color, #06f) 5%, transparent);
		}
		button:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color, #06f);
			outline-offset: -2px;
		}
	`,
	// Stock nuxeo-data-table-settings: the gear is the last header cell and opens Columns Settings.
	template: `<button
		type="button"
		#gear
		class="nx-results-projection__settings-button"
		[attr.aria-label]="'tableSettings.columnSettings' | webuiMessage: 'Columns Settings'"
		[attr.title]="'tableSettings.columnSettings' | webuiMessage: 'Columns Settings'"
		(click)="open($event)"
	>
		<nx-webui-icon name="nuxeo:settings" />
	</button>`,
})
export class AgGridProjectionColumnSettingsComponent<
	R extends ResultsProjectionRow = ResultsProjectionRow,
> implements OnDestroy {
	private readonly changeDetector = inject(ChangeDetectorRef);
	private readonly gear = viewChild.required<ElementRef<HTMLButtonElement>>('gear');
	params!: IHeaderParams & { host: ResultsProjectionComponent<R> };
	private cell?: HTMLElement;
	/** AG Grid focuses the bare header cell after it rebuilds the header; the gear is its only control. */
	private readonly forwardFocus = (event: FocusEvent) => {
		if (!event.relatedTarget) this.gear().nativeElement.focus();
	};
	agInit(params: IHeaderParams & { host: ResultsProjectionComponent<R> }): void {
		this.params = params;
		this.cell?.removeEventListener('focus', this.forwardFocus);
		this.cell = params.eGridHeader;
		this.cell.addEventListener('focus', this.forwardFocus);
		this.changeDetector.markForCheck();
	}
	refresh(params: IHeaderParams & { host: ResultsProjectionComponent<R> }): boolean {
		this.agInit(params);
		return true;
	}
	ngOnDestroy(): void {
		this.cell?.removeEventListener('focus', this.forwardFocus);
	}
	/** The host opens its chooser and, when it closes, restores focus to this button. */
	open(event: Event): void {
		event.stopPropagation();
		this.params.host.columnChooserOpen.emit(event.currentTarget as HTMLElement);
	}
}

@Component({
	selector: 'nx-ag-grid-projection-actions',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgComponentOutlet, NgTemplateOutlet],
	template: `@if (component('action'); as renderer) {
			<ng-container *ngComponentOutlet="renderer; inputs: params.host.componentInputs(context())" />
		} @else {
			<ng-container *ngTemplateOutlet="params.host.template('action'); context: context()" />
		}
		@if (component('settings'); as renderer) {
			<ng-container *ngComponentOutlet="renderer; inputs: params.host.componentInputs(context())" />
		} @else {
			<ng-container *ngTemplateOutlet="params.host.template('settings'); context: context()" />
		}`,
})
export class AgGridProjectionActionsComponent<
	R extends ResultsProjectionRow = ResultsProjectionRow,
> extends ProjectionCell<R> {}

/**
 * Community full-width rows keep a detail projection adjacent to its document while retaining
 * AG Grid's native sorting, filtering and virtual scrolling for the document itself.
 */
@Component({
	selector: 'nx-ag-grid-projection-full-width',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgComponentOutlet, NgTemplateOutlet, WebUiMessagePipe],
	template: `<article class="nx-ag-grid-projection-full-width" tabindex="0">
		<div
			class="nx-ag-grid-projection-full-width__cells"
			[style.grid-template-columns]="cellGridColumns()"
		>
			@if (params.host.selectionEnabled()) {
				<div>
					@if (component('checkbox'); as renderer) {
						<ng-container
							*ngComponentOutlet="renderer; inputs: params.host.componentInputs(context())"
						/>
					} @else {
						<ng-container
							*ngTemplateOutlet="params.host.template('checkbox'); context: context()"
						/>
						@if (!params.host.template('checkbox')) {
							<input
								type="checkbox"
								[attr.aria-label]="
									'sdk.results.select'
										| webuiMessage: 'Select {label}' : { label: params.host.label(row) }
								"
								[checked]="params.host.isSelected(row)"
								[disabled]="params.host.selectionDisabled(row)"
								(click)="$event.stopPropagation()"
								(change)="params.host.toggle(row)"
							/>
						}
					}
				</div>
			}
			@for (column of params.host.visibleColumns(); track column.id) {
				<div>
					@if (cellComponent(column); as renderer) {
						<ng-container
							*ngComponentOutlet="
								renderer;
								inputs: params.host.componentInputs(params.host.rowContext(row, index, column))
							"
						/>
					} @else {
						<ng-container
							*ngTemplateOutlet="
								params.host.cellTemplate(column);
								context: params.host.rowContext(row, index, column)
							"
						/>
						@if (!params.host.cellTemplate(column)) {
							{{ params.host.value(row, column) }}
						}
					}
				</div>
			}
			@if (params.host.hasRowActions(row, index)) {
				<div>
					@if (component('action'); as renderer) {
						<ng-container
							*ngComponentOutlet="renderer; inputs: params.host.componentInputs(context())"
						/>
					} @else {
						<ng-container *ngTemplateOutlet="params.host.template('action'); context: context()" />
					}
					@if (component('settings'); as renderer) {
						<ng-container
							*ngComponentOutlet="renderer; inputs: params.host.componentInputs(context())"
						/>
					} @else {
						<ng-container
							*ngTemplateOutlet="params.host.template('settings'); context: context()"
						/>
					}
				</div>
			}
		</div>
		<section class="nx-ag-grid-projection-full-width__detail">
			@if (params.host.detailComponent(row, index); as renderer) {
				<ng-container
					*ngComponentOutlet="renderer; inputs: params.host.componentInputs(context())"
				/>
			} @else {
				<ng-container *ngTemplateOutlet="params.host.detailTemplate(); context: context()" />
			}
		</section>
	</article>`,
	styles: `
		.nx-ag-grid-projection-full-width {
			background: var(--nuxeo-box, #fff);
			border-bottom: 1px solid var(--nuxeo-border, #ddd);
		}
		.nx-ag-grid-projection-full-width__cells {
			display: grid;
			grid-template-columns: 48px repeat(auto-fit, minmax(100px, 1fr));
			min-height: 47px;
			align-items: center;
		}
		.nx-ag-grid-projection-full-width__cells > div {
			min-width: 0;
			padding: 0.5rem;
		}
		.nx-ag-grid-projection-full-width__detail {
			padding: 0.75rem 1rem;
			border-top: 1px solid var(--nuxeo-border, #ddd);
		}
	`,
})
export class AgGridProjectionFullWidthComponent<
	R extends ResultsProjectionRow = ResultsProjectionRow,
>
	extends ProjectionCell<R>
	implements AfterViewInit, OnDestroy
{
	private readonly element = inject(ElementRef<HTMLElement>);
	private observer?: ResizeObserver;
	ngAfterViewInit(): void {
		this.observer = new ResizeObserver(([entry]) => {
			const height = Math.ceil(entry.contentRect.height);
			if (height > 0 && this.params.node.rowHeight !== height) {
				this.params.node.setRowHeight(height);
				this.params.api.onRowHeightChanged();
			}
		});
		this.observer.observe(this.element.nativeElement);
	}
	ngOnDestroy(): void {
		this.observer?.disconnect();
	}
	cellComponent(column: ResultsProjectionColumn<R>): Type<unknown> | null {
		const context = this.params.host.rowContext(this.row, this.index, column);
		return this.params.host.cellComponent(context);
	}
	cellGridColumns(): string {
		const columns = this.params.host.visibleColumns().map((column, index) => {
			if (column.width) return `${column.width}px`;
			const flex =
				column.flex ?? (index === 0 || column.id === 'title' || column.id === 'path' ? 2 : 1);
			return `minmax(${column.minWidth ?? 100}px, ${flex}fr)`;
		});
		if (this.params.host.selectionEnabled()) columns.unshift('48px');
		if (this.params.host.hasRowActions(this.row, this.index)) columns.push('96px');
		return columns.join(' ');
	}
}
