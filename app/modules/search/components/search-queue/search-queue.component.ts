import { WebUiIconComponent, WebUiMessagePipe, WebUiMessages } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { SearchQueueService } from '../../helpers/search-queue.service';
import { DocumentSearchService } from '../../helpers/document-search.service';
import { DocumentLinkPipe, documentUrl } from 'app/helpers/document-route';

@Component({
	selector: 'nx-search-queue',
	imports: [RouterLink, DocumentLinkPipe, WebUiMessagePipe, WebUiIconComponent],
	templateUrl: './search-queue.component.html',
	styleUrl: './search-queue.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchQueueComponent {
	private readonly router = inject(Router);
	private openedEpoch = -1;
	readonly returningToFilters = signal(false);
	constructor(readonly queue: SearchQueueService) {
		// Stock opens the first result when the queue appears; later loads keep the user's choice.
		effect(() => {
			const epoch = this.queue.epoch();
			const first = this.queue.rows()[0];
			if (
				!this.queue.active() ||
				!first?.uid ||
				this.queue.selectedUid() ||
				this.openedEpoch === epoch
			)
				return;
			this.openedEpoch = epoch;
			this.queue.select(String(first.uid));
			void this.router.navigateByUrl(documentUrl(first));
		});
	}

	private readonly search = inject(DocumentSearchService);
	private readonly messages = inject(WebUiMessages);
	private readonly failedReturnEpoch = signal<number | null>(null);
	readonly returnError = computed(() =>
		this.queue.active() && this.failedReturnEpoch() === this.queue.epoch()
			? this.messages.text(
					'app.services.search.return-failed',
					'Unable to return to the search filters.',
				)
			: '',
	);
	/** Quick filters of the current page provider with the user's toggles applied. */
	readonly quickFilters = signal<Record<string, boolean>>(this.readQuickFilters());

	quickFilterKeys(): string[] {
		return Object.keys(this.quickFilters());
	}
	quickFilterLabel(key: string): string {
		return this.messages.text(
			`search.quick.${key.toLowerCase()}`,
			(
				{
					noFolder: 'No Containers',
					mostRecent: 'Most Recent',
					onlyValidated: 'Validated',
				} as Record<string, string>
			)[key] ?? key,
		);
	}
	/**
	 * Toggle a pill: the changed parameters become the applied query and the queue reopens on
	 * them. The queue's first page is the one request this action sends.
	 */
	toggleQuickFilter(key: string): void {
		const values = { ...this.quickFilters(), [key]: !this.quickFilters()[key] };
		this.quickFilters.set(values);
		this.search.searchParameters = { ...this.search.searchParameters, quickFilters: values };
		if (this.search.applyCurrentQuery()) this.queue.open();
	}
	/**
	 * Stock returns from the queue to the search's results page, with the filters in the drawer
	 * beside it, rather than leaving the opened result on screen.
	 */
	async backToFilters(): Promise<void> {
		if (this.returningToFilters()) return;
		const epoch = this.queue.epoch();
		this.returningToFilters.set(true);
		this.failedReturnEpoch.set(null);
		try {
			const savedSearchId = this.search.selectedSavedSearch?.()?.id;
			const accepted = await this.router.navigate(
				savedSearchId ? ['/search/default', savedSearchId] : ['/search/default'],
			);
			// A dirty document can cancel departure. A later queue must also survive this return.
			if (accepted && this.queue.epoch() === epoch) this.queue.close();
		} catch {
			if (this.queue.active() && this.queue.epoch() === epoch) this.failedReturnEpoch.set(epoch);
		} finally {
			this.returningToFilters.set(false);
		}
	}
	thumbnail(row: any): string {
		const thumbnail = row?.contextParameters?.thumbnail;
		return typeof thumbnail === 'string' ? thumbnail : (thumbnail?.url ?? '');
	}
	onScroll(event: Event): void {
		const el = event.target as HTMLElement;
		if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) this.queue.more();
	}
	private readQuickFilters(): Record<string, boolean> {
		const key = this.search.currentPageProviderKey ?? '';
		const provider = this.search.pageProviders?.[key]?.quickFilters ?? {};
		const applied = this.search.searchParameters?.quickFilters ?? {};
		const result: Record<string, boolean> = {};
		for (const name of Object.keys(provider)) result[name] = !!applied[name];
		return result;
	}
}
