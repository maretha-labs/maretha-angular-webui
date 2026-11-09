import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	inject,
	OnDestroy,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IHeaderParams } from 'ag-grid-community';
import { WebUiIconComponent } from '@maretha/webui-sdk';
/** Stock header: a sort control only for sortable columns (`sort-by`); the table frame owns settings. */
@Component({
	selector: 'nx-default-search-column-header',
	imports: [NgTemplateOutlet, WebUiIconComponent],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<ng-template #label>{{ params.displayName }}</ng-template>
		@if (params.enableSorting) {
			<button
				class="column-label"
				type="button"
				(keydown.enter)="$event.stopPropagation()"
				(keydown.space)="$event.stopPropagation()"
				(click)="params.progressSort($event.shiftKey)"
			>
				<ng-container *ngTemplateOutlet="label" />

				<nx-webui-icon
					[class.sort-inactive]="!params.column.getSort()"
					[name]="
						params.column.getSort() === 'desc' ? 'icons:arrow-downward' : 'icons:arrow-upward'
					"
				/>
			</button>
		} @else {
			<span class="column-label column-label--static"
				><ng-container *ngTemplateOutlet="label"
			/></span>
		}
	`,
	styles: `
		:host {
			display: flex;
			align-items: center;
			width: 100%;
			min-width: 0;
		}
		.column-label {
			display: flex;
			align-items: center;
			flex: 1;
			justify-content: space-between;
			min-width: 0;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			border: 0;
			background: transparent;
			color: inherit;
			font: inherit;
			text-align: start;
			padding: 0;
			cursor: pointer;
		}
		.column-label nx-webui-icon {
			--webui-icon-size: 24px;
			margin-inline-start: 16px;
			margin-inline-end: 8px;
		}
		.column-label--static {
			cursor: default;
		}
		.sort-inactive {
			opacity: 0.6;
		}
	`,
})
export class DefaultSearchColumnHeaderComponent implements OnDestroy {
	params!: IHeaderParams;
	private readonly cdr = inject(ChangeDetectorRef);
	private readonly sortChanged = () => this.cdr.markForCheck();

	agInit(params: IHeaderParams): void {
		this.params = params;
		params.column.addEventListener('sortChanged', this.sortChanged);
	}
	refresh(params: IHeaderParams): boolean {
		this.params = params;
		this.cdr.markForCheck();
		return true;
	}
	ngOnDestroy(): void {
		this.params.column.removeEventListener('sortChanged', this.sortChanged);
	}
}
