import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { WebUiMessagePipe } from '@maretha/webui-sdk';

/**
 * The results "Load more" action, one look in the searches and the folder View and Trash tabs:
 * centred under the results as a clear outline button (drawer Reset look) with a down chevron. It
 * fills on hover and shows a spinner with "Loading more results…" while the next page loads.
 */
@Component({
	selector: 'nx-load-more-button',
	imports: [WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { role: 'status' },
	template: `<button type="button" [disabled]="disabled() || loading()" (click)="more.emit()">
		@if (loading()) {
			<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
			{{
				'app.modules.default-search-results.loading-more-results-28e32c'
					| webuiMessage: 'Loading more results…'
			}}
		} @else {
			{{ 'app.modules.default-search-results.load-more-a1dee0' | webuiMessage: 'Load more' }}
			<span class="chevron" aria-hidden="true"></span>
		}
	</button>`,
	styles: `
		:host {
			display: flex;
			flex: none;
			justify-content: center;
			padding: 16px 0 8px;
		}
		button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 10px;
			min-width: 240px;
			min-height: 40px;
			padding: 8px 24px;
			border: 1px solid var(--nuxeo-primary-color);
			border-radius: 3px;
			background: var(--nuxeo-box, #fff);
			color: var(--nuxeo-primary-color);
			font-size: 13px;
			font-weight: 500;
			box-shadow: 0 3px 5px rgb(0 0 0 / 4%);
			cursor: pointer;
			transition:
				background-color 0.12s,
				color 0.12s;
		}
		button:hover:not(:disabled) {
			background: var(--nuxeo-primary-color);
			color: #fff;
		}
		button:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color);
			outline-offset: 2px;
		}
		button:disabled {
			opacity: 1;
			cursor: progress;
		}
		.chevron {
			width: 7px;
			height: 7px;
			border-inline-end: 2px solid currentColor;
			border-block-end: 2px solid currentColor;
			transform: translateY(-2px) rotate(45deg);
		}
	`,
})
export class LoadMoreButtonComponent {
	/** The next page is loading: the button shows a spinner and does not take another click. */
	readonly loading = input(false);
	readonly disabled = input(false);
	readonly more = output<void>();
}
