import { localizedText, messageText } from 'app/helpers/localized-message';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	Injector,
	afterNextRender,
	PendingTasks,
	computed,
	effect,
	inject,
	input,
	signal,
	untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import {
	DrawerContext,
	ResultsPagingSettings,
	WebUiIconComponent,
	WebUiMessagePipe,
} from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { documentUrl, documentRouteMatches } from 'app/helpers/document-route';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';

/** Favorites is a member list, separate from the Favorites document view. */
@Component({
	selector: 'nx-favorites-drawer',
	imports: [WebUiIconComponent, WebUiMessagePipe],
	template: ` <header class="nx-drawer__header">
			<h6>{{ 'app.favorites' | webuiMessage: 'Favorites' }}</h6>
		</header>
		<div
			class="favorites-list"
			tabindex="-1"
			(scroll)="onScroll($event)"
			(keydown)="navigateKeys($event)"
			[attr.aria-busy]="loading()"
		>
			@for (document of documents(); track document.uid) {
				<div class="favorite-row" [class.current]="isCurrent(document)">
					<button
						type="button"
						class="open-document"
						[attr.data-row-uid]="document.uid"
						(click)="open(document)"
						[attr.aria-current]="isCurrent(document) ? 'page' : null"
					>
						@if (document.contextParameters?.thumbnail?.url) {
							<img [src]="document.contextParameters.thumbnail.url" alt="" />
						} @else {
							<nx-webui-icon name="nuxeo:document" />
						}
						<span>{{ document.title }}</span>
					</button>
					<button
						type="button"
						class="remove-document"
						[disabled]="context().noEdit || !!removing()"
						[attr.aria-label]="('command.remove' | webuiMessage: 'Remove') + ' ' + document.title"
						(click)="remove(document)"
					>
						<nx-webui-icon name="nuxeo:remove" />
					</button>
				</div>
			}
			@if (navigationError()) {
				<p role="alert">{{ navigationError() }}</p>
			}
			@if (loading()) {
				<p role="status">{{ 'label.loading' | webuiMessage: 'Loading...' }}</p>
			}
			@if (error()) {
				<p role="alert">{{ error() }}</p>
				<button type="button" class="btn btn-link" (click)="retry()">
					{{ 'command.retry' | webuiMessage: 'Retry' }}
				</button>
			}
			@if (!loading() && !error() && !documents().length) {
				<p>{{ 'favorites.empty' | webuiMessage: "You haven't starred documents yet." }}</p>
			}
			@if (hasMore() && !loading() && !error()) {
				<button type="button" class="btn btn-link w-100" (click)="loadMore()">
					{{ 'label.loadMore' | webuiMessage: 'Load more' }}
				</button>
			}
		</div>`,
	styleUrls: ['./sidebar.component.scss'],
	styles: `
		:host {
			display: flex;
			flex-direction: column;
			flex: 1;
			min-height: 0;
		}
		.favorites-list {
			flex: 1;
			overflow: auto;
			min-height: 0;
		}
		.favorite-row {
			display: flex;
			align-items: center;
			border-bottom: 1px solid var(--nuxeo-border, #ddd);
			padding: 8px;
		}
		.open-document,
		.remove-document {
			border: 0;
			background: transparent;
			color: inherit;
		}
		.open-document {
			display: flex;
			align-items: center;
			gap: 12px;
			flex: 1;
			min-width: 0;
			padding: 8px;
			text-align: left;
		}
		.open-document span {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.open-document img {
			width: 32px;
			height: 32px;
			object-fit: contain;
		}
		.remove-document {
			padding: 8px;
		}
		.favorite-row.current {
			background: var(--nuxeo-pill-background, #eee);
		}
		p {
			padding: 16px;
			margin: 0;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FavoritesDrawerComponent {
	private readonly paging = inject(ResultsPagingSettings);
	readonly context = input.required<DrawerContext>();
	readonly documents = signal<any[]>([]);
	readonly loading = signal(false);
	readonly hasMore = signal(false);
	readonly removing = signal<string | null>(null);
	readonly error = localizedText('');
	readonly navigationError = localizedText('');
	private readonly router = inject(Router);
	private navigationSequence = 0;
	private readonly repository = computed(() =>
		String(this.context().document?.['repository'] ?? 'default'),
	);
	private readonly userId = computed(() => this.context().user?.id ?? null);
	private readonly scope = computed(() => `${this.userId() ?? ''}/${this.repository()}`);
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly injector = inject(Injector);
	private pendingFocus?: number;
	private focusSequence = 0;
	private readonly http = inject(HttpClient);
	private readonly collections = inject(DocumentCollectionsService);
	private readonly tasks = inject(PendingTasks);
	private readonly destroyRef = inject(DestroyRef);
	private readonly cancelled = new Subject<void>();
	private readonly mutationCancelled = new Subject<void>();
	private favoriteUid: string | null = null;
	private identity = '';
	private generation = 0;
	private page = -1;
	private readonly removed = new Set<string>();
	constructor() {
		effect(() => {
			this.identity = this.scope();
			this.navigationSequence++;
			this.navigationError.set('');
			this.mutationCancelled.next();
			this.favoriteUid = null;
			this.removed.clear();
			this.removing.set(null);
			untracked(() => this.refresh());
		});
		this.collections.documentsAddedToCollection$.pipe(takeUntilDestroyed()).subscribe((event) => {
			if (!this.matches(event)) return;
			event.documentUids.forEach((uid) => this.removed.delete(uid));
			this.refresh();
		});
		this.collections.documentsRemovedFromCollection$
			.pipe(takeUntilDestroyed())
			.subscribe((event) => {
				if (!this.matches(event)) return;
				event.documentUids.forEach((uid) => this.removed.add(uid));
				this.documents.update((rows) => rows.filter((row) => !this.removed.has(row.uid)));
				this.refresh();
			});
		this.destroyRef.onDestroy(() => {
			this.generation++;
			this.cancelled.next();
			this.cancelled.complete();
			this.mutationCancelled.next();
			this.mutationCancelled.complete();
		});
	}
	private matches(event: { collectionUid: string; repository?: string }): boolean {
		return (
			event.collectionUid === this.favoriteUid &&
			(event.repository ?? 'default') === this.repository()
		);
	}
	private refresh(): void {
		this.pendingFocus = undefined;
		this.focusSequence++;
		this.generation++;
		this.cancelled.next();
		this.documents.set([]);
		this.page = -1;
		this.hasMore.set(false);
		this.error.set('');
		this.loading.set(false);
		if (this.userId()) this.loadMore();
	}
	retry(): void {
		this.removed.clear();
		this.refresh();
	}
	loadMore(): void {
		if (this.loading() || !this.userId() || (this.page >= 0 && !this.hasMore())) return;
		this.tasks.run(() => this.fetchPage());
	}
	private async fetchPage(): Promise<void> {
		const generation = this.generation;
		const identity = this.scope();
		const repository = this.repository();
		const page = this.page + 1;
		this.loading.set(true);
		this.error.set('');
		try {
			if (!this.favoriteUid) {
				const favorite = await firstValueFrom(
					this.http
						.post<any>(
							`${environment.nuxeoUrl}/api/v1/automation/Favorite.Fetch`,
							{ params: {}, context: {} },
							{ headers: { 'X-NXRepository': repository } },
						)
						.pipe(takeUntil(this.cancelled)),
				);
				if (
					generation !== this.generation ||
					identity !== this.scope() ||
					this.destroyRef.destroyed
				)
					return;
				this.favoriteUid = favorite?.uid ?? null;
				if (!this.favoriteUid) return;
			}
			const result = await firstValueFrom(
				this.http
					.get<{
						entries?: any[];
						isNextPageAvailable?: boolean;
						pageCount?: number;
						resultsCount?: number;
						totalSize?: number;
					}>(
						`${environment.nuxeoUrl}/api/v1/repo/${encodeURIComponent(repository)}/search/pp/default_content_collection/execute`,
						{
							params: new HttpParams()
								.set('queryParams', this.favoriteUid)
								.set('currentPageIndex', page)
								.set('pageSize', 30),
							headers: { properties: 'dublincore,common', 'enrichers-document': 'thumbnail' },
						},
					)
					.pipe(takeUntil(this.cancelled)),
			);
			if (generation !== this.generation || identity !== this.scope() || this.destroyRef.destroyed)
				return;
			const entries = result.entries ?? [];
			const current = page === 0 ? [] : this.documents();
			const unique = new Map(current.map((document) => [document.uid, document]));
			entries.forEach((document) => {
				if (!this.removed.has(document.uid)) unique.set(document.uid, { ...document, repository });
			});
			this.documents.set([...unique.values()]);
			this.page = page;
			const total = result.resultsCount ?? result.totalSize;
			this.hasMore.set(
				typeof result.isNextPageAvailable === 'boolean'
					? result.isNextPageAvailable
					: typeof result.pageCount === 'number'
						? page + 1 < result.pageCount
						: typeof total === 'number' && total >= 0
							? (page + 1) * 30 < total
							: entries.length === 30,
			);
		} catch {
			if (generation === this.generation && identity === this.scope() && !this.destroyRef.destroyed)
				this.error.set(
					messageText(
						'app.state.favorites-could-not-be-loaded-check-your-conn-8618b2',
						'Favorites could not be loaded. Check your connection and retry.',
					),
				);
		} finally {
			if (
				generation === this.generation &&
				identity === this.scope() &&
				!this.destroyRef.destroyed
			) {
				this.loading.set(false);
				this.focusPendingRow();
			}
		}
	}
	isCurrent(document: any): boolean {
		return (
			document.uid === this.context().document?.['uid'] &&
			(document.repository ?? 'default') === this.repository()
		);
	}
	async open(document: any): Promise<void> {
		if (
			this.identity !== this.scope() ||
			!this.documents().includes(document) ||
			(document.repository ?? 'default') !== this.repository()
		)
			return;
		this.pendingFocus = undefined;
		this.focusSequence++;
		const sequence = ++this.navigationSequence,
			scope = this.scope();
		const current = () =>
			sequence === this.navigationSequence && scope === this.scope() && !this.destroyRef.destroyed;
		this.navigationError.set('');
		try {
			const allowed =
				documentRouteMatches(this.router.url, document) ||
				(await this.router.navigateByUrl(documentUrl(document)));
			if (current() && !allowed)
				this.navigationError.set(
					messageText(
						'app.state.navigation-cancelled-your-favorites-are-still-706c48',
						'Navigation cancelled. Your favorites are still available.',
					),
				);
		} catch {
			if (current())
				this.navigationError.set(
					messageText(
						'app.state.this-document-could-not-be-opened-try-again-2db5fc',
						'This document could not be opened. Try again.',
					),
				);
		}
	}
	navigateKeys(event: KeyboardEvent): void {
		if (
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.shiftKey ||
			!['ArrowUp', 'ArrowDown'].includes(event.key)
		)
			return;
		const row = (event.target as HTMLElement).closest('.favorite-row');
		const uid = row?.querySelector<HTMLElement>('.open-document')?.dataset['rowUid'];
		const index = this.documents().findIndex((document) => document.uid === uid);
		if (index < 0) return;
		event.preventDefault();
		event.stopPropagation();
		this.focusSequence++;
		const next = Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1));
		this.pendingFocus = this.hasMore() ? next : Math.min(next, this.documents().length - 1);
		this.focusPendingRow();
	}
	private focusPendingRow(): void {
		if (
			this.pendingFocus === undefined ||
			this.loading() ||
			this.error() ||
			this.identity !== this.scope()
		)
			return;
		const row = this.documents()[this.pendingFocus];
		if (!row && this.hasMore()) {
			this.loadMore();
			return;
		}
		this.pendingFocus = undefined;
		if (!row) return;
		const sequence = this.focusSequence;
		const scope = this.scope();
		afterNextRender(
			() => {
				if (this.destroyRef.destroyed || sequence !== this.focusSequence || scope !== this.scope())
					return;
				const button = [
					...this.element.nativeElement.querySelectorAll<HTMLButtonElement>('.open-document'),
				].find((element) => element.dataset['rowUid'] === row.uid);
				button?.scrollIntoView({ block: 'nearest' });
				button?.focus({ preventScroll: true });
			},
			{ injector: this.injector },
		);
	}
	onScroll(event: Event): void {
		if (!this.paging.scrollPagingEnabled()) return;
		const element = event.target as HTMLElement;
		if (element.scrollHeight - element.scrollTop - element.clientHeight < 80 && this.hasMore())
			this.loadMore();
	}
	remove(document: any): void {
		if (
			this.context().noEdit ||
			this.removing() ||
			!this.documents().includes(document) ||
			(document.repository ?? 'default') !== this.repository() ||
			this.identity !== this.scope()
		)
			return;
		const identity = this.identity;
		const repository = this.repository();
		this.removing.set(document.uid);
		this.error.set('');
		this.tasks.run(async () => {
			let committed = false;
			try {
				await firstValueFrom(
					this.collections
						.toggleFavoriteDocument([document.uid], false, repository, () => {
							committed = true;
							if (identity !== this.scope() || this.destroyRef.destroyed) return;
							this.removed.add(document.uid);
							this.documents.update((rows) => rows.filter((row) => row.uid !== document.uid));
						})
						.pipe(takeUntil(this.mutationCancelled)),
				);
				if (identity !== this.scope() || this.destroyRef.destroyed) return;
				this.removed.add(document.uid);
				this.documents.update((rows) => rows.filter((row) => row.uid !== document.uid));
			} catch {
				if (identity === this.scope() && !this.destroyRef.destroyed)
					this.error.set(
						committed
							? messageText(
									'app.state.the-favorite-was-removed-but-its-updated-list-f1c05b',
									'The favorite was removed, but its updated list could not be loaded. Please retry.',
								)
							: messageText(
									'app.state.the-document-could-not-be-removed-from-favori-4afef1',
									'The document could not be removed from favorites. Please retry.',
								),
					);
			} finally {
				if (identity === this.scope() && !this.destroyRef.destroyed) this.removing.set(null);
			}
		});
	}
}
