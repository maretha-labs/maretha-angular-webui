import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
	output,
	viewChild,
} from '@angular/core';
import {
	NuxeoDialogComponent,
	ResultsProjectionColumn,
	WebUiMessagePipe,
} from '@maretha/webui-sdk';

/** Persistent, presentational column dialog; each search owns its preferences and reset behavior. */
@Component({
	selector: 'nx-search-column-chooser',
	imports: [NuxeoDialogComponent, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<nx-dialog
			[label]="'tableSettings.columnSettings' | webuiMessage: 'Columns Settings'"
			(closed)="restoreFocus()"
		>
			<ng-template #content>
				<section class="search-column-chooser">
					<h2>{{ 'tableSettings.columnSettings' | webuiMessage: 'Columns Settings' }}</h2>
					<div class="search-column-chooser__options">
						@for (column of columns(); track column.id) {
							<label
								><span class="search-column-chooser__check"
									><input
										type="checkbox"
										[checked]="!column.hidden"
										[disabled]="
											lockedColumns().includes(column.id) ||
											(!column.hidden && visibleCount() === 1)
										"
										(change)="
											visibilityChange.emit({ id: column.id, visible: $any($event.target).checked })
										" /></span
								><span class="search-column-chooser__label">
									{{
										column.labelKey ? (column.labelKey | webuiMessage: column.label) : column.label
									}}</span
								>
							</label>
						}
					</div>
					<footer>
						<button
							type="button"
							class="search-column-chooser__reset"
							(click)="resetColumns.emit()"
						>
							{{ 'tableSettings.columnSettings.reset' | webuiMessage: 'Reset' }}
						</button>
						<button type="button" class="search-column-chooser__close" (click)="close()">
							{{ 'tableSettings.columnSettings.done' | webuiMessage: 'Done' }}
						</button>
					</footer>
				</section>
			</ng-template>
		</nx-dialog>
	`,
	styles: `
		:host,
		nx-dialog {
			display: contents;
		}
		/* Scoped to this chooser: native dialog defaults must not replace the stock paper dialog. */
		:host ::ng-deep nx-dialog > dialog {
			box-sizing: border-box;
			width: 480px;
			max-width: calc(100vw - 48px);
			max-height: calc(100dvh - 48px);
			margin: auto;
			padding: 0;
			border: 0;
			border-radius: 0;
			background: var(--nuxeo-box, #fff);
			color: var(--nuxeo-text-default, #3a3a54);
			font-family: var(--nuxeo-app-font, inherit);
			font-size: 13px;
			font-weight: 600;
			line-height: 20.02px;
			box-shadow:
				0 16px 24px 2px rgb(0 0 0 / 14%),
				0 6px 30px 5px rgb(0 0 0 / 12%),
				0 8px 10px -5px rgb(0 0 0 / 40%);
		}
		:host ::ng-deep nx-dialog > dialog::backdrop {
			background: rgb(0 0 0 / 60%);
		}
		.search-column-chooser {
			display: flex;
			flex-direction: column;
			max-height: calc(100dvh - 48px);
		}
		h2 {
			flex: 0 0 auto;
			margin: 24px 0 0;
			padding: 0 24px;
			font-size: 20px;
			font-weight: 500;
			line-height: 28px;
		}
		.search-column-chooser__options {
			min-height: 0;
			margin-top: 16px;
			padding: 0 24px 26px;
			overflow: auto;
		}
		/* Match stock tr/td baseline geometry: 18px check + 8px gap and 1px cell padding. */
		label {
			display: table-row;
			margin: 0;
			font-size: 13px;
			font-weight: 600;
			line-height: 20.02px;
		}
		.search-column-chooser__check,
		.search-column-chooser__label {
			display: table-cell;
			padding: 1px;
		}
		input {
			position: relative;
			display: inline-block;
			box-sizing: border-box;
			width: 18px;
			height: 18px;
			margin: 0 8px 0 0;
			padding: 0;
			appearance: none;
			font: inherit;
			line-height: 0;
			vertical-align: middle;
			border: 2px solid var(--nuxeo-text-default, #3a3a54);
			border-radius: 0;
			background: transparent;
			cursor: pointer;
		}
		input:checked {
			border-color: var(--nuxeo-primary-color, #06f);
			background: var(--nuxeo-primary-color, #06f);
		}
		input:checked::after {
			content: '';
			position: absolute;
			top: 2px;
			left: 2px;
			width: 9px;
			height: 5px;
			border-inline-start: 2px solid white;
			border-block-end: 2px solid white;
			transform: rotate(-45deg);
		}
		input:disabled {
			cursor: default;
			opacity: 0.6;
		}
		footer {
			display: flex;
			flex: 0 0 auto;
			justify-content: space-between;
			gap: 12px;
			padding: 0.7em 1.8em;
		}
		button {
			box-sizing: border-box;
			min-width: 96px;
			min-height: 40px;
			padding: 8px 16px;
			border: 1px solid var(--nuxeo-primary-color, #06f);
			border-radius: 0.1em;
			color: var(--nuxeo-button-secondary-text, var(--nuxeo-primary-color, #06f));
			background: transparent;
			font: inherit;
			cursor: pointer;
		}
		.search-column-chooser__close {
			color: var(--nuxeo-button-primary-text, #fff);
			background: var(--nuxeo-button-primary, var(--nuxeo-primary-color, #06f));
		}
		button:focus-visible,
		input:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color, #06f);
			outline-offset: 2px;
		}
		button:focus:not(:focus-visible),
		input:focus:not(:focus-visible) {
			outline: none;
		}
	`,
})
export class SearchColumnChooserComponent {
	readonly columns = input<readonly ResultsProjectionColumn[]>([]);
	/** Columns a host keeps visible, such as the Trash title column. */
	readonly lockedColumns = input<readonly string[]>([]);
	readonly visibilityChange = output<{ id: string; visible: boolean }>();
	readonly resetColumns = output<void>();
	readonly visibleCount = computed(() => this.columns().filter((column) => !column.hidden).length);
	private readonly dialog = viewChild.required(NuxeoDialogComponent);
	private focusTarget?: () => HTMLElement | null;

	open(focusTarget?: () => HTMLElement | null): void {
		this.focusTarget = focusTarget;
		this.dialog().open();
		// Chrome can otherwise focus the scroll area before its checkboxes.
		this.dialog()
			.dialog()
			.nativeElement.querySelector<HTMLInputElement>('input:not(:disabled)')
			?.focus({ preventScroll: true });
	}
	close(): void {
		this.dialog().close();
	}
	restoreFocus(): void {
		// A column change may replace the header gear. Resolve its current element after close.
		this.focusTarget?.()?.focus();
	}
}
