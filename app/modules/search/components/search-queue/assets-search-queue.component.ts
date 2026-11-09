import { WebUiMessagePipe, WebUiMessages } from '@maretha/webui-sdk';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AssetsSearchQueueService } from '../../helpers/assets-search-queue.service';
import { LazyLoadDirective } from 'app/directives/lazy-load.directive';
import { ResultsPagingSettings, WebUiIconComponent } from '@maretha/webui-sdk';

@Component({
	selector: 'nx-assets-search-queue',
	imports: [LazyLoadDirective, WebUiIconComponent, WebUiMessagePipe],
	template: `<section
		[attr.aria-label]="
			'app.modules.assets-search-queue.assets-search-queue-394c0f'
				| webuiMessage: 'Assets search queue'
		"
	>
		<!-- Stock nuxeo-search-form queue (Expired and Assets): Search Filters header, filter icon,
			pill rows, no previous/next bar. -->
		<header>
			<span>{{ 'searchForm.searchFilters' | webuiMessage: 'Search Filters' }}</span>
			<button
				type="button"
				[attr.title]="
					'app.modules.assets-search-queue.back-to-filters-5b2280' | webuiMessage: 'Back to filters'
				"
				[attr.aria-label]="
					'app.modules.assets-search-queue.back-to-filters-5b2280' | webuiMessage: 'Back to filters'
				"
				[disabled]="queue.navigating()"
				(click)="backToFilters()"
			>
				<nx-webui-icon name="nuxeo:filter" />
			</button>
		</header>
		@if (queue.quickFilters().length) {
			<!-- Stock nuxeo-quick-filters: one pill per provider quick filter, above the list. -->
			<div class="quick-filters" role="group">
				@for (filter of queue.quickFilters(); track filter.name) {
					<button
						type="button"
						class="quick-filter"
						[attr.aria-pressed]="filter.active"
						[disabled]="queue.loading() || queue.navigating()"
						(click)="queue.toggleQuickFilter(filter.name)"
					>
						{{ quickFilterLabel(filter.name) }}
					</button>
				}
			</div>
		}
		<div class="queue-scroll queue-scroll--list" (scroll)="scrolled($event)">
			@if (queue.error()) {
				<p role="alert">{{ queue.error() }}</p>
				<button type="button" [disabled]="queue.loading()" (click)="queue.retry()">
					{{ 'app.modules.assets-search-queue.retry-d5dae6' | webuiMessage: 'Retry' }}
				</button>
			}
			<ul
				[attr.aria-label]="'app.modules.assets-search-queue.assets-a3c992' | webuiMessage: 'Assets'"
			>
				@for (row of queue.rows(); track row.uid) {
					<li>
						<button
							type="button"
							class="asset"
							[class.selected]="queue.selectedUid() === row.uid"
							[attr.aria-current]="queue.selectedUid() === row.uid ? 'true' : null"
							[title]="row.title"
							[disabled]="queue.navigating()"
							(click)="queue.select(row)"
						>
							<img nxLazyLoad [src]="thumbnail(row)" alt="" />
							<span>{{ row.title }}</span>
						</button>
					</li>
				}
			</ul>
			@if (queue.loading()) {
				<p role="status">
					{{
						'app.modules.assets-search-queue.loading-results-45937e'
							| webuiMessage: 'Loading results…'
					}}
				</p>
			} @else if (!queue.rows().length && !queue.error()) {
				<p>
					{{ 'app.modules.assets-search-queue.no-results-a194bb' | webuiMessage: 'No results.' }}
				</p>
			}
			@if (queue.hasMore()) {
				<button type="button" [disabled]="queue.loading()" (click)="queue.more()">
					{{ 'app.modules.assets-search-queue.load-more-c9bff2' | webuiMessage: 'Load more' }}
				</button>
			}
		</div>
	</section>`,
	styles: `
		:host {
			display: block;
			height: 100%;
			min-height: 0;
		}
		section {
			display: flex;
			flex-direction: column;
			height: 100%;
			min-height: 0;
		}
		header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			min-height: 53px;
			padding-inline-start: 16px;
			border-bottom: 1px solid var(--nuxeo-border, #ddd);
		}
		header button {
			width: 56px;
			align-self: stretch;
			border: 0;
			border-inline-start: 1px solid var(--nuxeo-border, #ddd);
			background: transparent;
		}
		.quick-filters {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			padding: 12px 8px 4px;
		}
		.quick-filter {
			border: 0;
			border-radius: 2em;
			padding: 10px 20px;
			background: var(--nuxeo-container-hover, #f2f2f2);
			color: var(--nuxeo-text-default, #333);
			font: inherit;
			font-weight: 600;
		}
		.quick-filter[aria-pressed='true'] {
			background: var(--nuxeo-primary-color, #06f);
			color: var(--nuxeo-button-primary-text, #fff);
		}
		button {
			color: inherit;
			cursor: pointer;
		}
		button:disabled {
			opacity: 0.5;
			cursor: default;
		}
		button:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color, #06f);
			outline-offset: -2px;
		}
		.queue-scroll {
			flex: 1;
			min-height: 0;
			overflow: auto;
			overscroll-behavior: contain;
		}
		ul {
			list-style: none;
			padding: 0;
			margin: 0;
		}
		.asset {
			display: flex;
			align-items: center;
			width: 100%;
			min-height: 64px;
			gap: 12px;
			padding: 8px 16px;
			text-align: start;
			border: 0;
			background: transparent;
		}
		.asset:hover {
			background: var(--nuxeo-grid-hover, #f4f4f4);
		}
		.asset.selected {
			background: var(--nuxeo-grid-selected, #e8efff);
			box-shadow: inset 3px 0 var(--nuxeo-primary-color, #06f);
		}
		// Stock nuxeo-search-form queue rows (--hyland-drawer-item), measured on the stock Web UI:
		// plain 52px rows in 14px/500 type; hover and the selected row take the grey pill
		// (--hyland-drawer-item-selected).
		.queue-scroll--list ul {
			padding: 0;
		}
		.queue-scroll--list .asset {
			min-height: 52px;
			gap: 8px;
			padding: 10px 14px 10px 6px;
			border-radius: 54px;
			font-size: 14px;
			font-weight: 500;
			line-height: 20px;
		}
		.queue-scroll--list .asset:hover,
		.queue-scroll--list .asset.selected {
			background: var(--nuxeo-container-hover, #f5f5f5);
			box-shadow: none;
		}
		.queue-scroll--list .asset img {
			width: 32px;
			height: 32px;
		}
		.asset img {
			width: 40px;
			height: 40px;
			object-fit: contain;
			flex: none;
		}
		.asset span {
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		p {
			margin: 12px 16px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsSearchQueueComponent {
	readonly queue = inject(AssetsSearchQueueService);
	private readonly paging = inject(ResultsPagingSettings);
	private readonly messages = inject(WebUiMessages);
	/** Expired lives in its drawer: its filter form replaces the queue in place (stock toggle).
	 *  The Assets queue returns to its results page and restores that page's filters. */
	backToFilters(): void {
		if (this.queue.kind() === 'expired') this.queue.showFilters();
		else void this.queue.backToFilters();
	}
	quickFilterLabel(name: string): string {
		return this.messages.text(
			`ui.label.quickFilters.${name}`,
			name.charAt(0).toUpperCase() + name.slice(1),
		);
	}
	thumbnail(row: any): string {
		const value = row.contextParameters?.thumbnail;
		return typeof value === 'string' ? value : (value?.url ?? '');
	}
	scrolled(event: Event): void {
		if (!this.paging.scrollPagingEnabled()) return;
		const target = event.target as HTMLElement;
		if (target.scrollHeight - target.clientHeight - target.scrollTop < 200) this.queue.more();
	}
}
