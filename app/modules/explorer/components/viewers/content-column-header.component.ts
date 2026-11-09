import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	inject,
	OnDestroy,
} from '@angular/core';
import { IHeaderParams } from 'ag-grid-community';
import { WebUiIconComponent, WebUiMessagePipe } from '@maretha/webui-sdk';
export type ContentColumnAggregate = 'dc_modified_agg' | 'dc_last_contributor_agg';

/** One aggregate bucket a header filter offers. */
export interface ContentColumnBucket {
	readonly key: string;
	readonly label: string;
	readonly labelKey?: string;
	readonly count: number;
}

/** The filter state a listing shares with its column headers: the folder View and Trash tabs. */
export interface ContentColumnFilters {
	busy(): boolean;
	titleFilter(): string;
	setTitleFilter(value: string): void;
	aggregateBuckets(): Partial<Record<ContentColumnAggregate, readonly ContentColumnBucket[]>>;
	aggregateFilters(): Record<ContentColumnAggregate, readonly string[]>;
	toggleAggregate(name: ContentColumnAggregate, key: string): void;
}

interface ContentHeaderParams extends IHeaderParams {
	content: ContentColumnFilters;
	id: string;
}

/** Column filters live in the actual grid header, retaining native resizing and reordering. */
@Component({
	selector: 'nx-content-column-header',
	imports: [WebUiIconComponent, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<div class="heading" [class.heading--field]="params.id === 'title'">
		<!-- Title: the label is the field's placeholder, only the arrow sorts. -->
		<button
			type="button"
			[title]="params.displayName"
			(click)="params.id === 'title' ? focusFilter($event) : params.progressSort($event.shiftKey)"
		>
			{{ params.displayName }}
			@if (params.id !== 'title') {
				<span aria-hidden="true">{{
					params.column.getSort() === 'asc' ? ' ↑' : params.column.getSort() === 'desc' ? ' ↓' : ''
				}}</span>
			}
		</button>
		@if (params.id === 'title') {
			<input
				type="search"
				placeholder=" "
				[value]="params.content.titleFilter()"
				[attr.aria-label]="
					'app.modules.picturebook-content-layout.filter-by-title-fbe002'
						| webuiMessage: 'Filter by title'
				"
				[disabled]="params.content.busy()"
				(input)="params.content.setTitleFilter($any($event.target).value)"
			/>
			<!-- Stock data-table: the sort arrow sits to the right of the title filter. -->
			<button
				type="button"
				class="sort"
				[class.sort--off]="!params.column.getSort()"
				[title]="params.displayName"
				(click)="params.progressSort($event.shiftKey)"
			>
				<nx-webui-icon
					[name]="
						params.column.getSort() === 'desc' ? 'icons:arrow-downward' : 'icons:arrow-upward'
					"
				/>
			</button>
		} @else if (aggregateKey(); as key) {
			<details>
				<summary
					[attr.aria-label]="
						('search.quickFilters' | webuiMessage: 'Quick filters') + ': ' + params.displayName
					"
				>
					<nx-webui-icon name="icons:filter-list" />
				</summary>
				<div class="filter-options">
					@for (bucket of params.content.aggregateBuckets()[key] ?? []; track bucket.key) {
						<label
							><input
								type="checkbox"
								[checked]="params.content.aggregateFilters()[key].includes(bucket.key)"
								[disabled]="params.content.busy()"
								(change)="params.content.toggleAggregate(key, bucket.key)"
							/>{{ bucket.labelKey ?? '' | webuiMessage: bucket.label }} ({{ bucket.count }})</label
						>
					}
				</div>
			</details>
		}
	</div>`,
	styles: `
		:host {
			display: block;
			width: 100%;
			min-width: 0;
		}
		.heading {
			display: flex;
			align-items: center;
			gap: 6px;
			min-width: 0;
		}
		button {
			// A long label truncates inside its own column instead of running into the next one;
			// the label always keeps its width ahead of the title filter.
			flex: 0 1 auto;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			text-align: start;
			border: 0;
			background: transparent;
			color: inherit;
			font: inherit;
			padding: 0;
			white-space: nowrap;
			cursor: pointer;
		}
		// Stock title column (paper-input): the column name is the field's label, sitting on the
		// underline at the header's size; it clears once the filter holds text.
		.heading--field {
			position: relative;
			align-items: stretch;
			gap: 0;
			width: min(310px, 100%);
			// Underline at a quarter of the header height from its bottom; the input itself
			// reaches up to the header top so the click target is taller than the text line.
			padding-block-start: 0;
		}
		.heading--field button {
			position: absolute;
			inset-inline-start: 0;
			inset-block-end: 6px;
			font: inherit;
			line-height: 1.2;
		}
		.heading--field input[type='search'] {
			flex: 1 1 auto;
			width: auto;
			box-sizing: border-box;
			height: 23px;
			// Typed text sits level with the label, clear of the underline.
			padding: 0 0 7px;
			line-height: 16px;
			font: inherit;
			// paper-input underline: the secondary text colour, darker than the grid borders.
			border-bottom-color: color-mix(in srgb, currentColor 55%, transparent);
		}
		// Focus reads like paper-input: no outline box, the 1px underline turns the primary colour.
		.heading--field input[type='search']:focus-visible {
			outline: none;
			border-bottom-color: var(--nuxeo-primary-color, #0066ff);
		}
		// The label reads as the field's placeholder: it stays put on focus and disappears
		// once the filter holds text.
		.heading--field:has(input:not(:placeholder-shown)) button:not(.sort) {
			visibility: hidden;
		}
		.heading--field .sort {
			position: static;
			flex: 0 0 auto;
			align-self: center;
			margin-inline-start: 24px;
			line-height: 0;
			color: var(--nuxeo-text-light, #9aa0a6);
		}
		.heading--field .sort nx-webui-icon {
			width: 24px;
			height: 24px;
		}
		.heading--field .sort--off {
			opacity: 0.35;
		}
		details {
			flex: 0 0 auto;
		}
		input[type='search'] {
			flex: 1 1 60px;
			min-width: 60px;
			width: auto;
			border: 0;
			border-bottom: 1px solid var(--nuxeo-border);
			background: transparent;
			color: inherit;
		}
		summary {
			list-style: none;
			cursor: pointer;
		}
		summary nx-webui-icon {
			width: 16px;
			height: 16px;
		}
		.filter-options {
			position: fixed;
			z-index: 20;
			display: flex;
			flex-direction: column;
			padding: 12px;
			gap: 8px;
			max-height: 300px;
			overflow: auto;
			background: var(--nuxeo-box);
			border: 1px solid var(--nuxeo-border);
			box-shadow: 0 2px 6px #0002;
		}
		label {
			display: flex;
			gap: 8px;
			align-items: center;
			color: var(--nuxeo-text-default);
			font-weight: normal;
		}
		input[type='checkbox'] {
			width: 18px;
			height: 18px;
		}
	`,
})
export class ContentColumnHeaderComponent implements OnDestroy {
	params!: ContentHeaderParams;
	private readonly cdr = inject(ChangeDetectorRef);
	private readonly changed = () => this.cdr.markForCheck();
	agInit(params: ContentHeaderParams): void {
		this.params = params;
		params.column.addEventListener('sortChanged', this.changed);
	}
	refresh(params: ContentHeaderParams): boolean {
		this.params = params;
		this.cdr.markForCheck();
		return true;
	}
	/** Clicking the Title label focuses the filter beneath it instead of sorting. */
	focusFilter(event: Event): void {
		(event.currentTarget as HTMLElement).parentElement
			?.querySelector<HTMLInputElement>('input[type="search"]')
			?.focus();
	}
	aggregateKey(): ContentColumnAggregate | null {
		return this.params.id === 'modified'
			? 'dc_modified_agg'
			: this.params.id === 'lastContributor'
				? 'dc_last_contributor_agg'
				: null;
	}
	ngOnDestroy(): void {
		this.params?.column.removeEventListener('sortChanged', this.changed);
	}
}
