import { UserTagComponent } from '../user-tag/user-tag.component';
import { WebUiMessages } from '@maretha/webui-sdk';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { WebUiDatePipe, WebUiLocale } from '@maretha/webui-sdk';

import { HttpClient, HttpParams } from '@angular/common/http';
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
	DrawerContext,
	ResultsPagingSettings,
	WebUiIconComponent,
	WebUiMessagePipe,
} from '@maretha/webui-sdk';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { documentUrl, documentRouteMatches } from 'app/helpers/document-route';
import { CollectionDrawerNavigation } from 'app/helpers/collection-drawer-navigation.service';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { environment } from 'environments/environment';
import { hasPermission } from 'app/helpers/document-permissions';

type List = 'collections' | 'members';
interface Page {
	entries?: any[];
	isNextPageAvailable?: boolean;
	pageCount?: number;
	resultsCount?: number;
	totalSize?: number;
}

/** The Collections drawer owns its two providers; document views retain their own results. */
@Component({
	selector: 'nx-collections-drawer',
	imports: [UserTagComponent, WebUiDatePipe, WebUiIconComponent, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrls: ['./sidebar.component.scss'],
	template: ` <header class="nx-drawer__header">
			<h6>
				{{
					showingMembers()
						? selectedCollection()?.title
						: ('collections.heading' | webuiMessage: 'Collections')
				}}
			</h6>
			@if (showingMembers()) {
				<button
					type="button"
					(click)="back()"
					[attr.aria-label]="'collections.backToCollections' | webuiMessage: 'Back to collections'"
				>
					<nx-webui-icon name="icons:arrow-back" />
				</button>
			}
		</header>
		<div
			class="collection-list"
			tabindex="-1"
			(scroll)="onScroll($event)"
			(keydown)="navigateKeys($event)"
			[attr.aria-busy]="loading()"
		>
			@if (showingMembers()) {
				@for (member of members(); track member.uid) {
					<div class="member-row" [class.current]="isCurrent(member)">
						<button
							type="button"
							class="row-primary"
							[attr.data-row-uid]="member.uid"
							(click)="openMember(member)"
							[attr.aria-current]="isCurrent(member) ? 'page' : null"
						>
							@if (member.contextParameters?.thumbnail?.url) {
								<img [src]="member.contextParameters.thumbnail.url" alt="" />
							} @else {
								<nx-webui-icon name="nuxeo:document" />
							}
							<span
								>{{ member.title }}<small>{{ member.type }}</small></span
							>
						</button>
						@if (canRemove()) {
							<button
								type="button"
								[disabled]="!!removing()"
								(click)="remove(member)"
								[attr.aria-label]="('command.remove' | webuiMessage: 'Remove') + ' ' + member.title"
							>
								<nx-webui-icon name="nuxeo:remove" />
							</button>
						}
					</div>
				}
			} @else {
				@for (collection of collections(); track collection.uid) {
					<div
						class="collection-row"
						[class.current]="selectedCollection()?.uid === collection.uid"
					>
						<div class="collection-title">
							<button
								type="button"
								class="row-primary"
								[attr.data-row-uid]="collection.uid"
								(click)="selectCollection(collection)"
							>
								<nx-webui-icon class="collection-bookmark" name="icons:bookmark" /><strong>{{
									collection.title
								}}</strong>
							</button>
							<button
								type="button"
								(click)="displayMembers(collection)"
								[attr.aria-label]="
									'app.settingsShared.view-members-of-title-7b9c23'
										| webuiMessage: 'View members of {title}' : { title: collection.title }
								"
							>
								<nx-webui-icon name="icons:chevron-right" />
							</button>
						</div>
						<p>
							{{ 'collections.lastModified' | webuiMessage: 'Last modified' }}
							{{ collection.properties?.['dc:modified'] | webuiDate: 'longDate' }}
						</p>
						<p>
							{{ 'collections.ownedBy' | webuiMessage: 'Owned by' }}
							<nx-user-tag [user]="collection.properties?.['dc:creator']" />
						</p>
					</div>
				}
			}
			@if (navigationError()) {
				<p role="alert">{{ navigationError() }}</p>
			}
			@if (positionMessage()) {
				<p role="status">{{ positionMessage() }}</p>
			}
			@if (loading()) {
				<p role="status">{{ 'label.loading' | webuiMessage: 'Loading...' }}</p>
			}
			@if (error()) {
				<p role="alert">{{ error() }}</p>
				<button type="button" [disabled]="loading()" (click)="retry()">
					{{ 'command.retry' | webuiMessage: 'Retry' }}
				</button>
			}
			@if (!loading() && !error() && !visibleRows().length) {
				<p>
					{{
						showingMembers()
							? ('collections.members.empty' | webuiMessage: 'This collection is empty.')
							: ('collections.empty' | webuiMessage: 'No collections.')
					}}
				</p>
			}
			@if (hasMore() && !loading() && !error()) {
				<button type="button" class="load-more" (click)="loadMore()">
					{{ 'label.loadMore' | webuiMessage: 'Load more' }}
				</button>
			}
		</div>`,
	styles: `
		:host {
			display: flex;
			flex-direction: column;
			flex: 1;
			min-height: 0;
		}
		.nx-drawer__header {
			display: flex;
			align-items: center;
			justify-content: space-between;
		}
		.nx-drawer__header h6 {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.collection-list {
			overflow: auto;
			flex: 1;
			min-height: 0;
		}
		.collection-title,
		.member-row {
			display: flex;
			align-items: center;
		}
		.collection-row,
		.member-row {
			border-bottom: 1px solid var(--nuxeo-border);
			padding: 8px;
		}
		:host-context([dir='rtl']) nx-webui-icon[name='icons:chevron-right'] {
			transform: scaleX(-1);
		}
		.collection-row p {
			margin-block: 0 4px;
			margin-inline: 40px 8px;
			font-size: 12px;
			opacity: 0.75;
		}
		button {
			border: 0;
			padding: 8px;
			color: inherit;
			background: transparent;
		}
		button:hover,
		.current {
			background: var(--nuxeo-pill-background, #eee);
		}
		button:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color);
		}
		.row-primary {
			display: flex;
			align-items: center;
			gap: 12px;
			flex: 1;
			min-width: 0;
			text-align: start;
		}
		.row-primary span,
		.row-primary strong {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.row-primary small {
			display: block;
			font-size: 12px;
			opacity: 0.7;
		}
		.row-primary img {
			width: 32px;
			height: 32px;
			object-fit: contain;
		}
		.load-more {
			width: 100%;
		}
		p[role],
		.collection-list > p {
			padding: 16px;
		}
	`,
})
export class CollectionsDrawerComponent {
	private readonly paging = inject(ResultsPagingSettings);
	readonly context = input.required<DrawerContext>();
	readonly collections = signal<any[]>([]);
	readonly members = signal<any[]>([]);
	readonly selectedCollection = signal<any | null>(null);
	readonly showingMembers = signal(false);
	readonly removing = signal<string | null>(null);
	readonly positionMessage = localizedText('');
	readonly navigationError = localizedText('');
	private navigationSequence = 0;
	private readonly messages = inject(WebUiMessages);
	private readonly errors = signal<Record<List, string | MessageText>>({
		collections: '',
		members: '',
	});
	private readonly loadingLists = signal({ collections: false, members: false });
	private readonly more = signal({ collections: false, members: false });
	private readonly active = computed<List>(() =>
		this.showingMembers() ? 'members' : 'collections',
	);
	readonly loading = computed(() => this.loadingLists()[this.active()]);
	readonly error = computed(() => {
		const value = this.errors()[this.active()];
		return typeof value === 'string'
			? value
			: this.messages.format(value.key, value.values, value.fallback);
	});
	readonly hasMore = computed(() => this.more()[this.active()]);
	readonly visibleRows = computed(() =>
		this.showingMembers() ? this.members() : this.collections(),
	);
	readonly canRemove = computed(
		() => !this.context().noEdit && hasPermission(this.selectedCollection(), 'ReadCanCollect'),
	);
	private readonly repository = computed(() =>
		String(this.context().document?.['repository'] ?? 'default'),
	);
	private readonly scope = computed(() =>
		JSON.stringify([this.context().user?.id ?? null, this.repository()]),
	);
	private readonly navigation = inject(CollectionDrawerNavigation);
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly injector = inject(Injector);
	private positionSequence = 0;
	private pendingPosition?: {
		kind: List;
		uid?: string;
		index?: number;
		navigate: boolean;
		sequence: number;
		expectedDocumentUid?: string;
	};
	private readonly http = inject(HttpClient);
	private readonly router = inject(Router);
	private readonly tasks = inject(PendingTasks);
	private readonly destroy = inject(DestroyRef);
	private readonly changes = inject(DocumentCollectionsService);
	private readonly api = environment.nuxeoUrl + '/api/v1';
	private identity = '';
	private removeGeneration = 0;
	private pages = { collections: -1, members: -1 };
	private generations = { collections: 0, members: 0 };
	private readonly cancelled = { collections: new Subject<void>(), members: new Subject<void>() };
	private readonly removed = new Map<string, Set<string>>();
	private readonly ownRemovalEvents = new WeakSet<object>();
	constructor() {
		effect(() => {
			const scope = this.scope();
			if (scope === this.identity) return;
			this.identity = scope;
			untracked(() => {
				this.cancelPosition();
				this.navigationSequence++;
				this.navigationError.set('');
				this.reset('collections');
				this.reset('members');
				this.removeGeneration++;
				this.selectedCollection.set(null);
				this.showingMembers.set(false);
				this.removing.set(null);
				this.removed.clear();
				if (this.context().user) this.start('collections');
			});
		});
		effect(() => {
			const request = this.navigation.accepted();
			const scope = this.scope();
			if (
				!request ||
				request.userId !== this.context().user?.id ||
				request.repository !== this.repository() ||
				request.member.uid !== this.context().document?.['uid']
			)
				return;
			untracked(() => {
				if (scope !== this.identity) return;
				this.displayMembers(request.collection);
				this.position({
					kind: 'members',
					uid: request.member.uid,
					navigate: false,
					expectedDocumentUid: request.member.uid,
				});
				if (this.navigation.accepted() === request) this.navigation.accepted.set(null);
			});
		});
		this.changes.documentsAddedToCollection$
			.pipe(takeUntilDestroyed())
			.subscribe((event) => this.membershipChanged(event, false));
		this.changes.documentsRemovedFromCollection$
			.pipe(takeUntilDestroyed())
			.subscribe((event) => this.membershipChanged(event, true));
		this.destroy.onDestroy(() => {
			for (const kind of ['collections', 'members'] as const) {
				this.generations[kind]++;
				this.cancelled[kind].next();
				this.cancelled[kind].complete();
			}
		});
	}
	private membershipChanged(
		event: { collectionUid: string; documentUids: string[]; repository?: string },
		removed: boolean,
	): void {
		if (this.ownRemovalEvents.has(event)) return;
		if (this.identity !== this.scope() || (event.repository ?? 'default') !== this.repository())
			return;
		const ids = this.removed.get(event.collectionUid) ?? new Set<string>();
		for (const id of event.documentUids) {
			if (removed) ids.add(id);
			else ids.delete(id);
		}
		this.removed.set(event.collectionUid, ids);
		if (this.selectedCollection()?.uid === event.collectionUid) {
			this.reset('members');
			this.start('members');
		}
		this.reset('collections');
		this.start('collections');
	}
	private reset(kind: List, keepRows = false): void {
		this.generations[kind]++;
		this.cancelled[kind].next();
		this.pages[kind] = -1;
		if (!keepRows) (kind === 'collections' ? this.collections : this.members).set([]);
		this.loadingLists.update((value) => ({ ...value, [kind]: false }));
		this.more.update((value) => ({ ...value, [kind]: false }));
		this.errors.update((value) => ({ ...value, [kind]: '' }));
	}
	private start(kind: List): void {
		this.tasks.run(() => this.fetch(kind));
	}
	loadMore(): void {
		this.start(this.active());
	}
	retry(): void {
		this.reset(this.active());
		this.loadMore();
	}
	private async fetch(kind: List): Promise<void> {
		const collectionUid = this.selectedCollection()?.uid;
		if (
			!this.context().user ||
			this.identity !== this.scope() ||
			this.loadingLists()[kind] ||
			(this.pages[kind] >= 0 && !this.more()[kind]) ||
			(kind === 'members' && !collectionUid)
		)
			return;
		const generation = this.generations[kind],
			scope = this.scope(),
			repository = this.repository(),
			page = this.pages[kind] + 1;
		const current = () =>
			generation === this.generations[kind] &&
			scope === this.scope() &&
			!this.destroy.destroyed &&
			(kind === 'collections' || collectionUid === this.selectedCollection()?.uid);
		this.loadingLists.update((value) => ({ ...value, [kind]: true }));
		this.errors.update((value) => ({ ...value, [kind]: '' }));
		let params = new HttpParams().set('currentPageIndex', page).set('pageSize', 40);
		params =
			kind === 'collections'
				? params.set('user', '$currentUser').set('searchTerm', '%')
				: params.set('queryParams', collectionUid);
		try {
			const result = await firstValueFrom(
				this.http
					.get<Page>(
						`${this.api}/repo/${encodeURIComponent(repository)}/search/pp/${kind === 'collections' ? 'user_collections' : 'default_content_collection'}/execute`,
						{
							params,
							headers: {
								properties: 'dublincore,common',
								'enrichers-document':
									kind === 'collections' ? 'permissions' : 'thumbnail,permissions',
								'fetch-document': 'properties',
							},
						},
					)
					.pipe(takeUntil(this.cancelled[kind])),
			);
			if (!current()) return;
			const entries = result.entries ?? [],
				rows = kind === 'collections' ? this.collections : this.members;
			const unique = new Map((page === 0 ? [] : rows()).map((row) => [row.uid, row]));
			for (const row of entries)
				if (kind === 'collections' || !this.removed.get(collectionUid)?.has(row.uid))
					unique.set(row.uid, { ...row, repository });
			rows.set([...unique.values()]);
			this.pages[kind] = page;
			if (kind === 'collections') {
				const selected = this.selectedCollection();
				const fresh = entries.find((row) => row.uid === selected?.uid);
				if (fresh) this.selectedCollection.set({ ...fresh, repository });
			}
			const total = result.resultsCount ?? result.totalSize;
			this.more.update((value) => ({
				...value,
				[kind]:
					typeof result.isNextPageAvailable === 'boolean'
						? result.isNextPageAvailable
						: typeof result.pageCount === 'number'
							? page + 1 < result.pageCount
							: typeof total === 'number' && total >= 0
								? (page + 1) * 40 < total
								: entries.length === 40,
			}));
		} catch {
			if (current())
				this.errors.update((value) => ({
					...value,
					[kind]: messageText(
						'app.settingsShared.collections-could-not-be-loaded-retry-the-reques-26a407',
						'Collections could not be loaded. Retry the request.',
					),
				}));
		} finally {
			if (current()) {
				this.loadingLists.update((value) => ({ ...value, [kind]: false }));
				this.continuePosition();
			}
		}
	}
	async selectCollection(collection: any): Promise<void> {
		if (this.identity !== this.scope() || !this.collections().includes(collection)) return;
		this.cancelPosition();
		if (!(await this.navigateDocument(collection))) return;
		if (this.selectedCollection()?.uid !== collection.uid) {
			this.removeGeneration++;
			this.removing.set(null);
		}
		this.selectedCollection.set(collection);
		this.reset('members');
	}
	displayMembers(collection = this.selectedCollection()): void {
		if (
			!collection ||
			this.identity !== this.scope() ||
			(collection.repository ?? 'default') !== this.repository()
		)
			return;
		if (this.selectedCollection()?.uid !== collection.uid) {
			this.cancelPosition();
			this.removeGeneration++;
			this.removing.set(null);
			this.selectedCollection.set(collection);
			this.reset('members');
		}
		this.navigationSequence++;
		this.navigationError.set('');
		this.showingMembers.set(true);
		if (this.pages.members < 0) this.start('members');
	}
	async back(focusCollection = false): Promise<void> {
		this.cancelPosition();
		const collection = this.selectedCollection();
		if (!collection || this.identity !== this.scope() || !(await this.navigateDocument(collection)))
			return;
		this.showingMembers.set(false);
		if (focusCollection)
			this.position({ kind: 'collections', uid: collection.uid, navigate: false });
	}
	async openMember(member: any): Promise<void> {
		if (
			this.identity !== this.scope() ||
			!this.members().includes(member) ||
			(member.repository ?? 'default') !== this.repository()
		)
			return;
		this.cancelPosition();
		await this.navigateDocument(member);
	}
	private async navigateDocument(document: any): Promise<boolean> {
		const sequence = ++this.navigationSequence,
			scope = this.scope();
		const current = () =>
			sequence === this.navigationSequence && scope === this.scope() && !this.destroy.destroyed;
		this.navigationError.set('');
		try {
			const allowed =
				documentRouteMatches(this.router.url, document) ||
				(await this.router.navigateByUrl(documentUrl(document)));
			if (!current()) return false;
			if (!allowed)
				this.navigationError.set(
					messageText(
						'app.state.navigation-cancelled-your-collection-is-still-055691',
						'Navigation cancelled. Your collection is still available.',
					),
				);
			return !!allowed;
		} catch {
			if (current())
				this.navigationError.set(
					messageText(
						'app.state.this-document-could-not-be-opened-try-again-2db5fc',
						'This document could not be opened. Try again.',
					),
				);
			return false;
		}
	}

	isCurrent(document: any): boolean {
		return (
			document.uid === this.context().document?.['uid'] &&
			(document.repository ?? 'default') === this.repository()
		);
	}
	ownerLabel(user: any): string {
		return typeof user === 'string'
			? user
			: [user?.properties?.firstName, user?.properties?.lastName].filter(Boolean).join(' ') ||
					user?.properties?.email ||
					user?.id ||
					'';
	}
	onScroll(event: Event): void {
		if (!this.paging.scrollPagingEnabled()) return;
		const element = event.target as HTMLElement;
		if (element.scrollHeight - element.scrollTop - element.clientHeight < 80 && this.hasMore())
			this.loadMore();
	}
	private cancelPosition(): void {
		this.positionSequence++;
		this.pendingPosition = undefined;
		this.positionMessage.set('');
	}
	private position(target: {
		kind: List;
		uid?: string;
		index?: number;
		navigate: boolean;
		expectedDocumentUid?: string;
	}): void {
		this.cancelPosition();
		this.pendingPosition = { ...target, sequence: this.positionSequence };
		this.continuePosition();
	}
	private continuePosition(): void {
		const target = this.pendingPosition;
		if (
			target?.expectedDocumentUid &&
			target.expectedDocumentUid !== this.context().document?.['uid']
		) {
			this.cancelPosition();
			return;
		}
		if (
			!target ||
			target.kind !== this.active() ||
			this.identity !== this.scope() ||
			this.loadingLists()[target.kind] ||
			this.errors()[target.kind]
		)
			return;
		const rows = this.visibleRows();
		const row = target.uid ? rows.find((item) => item.uid === target.uid) : rows[target.index ?? 0];
		if (!row && (this.more()[target.kind] || this.pages[target.kind] < 0)) {
			this.start(target.kind);
			return;
		}
		this.pendingPosition = undefined;
		if (!row) {
			if (target.uid && target.kind === 'members')
				this.positionMessage.set(
					messageText(
						'app.state.this-document-is-no-longer-available-in-the-c-21585e',
						'This document is no longer available in the collection.',
					),
				);
			return;
		}
		const scope = this.scope();
		afterNextRender(
			() => {
				if (
					this.destroy.destroyed ||
					scope !== this.scope() ||
					target.sequence !== this.positionSequence ||
					target.kind !== this.active() ||
					(target.expectedDocumentUid &&
						target.expectedDocumentUid !== this.context().document?.['uid'])
				)
					return;
				const button = [
					...this.element.nativeElement.querySelectorAll<HTMLButtonElement>('.row-primary'),
				].find((element) => element.dataset['rowUid'] === row.uid);
				button?.scrollIntoView({ block: 'nearest' });
				button?.focus({ preventScroll: true });
				if (target.navigate) {
					if (target.kind === 'members') this.openMember(row);
					else this.selectCollection(row);
				}
			},
			{ injector: this.injector },
		);
	}
	private readonly locale = inject(WebUiLocale);
	navigateKeys(event: KeyboardEvent): void {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
		const key = event.key;
		const backKey = this.locale.direction() === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
		const forwardKey = this.locale.direction() === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
		const rowElement = (event.target as HTMLElement).closest<HTMLElement>(
			'.collection-row, .member-row',
		);
		if (!rowElement) return;
		const button = rowElement.querySelector<HTMLButtonElement>('.row-primary');
		const uid = button?.dataset['rowUid'];
		const index = this.visibleRows().findIndex((row) => row.uid === uid);
		if ([backKey, 'h'].includes(key) && this.showingMembers()) {
			event.preventDefault();
			event.stopPropagation();
			void this.back(true);
			return;
		}
		if ([forwardKey, 'l'].includes(key) && !this.showingMembers() && index >= 0) {
			event.preventDefault();
			event.stopPropagation();
			this.displayMembers(this.collections()[index]);
			this.position({ kind: 'members', index: 0, navigate: true });
			return;
		}
		if (!['ArrowDown', 'ArrowUp', 'j', 'k'].includes(key) || index < 0) return;
		event.preventDefault();
		event.stopPropagation();
		const next = Math.max(0, index + (['ArrowDown', 'j'].includes(key) ? 1 : -1));
		this.position({
			kind: this.active(),
			index: this.hasMore() ? next : Math.min(next, this.visibleRows().length - 1),
			navigate: true,
		});
	}

	async remove(member: any): Promise<void> {
		const collection = this.selectedCollection(),
			scope = this.scope(),
			repository = this.repository();
		if (
			!this.canRemove() ||
			this.removing() ||
			!this.members().includes(member) ||
			this.identity !== scope ||
			(member.repository ?? 'default') !== repository
		)
			return;
		const generation = this.removeGeneration;
		const current = () =>
			generation === this.removeGeneration &&
			scope === this.scope() &&
			collection.uid === this.selectedCollection()?.uid &&
			!this.destroy.destroyed;
		this.removing.set(member.uid);
		this.errors.update((value) => ({ ...value, members: '' }));
		try {
			const fresh = await firstValueFrom(
				this.http.get<any>(
					`${this.api}/repo/${encodeURIComponent(repository)}/id/${encodeURIComponent(collection.uid)}`,
					{ headers: { 'enrichers-document': 'permissions', properties: 'dublincore' } },
				),
			);
			if (!current() || this.context().noEdit) return;
			if (fresh.uid !== collection.uid || !hasPermission(fresh, 'ReadCanCollect'))
				throw new CollectionPermissionChanged();
			await firstValueFrom(
				this.http.post(
					`${this.api}/automation/Collection.RemoveFromCollection`,
					{ input: member.uid, params: { collection: collection.uid } },
					{ headers: { 'X-NXRepository': repository, 'nx-es-sync': 'true' } },
				),
			);
			if (!current()) return;
			const removed = this.removed.get(collection.uid) ?? new Set<string>();
			removed.add(member.uid);
			this.removed.set(collection.uid, removed);
			this.members.update((rows) => rows.filter((row) => row.uid !== member.uid));
			const event = {
				documentUids: [String(member.uid)],
				collectionUid: String(collection.uid),
				repository,
			};
			this.ownRemovalEvents.add(event);
			this.changes.notifyDocumentsRemovedFromCollection(event);
			// Reset page offsets after a membership deletion; retained IDs hide a stale index response.
			this.reset('members', true);
			this.start('members');
		} catch (error) {
			if (current())
				this.errors.update((value) => ({
					...value,
					members:
						error instanceof CollectionPermissionChanged
							? messageText(
									'app.settingsShared.permission-to-update-this-collection-has-changed-a57520',
									'Permission to update this collection has changed.',
								)
							: error instanceof Error
								? error.message
								: messageText(
										'app.settingsShared.the-member-could-not-be-removed-retry-the-reques-0d79fc',
										'The member could not be removed. Retry the request.',
									),
				}));
		} finally {
			if (current()) this.removing.set(null);
		}
	}
}

/** Distinguishes the app-owned permission failure from external server details. */
class CollectionPermissionChanged extends Error {}
