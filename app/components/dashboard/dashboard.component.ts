import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import {
	ChangeDetectorRef,
	inject,
	Component,
	OnInit,
	OnDestroy,
	ChangeDetectionStrategy,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from 'app/helpers/auth.service';
import { DocumentEnhancerService } from 'app/modules/explorer/helpers/document-enhancer.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { WorkflowsService } from 'app/helpers/workflows.service';
import { environment } from 'environments/environment';
import { Subject, takeUntil, switchMap, catchError, of, merge, filter } from 'rxjs';
import { TimeagoModule } from 'ngx-timeago';
import {
	ResultsProjectionColumn,
	ResultsProjectionComponent,
	ResultsProjectionHostTemplateDirective,
	ResultsProjectionTemplateDirective,
	WebUiIconComponent,
	WebUiMessagePipe,
} from '@maretha/webui-sdk';
import { DocumentHistoryService } from 'app/modules/explorer/helpers/document-history.service';
import { RecentDocumentsService } from './recent-documents.service';
import { documentUrl, DocumentLinkPipe } from 'app/helpers/document-route';
import { DashboardDocumentTableComponent } from './dashboard-document-table.component';

// Home widgets cap their virtual list at 15. The source provider fetches one extra item.
const HOME_VISIBLE_ITEMS = 15;
const HOME_FETCH_ITEMS = HOME_VISIBLE_ITEMS + 1;

function dateValue(value: unknown): string | number | Date | null {
	return typeof value === 'string' || typeof value === 'number' || value instanceof Date
		? value
		: null;
}

@Component({
	selector: 'nx-dashboard',
	host: { role: 'main', 'aria-labelledby': 'dashboard-heading' },
	templateUrl: './dashboard.component.html',
	styleUrls: ['./dashboard.component.scss'],
	imports: [
		DatePipe,
		UserTagComponent,
		TimeagoModule,
		RouterLink,
		WebUiIconComponent,
		WebUiMessagePipe,
		ResultsProjectionComponent,
		ResultsProjectionTemplateDirective,
		ResultsProjectionHostTemplateDirective,
		DocumentLinkPipe,
		DashboardDocumentTableComponent,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
	private readonly recentColumns: readonly ResultsProjectionColumn<any>[] = [
		{
			id: 'title',
			label: 'Title',
			labelKey: 'app.components.dashboard.column-title',
			value: (row) => row.title,
		},
		{
			id: 'type',
			label: 'Type',
			labelKey: 'app.components.dashboard.column-type',
			value: (row) => row.type,
		},
		{
			id: 'lastViewed',
			label: 'Last Viewed',
			labelKey: 'app.components.dashboard.column-last-viewed',
			value: (row) => row.lastViewed ?? '',
		},
	];
	private readonly documentColumns: readonly ResultsProjectionColumn<any>[] = [
		{
			id: 'title',
			label: 'Title',
			labelKey: 'app.components.dashboard.column-title',
			value: (row) => row.title,
		},
		{
			id: 'modified',
			label: 'Modified',
			labelKey: 'app.components.dashboard.column-modified',
			value: (row) => row.properties?.['dc:modified'] ?? '',
		},
		{
			id: 'lastContributor',
			label: 'Last Contributor',
			labelKey: 'app.components.dashboard.column-last-contributor',
			value: (row) => row.properties?.['dc:lastContributor'] ?? '',
		},
	];
	private readonly history = inject(DocumentHistoryService);
	private readonly recent = inject(RecentDocumentsService);
	private readonly favoritesCancelled$ = new Subject<void>();
	private currentUserId: string | null = null;
	private favoritesUid: string | null = null;
	recentError = false;
	editedError = false;
	favoritesError = false;
	tasksError = false;
	editedLoading = true;
	recentLoading = false;
	favoritesLoading = false;
	tasksLoading = false;
	recentlyEditedDocuments: any[] = [];
	recentlyViewedDocuments: any[] = [];
	favoriteDocuments: any[] = [];
	workflowTasks: any[] = [];
	hasWorkflowTasks = false;

	private destroy$ = new Subject<void>();

	// Deterministic avatar colors
	private readonly avatarColors = [
		'#1f28bf',
		'#0066ff',
		'#18794e',
		'#da292e',
		'#a64500',
		'#6f42c1',
		'#d63384',
		'#287bb5',
		'#087f8c',
		'#946200',
	];

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly router: Router,
		private readonly authService: AuthService,
		private readonly httpClient: HttpClient,
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly documentEnhancerService: DocumentEnhancerService,
		private readonly documentCollectionsService: DocumentCollectionsService,
		private readonly workflowsService: WorkflowsService,
		private readonly cdr: ChangeDetectorRef,
	) {
		this.authService.userInfoUpdated$.pipe(takeUntil(this.destroy$)).subscribe((x) => {
			this.currentUserId = x?.id ?? null;
			this.favoritesUid = null;
			this.favoritesCancelled$.next();
			this.favoriteDocuments = [];
			this.favoritesError = false;
			this.favoritesLoading = false;
			if (x) {
				this.loadFavorites();
			}
			this.cdr.markForCheck();
		});

		this.history.documentHistoryUpdated$
			.pipe(
				switchMap((history) => {
					this.recentError = false;
					this.recentLoading = history.length > 0;
					this.recentlyViewedDocuments = [];
					this.cdr.markForCheck();
					return this.recent.resolve(history).pipe(
						catchError(() => {
							this.recentError = true;
							return of([]);
						}),
					);
				}),
				takeUntil(this.destroy$),
			)
			.subscribe((documents) => {
				this.recentlyViewedDocuments = documents.slice(0, HOME_VISIBLE_ITEMS);
				this.recentLoading = false;
				this.cdr.markForCheck();
			});

		// Load workflow tasks
		this.authService.userInfoUpdated$
			.pipe(
				switchMap((user) => {
					this.workflowTasks = [];
					this.hasWorkflowTasks = false;
					this.tasksError = false;
					this.tasksLoading = !!user;
					this.cdr.markForCheck();
					return user
						? this.workflowsService.getUserTasks(user.id, 0, HOME_FETCH_ITEMS).pipe(
								catchError(() => {
									this.tasksError = true;
									return of({ entries: [] });
								}),
							)
						: of({ entries: [] });
				}),
				takeUntil(this.destroy$),
			)
			.subscribe({
				next: (x: any) => {
					const entries = (x.entries || []).slice(0, HOME_VISIBLE_ITEMS);
					this.tasksLoading = false;
					this.hasWorkflowTasks = entries.length > 0;
					this.workflowTasks = entries;
					this.cdr.markForCheck();
				},
				error: () => {
					this.tasksLoading = false;
					this.hasWorkflowTasks = false;
					this.workflowTasks = [];
					this.cdr.markForCheck();
				},
			});

		// Update recently edited docs on document changes
		this.documentsManagerService.documentsUpdated$
			.pipe(takeUntil(this.destroy$))
			.subscribe((updated) => {
				for (let i = 0; i < this.recentlyEditedDocuments.length; i++) {
					const found = updated.find((x: any) => x.uid === this.recentlyEditedDocuments[i].uid);
					if (found) {
						this.recentlyEditedDocuments[i] = { ...found };
						this.cdr.markForCheck();
						break;
					}
				}
			});

		// The favorites card follows its own membership. Other collections changing, or the
		// collections list loading, do not concern it.
		merge(
			this.documentCollectionsService.documentsAddedToCollection$,
			this.documentCollectionsService.documentsRemovedFromCollection$,
		)
			.pipe(
				filter((event) => !this.favoritesUid || event.collectionUid === this.favoritesUid),
				takeUntil(this.destroy$),
			)
			.subscribe(() => {
				if (this.currentUserId) this.loadFavorites();
			});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit() {
		this.loadRecentlyEditedDocuments();
	}

	get documentCards() {
		return [
			{
				id: 'edited',
				order: 1,
				label: 'Recently Edited',
				labelKey: 'home.latestDocumentsEdited',
				icon: 'nuxeo:edit',
				captionKey: 'table.caption.recentlyEditedDocs',
				documents: this.recentlyEditedDocuments,
				loading: this.editedLoading,
				emptyKey: 'queryWidget.noDocuments',
				empty: 'There are no items to show.',
			},
			{
				id: 'tasks',
				order: 2,
				label: 'Tasks',
				labelKey: 'home.tasks',
				icon: 'nuxeo-navigation:tasks',
				captionKey: '',
				documents: [],
				loading: this.tasksLoading,
				emptyKey: '',
				empty: '',
			},
			{
				id: 'recent',
				order: 3,
				label: 'Recently Viewed',
				labelKey: 'app.recentlyViewed',
				icon: 'nuxeo-navigation:recent',
				captionKey: 'table.caption.recentlyViewedDocs',
				documents: this.recentlyViewedDocuments,
				loading: this.recentLoading,
				emptyKey: 'recentDocuments.empty',
				empty: 'There are no recent documents to display.',
			},
			{
				id: 'favorites',
				order: 4,
				label: 'Favorite Items',
				labelKey: 'home.favorites',
				icon: 'nuxeo:favorites',
				captionKey: 'table.caption.favoriteDocs',
				documents: this.favoriteDocuments,
				loading: this.favoritesLoading,
				emptyKey: 'favorites.empty',
				empty: "You haven't starred documents yet.",
			},
		];
	}
	documentColumnsFor(cardId: string): readonly ResultsProjectionColumn<any>[] {
		return cardId === 'recent' ? this.recentColumns : this.documentColumns;
	}

	thumbnailUrl(row: unknown): string | undefined {
		const thumbnail = (row as any)?.contextParameters?.thumbnail;
		const value = typeof thumbnail === 'string' ? thumbnail : thumbnail?.url;
		return typeof value === 'string' && value ? value : undefined;
	}

	lastViewed(row: unknown): string | number | Date | null {
		return dateValue((row as any)?.lastViewed);
	}

	modified(row: unknown): string | number | Date | null {
		return dateValue((row as any)?.properties?.['dc:modified']);
	}

	lastContributor(row: unknown): string {
		const value = (row as any)?.properties?.['dc:lastContributor'];
		return typeof value === 'string' ? value : '';
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
		this.favoritesCancelled$.complete();
	}

	// --------------------------------------------------------------------------------------------------
	navigateToDocument(doc: any) {
		if (doc?.uid) this.router.navigateByUrl(documentUrl(doc));
	}

	// --------------------------------------------------------------------------------------------------
	navigateToTask(task: any) {
		if (task?.id) void this.router.navigate(['/tasks', task.id]);
	}

	// --------------------------------------------------------------------------------------------------
	getInitials(name: any): string {
		if (!name || typeof name !== 'string') return '?';
		const parts = name.split(/[\s@.]+/);
		if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
		return name.substring(0, 2).toUpperCase();
	}

	// --------------------------------------------------------------------------------------------------
	getAvatarColor(name: any): string {
		if (!name || typeof name !== 'string') return this.avatarColors[0];
		let hash = 0;
		for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
		return this.avatarColors[Math.abs(hash) % this.avatarColors.length];
	}

	// --------------------------------------------------------------------------------------------------
	private loadRecentlyEditedDocuments() {
		this.editedLoading = true;
		this.editedError = false;
		this.cdr.markForCheck();
		const url = `${environment.nuxeoUrl}/api/v1/search/pp/domain_documents/execute?currentPageIndex=0&offset=0&pageSize=${HOME_FETCH_ITEMS}&queryParams=%2F`;
		const headers = {
			headers: new HttpHeaders({
				'enrichers-document': 'hasContent,permissions,thumbnail,renditions',
				properties: '*',
			}),
		};

		this.httpClient
			.get(url, headers)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (x: any) => {
					const entries = (x.entries || []).slice(0, HOME_VISIBLE_ITEMS);
					entries.forEach((e: any) => this.documentEnhancerService.setDocumentCustomProperties(e));
					this.recentlyEditedDocuments = entries;
					this.editedLoading = false;
					this.cdr.markForCheck();
				},
				error: () => {
					this.recentlyEditedDocuments = [];
					this.editedLoading = false;
					this.editedError = true;
					this.cdr.markForCheck();
				},
			});
	}

	// --------------------------------------------------------------------------------------------------

	// --------------------------------------------------------------------------------------------------
	private loadFavorites() {
		this.favoritesCancelled$.next();
		this.favoritesError = false;
		this.favoritesLoading = true;
		this.cdr.markForCheck();
		const opUrl = `${environment.nuxeoUrl}/api/v1/automation/Favorite.Fetch`;
		this.httpClient
			.post(opUrl, { params: {}, context: {} })
			.pipe(
				switchMap((favCollection: any) => {
					this.favoritesUid = favCollection?.uid ?? null;
					if (!favCollection?.uid) return of({ entries: [] });
					const ppUrl =
						`${environment.nuxeoUrl}/api/v1/search/pp/default_content_collection/execute` +
						`?currentPageIndex=0&pageSize=${HOME_FETCH_ITEMS}&queryParams=${encodeURIComponent(favCollection.uid)}`;
					const headers = {
						headers: new HttpHeaders({
							'enrichers-document': 'hasContent,permissions,thumbnail',
							properties: '*',
						}),
					};

					return this.httpClient.get(ppUrl, headers);
				}),
				catchError(() => {
					this.favoritesError = true;
					return of({ entries: [] });
				}),
				takeUntil(this.favoritesCancelled$),
				takeUntil(this.destroy$),
			)
			.subscribe((result: any) => {
				const entries = (result.entries ?? []).slice(0, HOME_VISIBLE_ITEMS);
				entries.forEach((entry: any) =>
					this.documentEnhancerService.setDocumentCustomProperties(entry),
				);
				this.favoriteDocuments = entries;
				this.favoritesLoading = false;
				this.cdr.markForCheck();
			});
	}
}
