import { localizedState } from '@maretha/webui-sdk';
import { Injectable, signal } from '@angular/core';
import { finalize, Subscription } from 'rxjs';
import { ResultsQueryScope } from '@maretha/webui-sdk';
import { DocumentSearchService } from './document-search.service';

export interface SearchQueueState {
	readonly scope: ResultsQueryScope;
	readonly token: number;
	readonly rows: readonly any[];
	readonly page: number;
	readonly pageSize: number;
	readonly sortFields: readonly string[];
	readonly sortAscending: boolean;
	readonly hasMore: boolean;
	readonly total: number | null;
}

@Injectable({ providedIn: 'root' })
export class SearchQueueService {
	private state: SearchQueueState | undefined;
	private requestGeneration = 0;
	private request?: Subscription;
	readonly active = signal(false);
	readonly rows = signal<readonly any[]>([]);
	readonly loading = signal(false);
	readonly error = localizedState('');
	readonly hasMore = signal(false);
	readonly total = signal<number | null>(null);
	readonly selectedUid = signal<string | null>(null);
	readonly reopenRequired = signal(false);
	/** Invalidates retained result renderers when the captured queue is replaced. */
	readonly epoch = signal(0);

	constructor(private readonly search: DocumentSearchService) {
		search.searchParametersChanged$.subscribe(() => this.invalidateForChangedQuery());
		search.appliedQueryInvalidated$.subscribe(() => this.invalidateForChangedQuery());
	}

	open(repository = 'default'): void {
		this.cancelRequest();
		const snapshot = this.search.getAppliedQuerySnapshot(repository);
		if (!snapshot) {
			this.error.setMessage(
				'app.services.search.queue-not-open',
				'Run a search before opening its queue.',
			);
			return;
		}
		this.state = { ...snapshot, rows: [], page: 0, hasMore: true, total: null };
		this.active.set(true);
		this.rows.set([]);
		this.epoch.update((epoch) => epoch + 1);
		this.selectedUid.set(null);
		this.error.set('');
		this.reopenRequired.set(false);
		this.load(true);
	}

	close(): void {
		this.cancelRequest();
		this.active.set(false);
		this.reopenRequired.set(false);
	}

	retry(): void {
		if (!this.state) {
			this.close();
			return;
		}
		if (!this.loading()) this.load(this.state.rows.length === 0);
	}

	more(): void {
		if (this.state?.hasMore && !this.loading()) this.load(false);
	}

	select(uid: string): void {
		this.selectedUid.set(uid);
	}
	toolbarSnapshot():
		| { readonly scope: ResultsQueryScope; readonly token: number; readonly total: number }
		| undefined {
		const total = this.total();
		if (!this.active() || !this.state || total === null || total < 0) return undefined;
		return {
			scope: structuredClone(this.state.scope),
			token: this.state.token,
			total,
		};
	}

	/**
	 * Reload an already-open queue only when it still represents the exact result set that
	 * requested the work.  A bulk command can finish after navigation or a new search, so
	 * callers must not use it as a general-purpose queue reload.
	 */
	refresh(scope: ResultsQueryScope, token: number): boolean {
		if (
			!this.active() ||
			!this.state ||
			this.state.token !== token ||
			this.search.getAppliedQueryToken() !== token ||
			!this.sameScope(this.state.scope, scope)
		)
			return false;
		this.cancelRequest();
		this.state = { ...this.state, rows: [], page: 0, hasMore: true, total: null };
		this.rows.set([]);
		this.epoch.update((epoch) => epoch + 1);
		this.hasMore.set(true);
		this.total.set(null);
		this.selectedUid.set(null);
		this.error.set('');
		this.load(true);
		return true;
	}

	private load(reset: boolean): void {
		const state = this.state;
		if (!state || this.loading()) return;
		const page = reset ? 0 : state.page;
		const token = state.token;
		const request = ++this.requestGeneration;
		this.loading.set(true);
		this.error.set('');
		this.request = this.search
			.loadAppliedQuery(state.scope, page, state.pageSize, state.sortFields, state.sortAscending)
			.pipe(finalize(() => request === this.requestGeneration && this.loading.set(false)))
			.subscribe({
				next: (result: any) => {
					if (
						request !== this.requestGeneration ||
						!this.state ||
						this.state.token !== token ||
						this.search.getAppliedQueryToken() !== token
					)
						return;
					const received = result.entries ?? [];
					const rows = reset
						? this.uniqueRows(received)
						: this.uniqueRows([...this.state.rows, ...received]);
					const madeProgress = reset || rows.length > this.state.rows.length;
					this.state = {
						...this.state,
						rows,
						page: page + 1,
						hasMore: result.isNextPageAvailable === true && madeProgress,
						total:
							typeof result.totalSize === 'number'
								? result.totalSize
								: typeof result.resultsCount === 'number'
									? result.resultsCount
									: null,
					};
					this.rows.set(rows);
					this.hasMore.set(this.state.hasMore);
					this.total.set(this.state.total);
				},
				error: () => {
					if (
						request === this.requestGeneration &&
						this.active() &&
						this.search.getAppliedQueryToken() === token
					)
						this.error.setMessage(
							'app.services.search.queue-load-failed',
							'Unable to load this search queue. Retry to continue.',
						);
				},
			});
	}

	private cancelRequest(): void {
		this.requestGeneration++;
		this.request?.unsubscribe();
		this.request = undefined;
		this.loading.set(false);
	}

	private invalidateForChangedQuery(): void {
		if (!this.active()) return;
		this.cancelRequest();
		this.state = undefined;
		this.rows.set([]);
		this.epoch.update((epoch) => epoch + 1);
		this.hasMore.set(false);
		this.total.set(null);
		this.selectedUid.set(null);
		this.error.setMessage(
			'app.services.search.queue-changed',
			'The search changed. Open the queue again to view its new results.',
		);
		this.reopenRequired.set(true);
	}

	private uniqueRows(rows: readonly any[]): any[] {
		const seen = new Set<string>();
		return rows.filter(
			(row) => typeof row?.uid === 'string' && !seen.has(row.uid) && !!seen.add(row.uid),
		);
	}

	private sameScope(left: ResultsQueryScope, right: ResultsQueryScope): boolean {
		return JSON.stringify(left) === JSON.stringify(right);
	}
}
