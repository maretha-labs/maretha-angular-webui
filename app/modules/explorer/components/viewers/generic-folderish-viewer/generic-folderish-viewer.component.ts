import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiIconComponent, WebUiMessagePipe } from '@maretha/webui-sdk';
import { documentPath } from '../../../helpers/document-navigation';
import { documentUrl } from 'app/helpers/document-route';
import { AuthService } from 'app/helpers/auth.service';
import {
	ChangeDetectorRef,
	Component,
	EventEmitter,
	Input,
	OnChanges,
	OnDestroy,
	Output,
	ChangeDetectionStrategy,
	SimpleChanges,
	effect,
	inject,
	signal,
	untracked,
} from '@angular/core';
import { ActivatedRoute, NavigationStart, Router } from '@angular/router';
import { DocumentGridThumbnailComponent } from '../../document-grid-thumbnail/document-grid-thumbnail.component';
import { LoadMoreButtonComponent } from 'app/modules/shared/components/load-more/load-more-button.component';
import { DocumentClipboardService } from '../../../helpers/document-clipboard.service';
import { DocumentTrashService } from '../../../helpers/document-trash.service';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { catchError, filter, of, Subject, takeUntil, takeWhile } from 'rxjs';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { DocumentIconAndTitleComponent } from '../../../../shared/components/document-icon-and-title/document-icon-and-title.component';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';

import { FileSizePipe } from 'app/pipes/file-size.pipe';
import {
	ResultsProjectionColumn,
	ResultsProjectionComponent,
	ResultsProjectionTemplateDirective,
} from '@maretha/webui-sdk';

