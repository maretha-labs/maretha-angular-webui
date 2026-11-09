import { localizedState } from '@maretha/webui-sdk';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, Subscription } from 'rxjs';
import { AuthService } from 'app/helpers/auth.service';
import { SidebarService } from 'app/helpers/sidebar.service';
import { documentUrl } from 'app/helpers/document-route';
import {
	DEFAULT_NXQL,
	REPOSITORY_SEARCH,
	RepositorySearchParameters,
	RepositorySearchService,
} from './repository-search.service';

interface AssetsQueueSnapshot {
	readonly userId: string;
	readonly kind: 'assets' | 'expired';
	readonly repository: string;
	readonly criteria: RepositorySearchParameters;
	readonly returnUrl: string;
	readonly viewState?: AssetsSearchViewState;
	page: number;
}

export interface AssetsSearchViewState {
	readonly autoSearch: boolean;
	readonly selectedSavedSearch: string;
}

/** Keeps an Assets result queue available while its documents are open. */
@Injectable({ providedIn: 'root' })
export class AssetsSearchQueueService {
	private readonly auth = inject(AuthService);
	private readonly search = inject(RepositorySearchService);
	private readonly router = inject(Router);
	private readonly sidebar = inject(SidebarService);
	private readonly snapshot = signal<AssetsQueueSnapshot | null>(null);
	private request?: Subscription;
	private generation = 0;
	private navigation = 0;
	private restoration?: Pick<AssetsQueueSnapshot, 'userId' | 'repository' | 'returnUrl'> & {
		readonly viewState: AssetsSearchViewState;
	};
	readonly active = computed(() => {
		const snapshot = this.snapshot();
		return !!snapshot && snapshot.userId === this.auth.userInfo()?.id;
	});
	readonly kind = computed(() => this.snapshot()?.kind ?? 'assets');
	/** The provider's quick filters (stock `nuxeo-quick-filters` pills), as the last page reported them. */
	readonly quickFilters = signal<readonly { name: string; active: boolean }[]>([]);
	/** Set when the user asked for the filter form instead of the queue (stock filter toggle);
	 *  cleared by the next `open()`. A drawer that opens on its queue by default honours it. */
	readonly filtersRequested = signal(false);
	readonly rows = signal<readonly any[]>([]);
	readonly loading = signal(false);
	readonly navigating = signal(false);
	readonly error = localizedState('');
	readonly hasMore = signal(false);
	readonly total = signal<number | null>(null);
	readonly selectedUid = signal<string | null>(null);
	readonly selectedIndex = computed(() =>
		this.rows().findIndex((row) => row.uid === this.selectedUid()),
	);
	readonly canPrevious = computed(() => this.selectedIndex() > 0);
	readonly canNext = computed(
		() => this.selectedIndex() + 1 < this.rows().length || this.hasMore(),
	);

	constructor() {
		effect(() => {
			const userId = this.auth.userInfo()?.id;
			const snapshot = this.snapshot();
			if (snapshot && snapshot.userId !== userId) untracked(() => this.close());
			if (this.restoration && this.restoration.userId !== userId) this.restoration = undefined;
		});
	}

	open(
		userId: string,
		repository: string,
		criteria: RepositorySearchParameters,
		returnUrl: string,
		viewState?: AssetsSearchViewState,
		kind: 'assets' | 'expired' = 'assets',
		navigateToFirst = true,
	): void {
		if (!userId || userId !== this.auth.userInfo()?.id) return;
		this.close();
		this.filtersRequested.set(false);
		this.snapshot.set({
			kind,
			userId,
			repository,
			criteria: structuredClone(criteria),
			returnUrl: new RegExp(`^/page/${kind}(?:[?#]|$)`).test(returnUrl)
				? returnUrl
				: `/page/${kind}`,
			viewState: viewState ? { ...viewState } : undefined,
			page: 0,
		});
		this.hasMore.set(true);
		this.sidebar.selectTab(kind);
		this.load(navigateToFirst ? 0 : undefined);
	}

	/** Stock `nuxeo-search-form[queue auto]` (Expired): the drawer opens straight on the results of
	 *  the provider's default query; one request. */
	openDefault(userId: string, repository: string, kind: 'assets' | 'expired'): void {
		this.open(
			userId,
			repository,
			{
				text: '',
				path: '',
				nxql: DEFAULT_NXQL,
				expiredAt: new Date().toISOString(),
				facets: {},
			},
			`/page/${kind}`,
			undefined,
			kind,
			false,
		);
	}

	/** Stock filter toggle: show the filter form in place of the queue, without navigating. */
	showFilters(): void {
		this.close();
		this.filtersRequested.set(true);
	}

	/** Toggle a quick-filter pill: the queue reloads its first page on the changed query (one request). */
	toggleQuickFilter(name: string): void {
		const snapshot = this.current();
		if (!snapshot || this.loading() || this.navigating()) return;
		const active = new Set(snapshot.criteria.quickFilters ?? []);
		if (active.has(name)) active.delete(name);
		else active.add(name);
		this.generation++;
		this.request?.unsubscribe();
		this.request = undefined;
		this.snapshot.set({
			...snapshot,
			criteria: { ...snapshot.criteria, quickFilters: [...active] },
			page: 0,
		});
		this.rows.set([]);
		this.selectedUid.set(null);
		this.total.set(null);
		this.hasMore.set(true);
		this.load();
	}

