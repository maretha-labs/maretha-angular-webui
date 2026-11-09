import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { WebUiIconComponent, WebUiMessagePipe } from '@maretha/webui-sdk';

export interface ResultsSortOption {
	readonly field: string;
	readonly label: string;
	readonly labelKey?: string;
}

/** Stock nuxeo-document-content and nuxeo-document-trash-content grid sort choices and labels. */
export const DOCUMENT_CONTENT_SORT_OPTIONS: readonly ResultsSortOption[] = [
	{ field: 'dc:title', label: 'Title', labelKey: 'searchResults.sort.field.title' },
	{ field: 'dc:created', label: 'Created', labelKey: 'searchResults.sort.field.created' },
	{ field: 'dc:modified', label: 'Modified', labelKey: 'searchResults.sort.field.modified' },
	{
		field: 'dc:lastContributor',
		label: 'Last contributor',
		labelKey: 'searchResults.sort.field.lastContributor',
	},
];

/**
 * Stock nuxeo-results sort bar (the grid and list views' delegated actions): the white 50px table
 * header strip holding nuxeo-sort-select, "Sort by", a 160px underlined field and the reverse-order
 * arrow. Hosts keep their sort state; extra controls are projected after the arrow.
 */
@Component({
	selector: 'nx-results-sort-bar',
	imports: [WebUiIconComponent, WebUiMessagePipe],
	template: `
		<label class="nx-sort-bar__label">
			<!-- The default search's message, so the wording and translations are the same. -->
			{{ 'app.modules.default-search-results.sort-by-f62fb2' | webuiMessage: 'Sort by' }}
			<span class="nx-sort-bar__field">
				<select
					[value]="field()"
					[disabled]="disabled()"
					(change)="fieldChange.emit($any($event.target).value)"
				>
					@for (option of options(); track option.field) {
						<option [value]="option.field" [selected]="option.field === field()">
							{{ option.labelKey ? (option.labelKey | webuiMessage: option.label) : option.label }}
						</option>
					}
				</select>
			</span>
		</label>
		<button
			type="button"
			class="nx-sort-bar__order"
			[disabled]="disabled()"
			[attr.aria-label]="'sortSelect.reverseOrder' | webuiMessage: 'Reverse sort order'"
			[attr.title]="'sortSelect.reverseOrder' | webuiMessage: 'Reverse sort order'"
			(click)="orderToggle.emit()"
		>
			<nx-webui-icon [name]="ascending() ? 'icons:arrow-upward' : 'icons:arrow-downward'" />
		</button>
		<ng-content />
	`,
	styles: `
		/* --iron-data-table-header: white, #606978 600 13px, 50px with the border line under it. */
		:host {
			display: flex;
			align-items: center;
			box-sizing: content-box;
			min-height: 50px;
			padding-inline: 22px;
			border-bottom: 1px solid var(--nuxeo-border, #e3e3e3);
			background: var(--nuxeo-table-header-background, var(--nuxeo-box, #fff));
			color: #606978;
			font-size: 13px;
			font-weight: 600;
			letter-spacing: 0.16px;
			line-height: 20px;
		}
		.nx-sort-bar__label {
			display: inline-flex;
			align-items: center;
			margin: 0;
		}
		/* nuxeo-select: 8px after the label, a 168px underlined field with the drop-down caret. */
		.nx-sort-bar__field {
			position: relative;
			display: inline-block;
			margin-inline-start: 8px;
			padding-top: 5px;
		}
		.nx-sort-bar__field::after {
			content: '';
			position: absolute;
			inset-inline-end: 7px;
			top: calc(50% - 1px);
			border: 5px solid transparent;
			border-top-color: currentColor;
			border-bottom-width: 0;
			pointer-events: none;
		}
		select {
			display: block;
			box-sizing: border-box;
			width: 168px;
			height: 26px;
			margin: 0;
			padding: 0 24px 1px 0;
			appearance: none;
			border: 0;
			border-bottom: 1px solid var(--nuxeo-text-default, #3a3a54);
			border-radius: 0;
			background: transparent;
			color: var(--nuxeo-text-default, #3a3a54);
			font: inherit;
			font-size: 16px;
			font-weight: 400;
			line-height: 24px;
			cursor: pointer;
		}
		select:focus-visible {
			outline: 0;
			border-bottom: 2px solid var(--nuxeo-primary-color);
			padding-bottom: 0;
		}
		select:disabled {
			cursor: default;
		}
		.nx-sort-bar__order {
			display: inline-flex;
			flex: none;
			width: 20px;
			height: 20px;
			/* Stock places the arrow 16px past the field box, which the caret overruns by 8px. */
			margin-inline: 8px 16px;
			padding: 0;
			border: 0;
			background: transparent;
			color: inherit;
			cursor: pointer;
			--webui-icon-size: 20px;
		}
		.nx-sort-bar__order:disabled {
			cursor: default;
		}
		.nx-sort-bar__order:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color);
			outline-offset: 2px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsSortBarComponent {
	readonly options = input.required<readonly ResultsSortOption[]>();
	readonly field = input.required<string>();
	readonly ascending = input(true);
	readonly disabled = input(false);
	readonly fieldChange = output<string>();
	readonly orderToggle = output<void>();
}