@Component({
	selector: 'nx-generic-folderish-viewer',
	templateUrl: './generic-folderish-viewer.component.html',
	styleUrls: ['./generic-folderish-viewer.component.scss'],
	imports: [
		DocumentIconAndTitleComponent,
		TooltipDirective,
		WebUiDatePipe,
		FileSizePipe,
		ResultsProjectionComponent,
		ResultsProjectionTemplateDirective,
		WebUiMessagePipe,
		WebUiIconComponent,
		DocumentGridThumbnailComponent,
		LoadMoreButtonComponent,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenericFolderishViewerComponent implements OnChanges, OnDestroy {
	private destroy$ = new Subject();
	private readonly auth = inject(AuthService);
	/** Like Polymer's nuxeo-results, each user keeps a display mode per folder. */
	readonly displayMode = signal<'table' | 'grid'>('table');

	@Input() document: any;
	@Output() itemSelected = new EventEmitter<string>();
	documents: any[] | undefined;
	documentsHash = 0;
	readonly resultColumns: readonly ResultsProjectionColumn<any>[] = [
		{
			id: 'title',
			label: 'Title',
			labelKey: 'app.columns.title',
			value: (document) => document.title,
		},
		{ id: 'type', label: 'Type', labelKey: 'app.columns.type', value: (document) => document.type },
		{
			id: 'size',
			label: 'File size',
			labelKey: 'app.columns.file-size',
			value: (document) => document.ng?.attachment?.length ?? '',
		},
		{
			id: 'state',
			label: 'State',
			labelKey: 'app.columns.state',
			value: (document) => document.state ?? '',
		},
		{
			id: 'modified',
			label: 'Last modification',
			labelKey: 'app.columns.last-modification',
			value: (document) => document.lastModified ?? '',
		},
	];
	totalCount = 0;
	canLoadMore = false;
	loading = true;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly router: Router,
		private readonly route: ActivatedRoute,
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly documentClipboardService: DocumentClipboardService,
		private readonly documentTrashService: DocumentTrashService,
		private readonly documentCollectionsService: DocumentCollectionsService,
		private readonly cdr: ChangeDetectorRef,
	) {
		// The signed-in user can load after the folder; the stored mode is per user.
		effect(() => {
			this.auth.userInfo();
			untracked(() => this.restoreDisplayMode());
		});
		// The document toolbar is a sibling host; it reads the mode for its results contexts.
		effect(() => documentsManagerService.listingDisplayMode.set(this.displayMode()));
		this.documents = documentsManagerService.documents;
		this.totalCount = documentsManagerService.totalCount;
		this.canLoadMore = documentsManagerService.canLoadMore;
		this.loading = documentsManagerService.fetchingDocuments();
		router.events
			.pipe(
				takeUntil(this.destroy$),
				filter(
					(e) => e instanceof NavigationStart && documentPath(e.url) !== documentPath(router.url),
				),
			)
			.subscribe(() => {
				this.loading = true;
				this.canLoadMore = false;
				this.documents = [];
				this.cdr.markForCheck();
			});

		documentsManagerService.fetchingDocuments$.pipe(takeUntil(this.destroy$)).subscribe((x) => {
			this.loading = x;
			this.cdr.markForCheck();
		});

		documentsManagerService.documentsUpdated$
			.pipe(takeUntil(this.destroy$))
			.subscribe((documents) => {
				this.documents = documents;
				this.documentsHash++;

				this.canLoadMore = documentsManagerService.canLoadMore;
				this.totalCount = documentsManagerService.totalCount;

				this.cdr.markForCheck();
			});

		documentsManagerService.selectedDocumentsUpdated$
			.pipe(takeUntil(this.destroy$))
			.subscribe(() => this.cdr.markForCheck());

		documentClipboardService.documentsMoved$
			.pipe(
				takeUntil(this.destroy$),
				filter((x) => x.destinationUid === this.document.uid),
			)
			.subscribe((_x) => this.refreshRoute());

		documentClipboardService.documentsCopied$
			.pipe(
				takeUntil(this.destroy$),
				filter((x) => x.destinationUid === this.document.uid),
			)
			.subscribe((_x) => this.refreshRoute());

		documentTrashService.documentsPurged$
			.pipe(
				takeUntil(this.destroy$),
				takeWhile(() => this.documentsManagerService.showOnlyTrashedDocuments),
			)
			.subscribe(() => (documentsManagerService.currentPage = 0));

		documentCollectionsService.documentsRemovedFromCollection$
			.pipe(
				takeUntil(this.destroy$),
				filter((x) => x.collectionUid === this.document?.uid),
			)
			.subscribe((_x) => this.refreshRoute());
	}

	ngOnChanges(changes: SimpleChanges): void {
		const change = changes['document'];
		if (change && change.previousValue?.uid !== change.currentValue?.uid) {
			this.restoreDisplayMode();
			this.requestListing();
		}
	}

	/** This viewer is the one owner of the folder listing it renders: the manager lists children
	 *  only when asked, so a folder rendered by a content layout is never listed twice. */
	private requestListing(): void {
		const manager = this.documentsManagerService;
		if (!this.document?.uid || manager.documentInfo?.uid !== this.document.uid) return;
		if (manager.documents.length || manager.fetchingDocuments?.()) return;
		this.loadDocuments().subscribe();
	}

	setDisplayMode(mode: 'table' | 'grid'): void {
		if (mode === this.displayMode()) return;
		this.displayMode.set(mode);
		const key = this.displayModeKey();
		try {
			if (key) localStorage.setItem(key, JSON.stringify({ mode }));
		} catch {
			/* Browsing also works when local storage is unavailable. */
		}
	}

	projectedSelectionChange(ids: readonly string[]): void {
		const selected = new Set(ids);
		for (const document of this.documents ?? []) {
			const next = selected.has(document.uid);
			if (document.ng.isSelected !== next)
				this.documentsManagerService.toggleSelection(document.uid, next);
		}
		if (ids.length) this.itemSelected.emit(ids[ids.length - 1]);
	}

	projectedRowDisabled = (document: any): boolean => document?.ng?.canBrowse === false;
	get projectedSelection(): readonly string[] {
		return (this.documents ?? [])
			.filter((document) => document.ng?.isSelected)
			.map((document) => document.uid);
	}
	private displayModeKey(): string | null {
		const user = this.auth.userInfo()?.id;
		return user && this.document?.uid
			? `maretha.folder-results.v1:${JSON.stringify([user, this.document.repository ?? 'default', this.document.uid])}`
			: null;
	}

	private restoreDisplayMode(): void {
		this.displayMode.set('table');
		const key = this.displayModeKey();
		try {
			const stored = key ? JSON.parse(localStorage.getItem(key) ?? 'null') : null;
			if (stored?.mode === 'grid') this.displayMode.set('grid');
		} catch {
			/* A blocked or old storage entry must not prevent document browsing. */
		}
	}

	// --------------------------------------------------------------------------------------------------
	private loadDocuments() {
		const loadTrashedDocuments =
			this.route.snapshot.url.length && this.route.snapshot.url[0].path === 'trash';

		if (!loadTrashedDocuments && !this.documentsManagerService.documentInfo) return of(null);

		this.loading = true;

		return this.documentsManagerService.loadMore().pipe(
			catchError((error) => {
				this.loading = false;
				return of(error);
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	loadMore = () =>
		!this.loading && this.documentsManagerService.canLoadMore && this.loadDocuments().subscribe();

	// --------------------------------------------------------------------------------------------------
	// --------------------------------------------------------------------------------------------------
	refreshRoute() {
		this.router
			.navigateByUrl('/', { skipLocationChange: true })
			.then(() => this.router.navigateByUrl(documentUrl(this.document)));
	}

	// --------------------------------------------------------------------------------------------------
	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.documentsManagerService.listingDisplayMode.set(null);
		this.destroy$.next(0);
	}
}