	close(): void {
		this.generation++;
		this.navigation++;
		this.request?.unsubscribe();
		this.request = undefined;
		this.restoration = undefined;
		this.snapshot.set(null);
		this.rows.set([]);
		this.loading.set(false);
		this.navigating.set(false);
		this.error.set('');
		this.hasMore.set(false);
		this.total.set(null);
		this.selectedUid.set(null);
		this.quickFilters.set([]);
	}

	consumeViewState(
		userId: string,
		repository: string,
		returnUrl: string,
	): AssetsSearchViewState | undefined {
		const restoration = this.restoration;
		if (
			!restoration ||
			userId !== this.auth.userInfo()?.id ||
			restoration.userId !== userId ||
			restoration.repository !== repository ||
			restoration.returnUrl !== returnUrl
		)
			return;
		this.restoration = undefined;
		return { ...restoration.viewState };
	}

	async backToFilters(): Promise<void> {
		const snapshot = this.current();
		if (!snapshot || this.navigating()) return;
		const navigation = ++this.navigation;
		this.navigating.set(true);
		this.restoration = snapshot.viewState
			? {
					userId: snapshot.userId,
					repository: snapshot.repository,
					returnUrl: snapshot.returnUrl,
					viewState: { ...snapshot.viewState },
				}
			: undefined;
		try {
			const accepted = await this.router.navigateByUrl(snapshot.returnUrl);
			if (accepted && this.current() === snapshot && navigation === this.navigation) {
				// The destination may instantiate before or just after navigation resolves.
				const restoration = this.restoration;
				this.close();
				this.restoration = restoration;
				// The page draws no filter column (filters live in the drawer): keep the drawer open
				// on this search so its form is beside the restored results.
				this.sidebar.selectTab(snapshot.kind);
			} else if (navigation === this.navigation) this.restoration = undefined;
		} catch {
			if (navigation === this.navigation) this.restoration = undefined;
			if (this.current() === snapshot)
				this.error.setMessage(
					'app.services.search.return-failed',
					'Unable to return to the search filters.',
				);
		} finally {
			if (navigation === this.navigation) this.navigating.set(false);
		}
	}

	more(): void {
		if (this.hasMore()) this.load();
	}

	retry(): void {
		this.load(this.rows().length ? undefined : 0);
	}

	previous(): void {
		if (this.canPrevious()) void this.select(this.rows()[this.selectedIndex() - 1]);
	}

	next(): void {
		if (this.loading() || this.navigating()) return;
		const index = this.selectedIndex() + 1;
		if (index < this.rows().length) void this.select(this.rows()[index]);
		else if (this.hasMore()) this.load(index);
	}

	async select(row: any): Promise<void> {
		const snapshot = this.current();
		if (!snapshot || this.navigating() || !this.rows().some((item) => item === row)) return;
		const navigation = ++this.navigation;
		this.navigating.set(true);
		this.error.set('');
		try {
			const accepted = await this.router.navigateByUrl(documentUrl(row));
			if (accepted && this.current() === snapshot && navigation === this.navigation)
				this.selectedUid.set(row.uid);
		} catch {
			if (this.current() === snapshot)
				this.error.setMessage(
					'app.services.search.asset-open-failed',
					'Unable to open this asset.',
				);
		} finally {
			if (navigation === this.navigation) this.navigating.set(false);
		}
	}

	private current(): AssetsQueueSnapshot | null {
		const snapshot = this.snapshot();
		return snapshot?.userId === this.auth.userInfo()?.id ? snapshot : null;
	}

	private load(selectIndex?: number): void {
		const snapshot = this.current();
		if (!snapshot || this.loading()) return;
		const generation = ++this.generation;
		this.loading.set(true);
		this.error.set('');
		this.request = this.search
			.search(
				REPOSITORY_SEARCH[snapshot.kind],
				snapshot.repository,
				snapshot.criteria,
				snapshot.page,
			)
			.pipe(finalize(() => generation === this.generation && this.loading.set(false)))
			.subscribe({
				next: (result) => {
					if (generation !== this.generation || this.current() !== snapshot) return;
					const seen = new Set(this.rows().map((row) => row.uid));
					const received = (result.entries ?? [])
						.filter(
							(row) =>
								typeof row?.uid === 'string' &&
								(row.repository == null || row.repository === snapshot.repository) &&
								!seen.has(row.uid) &&
								!!seen.add(row.uid),
						)
						.map((row) =>
							row.repository == null ? { ...row, repository: snapshot.repository } : row,
						);
					this.rows.update((rows) => [...rows, ...received]);
					snapshot.page++;
					this.hasMore.set(result.isNextPageAvailable === true && received.length > 0);
					this.total.set(typeof result.resultsCount === 'number' ? result.resultsCount : null);
					if (Array.isArray(result.quickFilters)) this.quickFilters.set(result.quickFilters);
					if (selectIndex !== undefined && this.rows()[selectIndex])
						void this.select(this.rows()[selectIndex]);
				},
				error: () => {
					if (generation === this.generation && this.current() === snapshot)
						this.error.setMessage(
							'app.services.search.assets-load-failed',
							'Unable to load the Assets queue. Retry to continue.',
						);
				},
			});
	}
}
