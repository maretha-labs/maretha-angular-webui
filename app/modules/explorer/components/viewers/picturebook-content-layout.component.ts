import { documentStatePresentation } from 'app/helpers/document-type-presentation';
import { selectionToolbarShortcut } from 'app/helpers/selection-toolbar-shortcut';
import { ContentColumnHeaderComponent } from './content-column-header.component';
import { LoadMoreButtonComponent } from 'app/modules/shared/components/load-more/load-more-button.component';
import { SearchColumnChooserComponent } from 'app/modules/shared/components/search-column-chooser/search-column-chooser.component';
import { reorderRowsBySiblings } from './sibling-order';
import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import { errorMessage } from 'app/helpers/localized-message';
import { builtinAggregationLabel } from 'app/helpers/builtin-aggregation-labels';
import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';

import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	Input,
	OnChanges,
	computed,
	inject,
	signal,
	viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
	DocumentLayoutContext,
	ResultsProjectionColumn,
	ResultsColumnLayout,
	ResultsProjectionComponent,
	ResultsProjectionHostTemplateDirective,
	ResultsProjectionTemplateDirective,
	ResultsToolbarContext,
	WebUiIconComponent,
	WebUiSlotComponent,
	type ResultsProjectionMode,
} from '@maretha/webui-sdk';
import { DocumentLinkPipe, documentUrl } from 'app/helpers/document-route';
import { AuthService } from 'app/helpers/auth.service';
import { CollectionDrawerNavigation } from 'app/helpers/collection-drawer-navigation.service';
import { environment } from 'environments/environment';
import { firstValueFrom } from 'rxjs';
import { DocumentClipboardService } from '../../helpers/document-clipboard.service';
import { DocumentCollectionsService } from '../../helpers/document-collections.service';
import { DocumentEnhancerService } from '../../helpers/document-enhancer.service';
import {
	DocumentOrderService,
	canOrderChildren,
	planDocumentOrder,
} from '../../helpers/document-order.service';
import { DocumentTrashService } from '../../helpers/document-trash.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { canRunDocumentCommand } from './document-actions-toolbar/document-command-policy';
import { FolderishDetailsPanelComponent } from './folderish-details-panel.component';
import { DocumentGridThumbnailComponent } from '../document-grid-thumbnail/document-grid-thumbnail.component';
import { followFavoriteChanges } from '../../helpers/favorite-changes.service';
import {
	DOCUMENT_CONTENT_SORT_OPTIONS,
	ResultsSortBarComponent,
} from '../results-sort-bar/results-sort-bar.component';

import {
	applyResultColumnLayout,
	mergeResultColumnLayout,
	readResultColumnLayout,
	resultFieldColumns,
} from '../../helpers/scoped-result-columns';
import { hasPermission } from 'app/helpers/document-permissions';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

const PAGE_SIZE = 40;

const SORT_OPTIONS = [
	{ field: 'dc:title', label: 'Title', labelKey: 'app.columns.title', order: 'asc' as const },
	{
		field: 'dc:modified',
		label: 'Modified',
		labelKey: 'app.columns.last-modified',
		order: 'desc' as const,
	},
	{
		field: 'dc:lastContributor',
		label: 'Last Contributor',
		labelKey: 'app.columns.last-contributor',
		order: 'asc' as const,
	},
	{ field: 'dc:created', label: 'Created', labelKey: 'app.columns.created', order: 'asc' as const },
	{ field: 'dc:creator', label: 'Author', labelKey: 'app.columns.author', order: 'asc' as const },
	{ field: 'state', label: 'State', labelKey: 'app.columns.state', order: 'asc' as const },
	{ field: 'dc:nature', label: 'Nature', labelKey: 'app.columns.nature', order: 'asc' as const },
	{
		field: 'dc:coverage',
		label: 'Coverage',
		labelKey: 'app.columns.coverage',
		order: 'asc' as const,
	},
] as const;

type AggregateName = 'dc_modified_agg' | 'dc_last_contributor_agg';
interface AggregateBucket {
	readonly key: string;
	readonly label: string;
	readonly labelKey?: string;
	readonly count: number;
}

interface PictureBookQuickFilter {
	readonly name: string;
	readonly label: string;
	readonly active: boolean;
}

/**
 * Exact PictureBook counterpart to Nuxeo's picturebook view layout.  It intentionally owns
 * its provider request so the generic Folder/Picture/File listing keeps its existing behaviour.
 */
/** Stock folder listing: Title, Modified and Last Contributor until the user chooses otherwise. */
const DEFAULT_VISIBLE_COLUMNS = ['title', 'modified', 'lastContributor'];

@Component({
	selector: 'nx-picturebook-content-layout',
	standalone: true,
	imports: [
		UserTagComponent,
		WebUiDatePipe,
		RouterLink,
		ResultsProjectionComponent,
		ResultsProjectionHostTemplateDirective,
		ResultsProjectionTemplateDirective,
		WebUiIconComponent,
		WebUiSlotComponent,
		DocumentLinkPipe,
		FolderishDetailsPanelComponent,
		WebUiMessagePipe,
		DocumentGridThumbnailComponent,
		ResultsSortBarComponent,
		LoadMoreButtonComponent,
		SearchColumnChooserComponent,
	],
	templateUrl: './picturebook-content-layout.component.html',
	styleUrl: './picturebook-content-layout.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PictureBookContentLayoutComponent implements OnChanges {
	readonly statePresentation = (row: any) =>
		documentStatePresentation(row.state ?? row.currentLifeCycleState);
	private readonly uiPictureBookContentLayoutComponentConfirmations =
		injectUiMessages(RuntimeUiMessages);

	@Input() document: any;
	@Input() noEdit = false;
	@Input() layoutContext?: DocumentLayoutContext;
	@Input() contentLabel = 'PictureBook';

	readonly rows = signal<readonly any[]>([]);
	readonly selectedRows = signal<ReadonlyMap<string, any>>(new Map());
	readonly displayMode = signal<ResultsProjectionMode>('table');
	readonly loading = signal(false);
	readonly loadingMore = signal(false);
	readonly busy = signal(false);
	readonly error = localizedText('');
	readonly hasMore = signal(false);
	readonly total = signal<number | null>(null);
	readonly resultEpoch = signal(0);
	readonly quickFilters = signal<readonly PictureBookQuickFilter[]>([]);
	readonly sortBy = signal<(typeof SORT_OPTIONS)[number]['field']>('dc:modified');
	readonly sortAscending = signal(false);
	readonly titleFilter = signal('');
	readonly aggregateFilters = signal<Record<AggregateName, readonly string[]>>({
		dc_modified_agg: [],
		dc_last_contributor_agg: [],
	});
	readonly aggregateBuckets = signal<Record<AggregateName, readonly AggregateBucket[]>>({
		dc_modified_agg: [],
		dc_last_contributor_agg: [],
	});
	private readonly inputContext = signal<{ document: any; noEdit: boolean }>({
		document: null,
		noEdit: false,
	});
	readonly isCollection = computed(() =>
		['Collection', 'Favorites'].includes(this.inputContext().document?.type),
	);
	readonly isOrderedFolder = computed(() => this.inputContext().document?.type === 'OrderedFolder');
	readonly providerName = computed(() =>
		this.isCollection() ? 'default_content_collection' : 'advanced_document_content',
	);
	readonly naturalOrder = signal(false);
	readonly namedParameters = computed(() => {
		const document = this.inputContext().document;
		const parameters: Record<string, string> = this.isCollection()
			? {}
			: {
					ecm_parentId: document?.uid ?? '',
					ecm_trashed: document?.isTrashed ? '1' : '0',
				};
		// Stock type-ahead sends a prefix match (`title=g*`).
		if (this.titleFilter().trim()) parameters['title'] = `${this.titleFilter().trim()}*`;
		for (const [key, values] of Object.entries(this.aggregateFilters()))
			if (values.length) parameters[key] = JSON.stringify(values);
		const quickFilters = this.quickFilters()
			.filter((filter) => filter.active)
			.map((filter) => filter.name);
		if (quickFilters.length) parameters['quickFilters'] = quickFilters.join(',');
		return parameters;
	});
	readonly selectionOnly = signal(false);
	/** Shortcut hint in the selection bar; shown until the bar itself is used (focus or shortcut). */
	private readonly shortcut = selectionToolbarShortcut('.picturebook-content__selection');
	readonly keyboardHint = this.shortcut.keyboardHint;
	readonly modifierKey = this.shortcut.modifierKey;
	readonly displayedRows = computed(() =>
		this.selectionOnly() && this.selectedRows().size
			? [...this.selectedRows().values()]
			: this.rows(),
	);
	readonly selectedIds = computed(() => [...this.selectedRows().keys()]);
	readonly querySelected = signal(false);
	readonly queryExcludedIds = signal<ReadonlySet<string>>(new Set());
	readonly selectionCount = computed(() =>
		this.querySelected()
			? Math.max(0, (this.total() ?? this.rows().length) - this.queryExcludedIds().size)
			: this.selectedRows().size,
	);
	readonly toolbarContext = computed<ResultsToolbarContext>(() => {
		const { document, noEdit } = this.inputContext();
		const parentUid = typeof document?.uid === 'string' ? document.uid : '';
		const selectedDocuments = this.querySelected() ? [] : [...this.selectedRows().values()];
		const availableCommands = ['select-loaded', 'clear-selection'];
		for (const command of (this.isCollection()
			? ['clipboard']
			: ['clipboard', 'collect', 'trash']) as ('clipboard' | 'collect' | 'trash')[]) {
			if (
				selectedDocuments.length &&
				selectedDocuments.every(
					(document) =>
						canRunDocumentCommand({ document, noEdit }, command) &&
						(command !== 'clipboard' || document.ng?.canAddToCollection),
				)
			)
				availableCommands.push(command);
		}
		if (!this.isCollection() && selectedDocuments.length > 1 && selectedDocuments.length < 200)
			availableCommands.push('compare');
		if (
			this.isCollection() &&
			selectedDocuments.length &&
			!noEdit &&
			!document?.isTrashed &&
			!document?.isVersion &&
			!document?.isProxy &&
			hasPermission(document, 'WriteProperties')
		)
			availableCommands.push('remove-collection');
		if (
			this.isOrderedFolder() &&
			this.naturalOrder() &&
			this.queryIsUnfiltered() &&
			!noEdit &&
			canOrderChildren(document) &&
			selectedDocuments.length
		) {
			const ids = this.rows().map((row) => row.uid);
			const selected = selectedDocuments.map((row) => row.uid);
			if (planDocumentOrder(ids, selected, 'up')) availableCommands.push('move-up');
			if (this.hasMore() || planDocumentOrder(ids, selected, 'down'))
				availableCommands.push('move-down');
		}
		return {
			columns: resultFieldColumns(this.resultColumns()),
			items: this.rows(),
			displayMode: this.displayMode(),
			queryScope: parentUid
				? {
						repository: String(document?.repository ?? 'default'),
						providerName: this.providerName(),
						queryParams: this.isCollection() ? [parentUid] : [],
						namedParameters: this.namedParameters(),
					}
				: undefined,
			queryToken: this.resultEpoch(),
			document,
			collection: this.isCollection() ? document : null,
			noEdit,
			selectedDocuments,
			busy: this.busy() || this.loading(),
			setBusy: (value) => this.busy.set(value),
			refresh: async () => {
				if (this.loadedParentUid === parentUid) await this.load(true);
			},
			reportError: (message) => this.error.set(message),
			reportMessage: (key, fallback, values) => this.error.set(messageText(key, fallback, values)),
			loadedCount: this.rows().length,
			totalCount: this.total() ?? this.rows().length,
			allSelected: this.querySelected(),
			queryExclusions: [...this.queryExcludedIds()],
			availableCommands,
			workflows: [],
			execute: (command) => this.execute(command),
		};
	});
	readonly allColumns: readonly ResultsProjectionColumn<any>[] = [
		{
			id: 'title',
			label: 'Title',
			labelKey: 'app.columns.title',
			value: (row) => row.title ?? '',
			minWidth: 230,
		},
		{
			id: 'type',
			label: 'Type',
			labelKey: 'app.columns.type',
			value: (row) => row.type ?? '',
			hidden: true,
		},
		{
			id: 'modified',
			label: 'Modified',
			labelKey: 'app.columns.last-modified',
			value: (row) => row.properties?.['dc:modified'] ?? '',
		},
		{
			id: 'lastContributor',
			label: 'Last Contributor',
			labelKey: 'app.columns.last-contributor',
			value: (row) => this.contributor(row),
		},
		{
			id: 'state',
			label: 'State',
			labelKey: 'app.columns.state',
			value: (row) => row.state ?? '',
			hidden: true,
		},
		{
			id: 'version',
			label: 'Version',
			labelKey: 'app.columns.version',
			value: (row) => row.versionLabel ?? '',
			hidden: true,
		},
		{
			id: 'created',
			label: 'Created',
			labelKey: 'app.columns.created',
			value: (row) => row.properties?.['dc:created'] ?? '',
			hidden: true,
		},
		{
			id: 'author',
			label: 'Author',
			labelKey: 'app.columns.author',
			value: (row) => this.principalLabel(row.properties?.['dc:creator']),
			hidden: true,
		},
		{
			id: 'nature',
			label: 'Nature',
			labelKey: 'app.columns.nature',
			value: (row) => this.directoryLabel(row.properties?.['dc:nature']),
			hidden: true,
		},
		{
			id: 'coverage',
			label: 'Coverage',
			labelKey: 'app.columns.coverage',
			value: (row) => this.directoryLabel(row.properties?.['dc:coverage']),
			hidden: true,
		},
		{
			id: 'subjects',
			label: 'Subjects',
			labelKey: 'app.columns.subjects',
			value: (row) => this.directoryLabel(row.properties?.['dc:subjects']),
			hidden: true,
		},
	];
	readonly visibleColumnIds = signal<ReadonlySet<string>>(new Set(DEFAULT_VISIBLE_COLUMNS));
	readonly columnLayout = signal<readonly ResultsColumnLayout[]>([]);
	private readonly projectionElement = viewChild(ResultsProjectionComponent, {
		read: ElementRef<HTMLElement>,
	});
	private readonly columnChooser = viewChild(SearchColumnChooserComponent);
	openColumnChooser(): void {
		this.columnChooser()?.open(
			() =>
				this.projectionElement()?.nativeElement.querySelector(
					'.nx-results-projection__settings-button',
				) ?? null,
		);
	}
	resetColumns(): void {
		this.visibleColumnIds.set(new Set(DEFAULT_VISIBLE_COLUMNS));
		this.columnLayout.set([]);
		this.savePreferences();
	}
	readonly resultColumns = computed(() =>
		applyResultColumnLayout(
			this.allColumns.map((column) => ({
				...column,
				headerComponent: ContentColumnHeaderComponent,
				headerComponentParams: { content: this, id: column.id },
				hidden: !this.visibleColumnIds().has(column.id),
			})),
			this.columnLayout(),
		),
	);
	columnLayoutChanged(layout: readonly ResultsColumnLayout[]): void {
		this.columnLayout.set(mergeResultColumnLayout(this.columnLayout(), layout));
		this.savePreferences();
	}
	readonly resultUrl = documentUrl;
	activateResult(row: any): void {
		if (this.loading() || this.busy()) return;
		if (this.document?.type === 'Collection') {
			void this.collectionNavigation.navigate(this.document, row, this.auth.userInfo()?.id ?? '');
		} else void this.router.navigateByUrl(documentUrl(row));
	}
	activateCollectionLink(event: MouseEvent, row: any): void {
		if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
			return;
		event.preventDefault();
		this.activateResult(row);
	}
	readonly sortOptions = SORT_OPTIONS;
	/**
	 * Stock nuxeo-sort-select shows its selected option, Title ascending, until a sort is applied,
	 * although the server's order is what the rows follow.
	 */
	readonly gridSort = computed(() =>
		this.sortApplied()
			? { field: this.sortBy(), ascending: this.sortAscending() }
			: { field: 'dc:title' as const, ascending: true },
	);
	/** Cards drawn again (after a view switch) show the current star, as stock removed-from-favorites. */
	private readonly favoriteChanges = followFavoriteChanges(this.rows);
	/**
	 * Stock nuxeo-document-content grid sort choices and labels (Title, Created, Modified, Last
	 * contributor), plus a field a table header applied that the list does not name.
	 */
	readonly gridSortOptions = computed(() => {
		const current = SORT_OPTIONS.find((option) => option.field === this.gridSort().field);
		return current &&
			!DOCUMENT_CONTENT_SORT_OPTIONS.some((option) => option.field === current.field)
			? [...DOCUMENT_CONTENT_SORT_OPTIONS, current]
			: DOCUMENT_CONTENT_SORT_OPTIONS;
	});

	private readonly confirmDialog = inject(ConfirmDialogService);
	private readonly http = inject(HttpClient);
	private readonly ordering = inject(DocumentOrderService);
	private readonly destroyRef = inject(DestroyRef);
	private readonly clipboard = inject(DocumentClipboardService);
	private readonly enhancer = inject(DocumentEnhancerService);
	private readonly trash = inject(DocumentTrashService);
	private readonly router = inject(Router);
	private readonly collectionNavigation = inject(CollectionDrawerNavigation);
	private readonly manager = inject(DocumentsManagerService);
	private readonly auth = inject(AuthService);
	private page = 0;
	private requestGeneration = 0;
	private loadedParentUid = '';
	private loadedRepository = 'default';
	private readonly sortApplied = signal(false);
	private titleFilterTimer?: ReturnType<typeof setTimeout>;
	private readonly confirmedTrashedIds = new Set<string>();
	private optimisticTotal?: { query: string; value: number };
	private optimisticMinimum?: { query: string; value: number };
	private readonly pendingDocuments = new Map<string, any>();
	private managerSnapshot = new Map<string, string>();
	private managerTotal?: number;
	private mutationRefreshTimer?: ReturnType<typeof setTimeout>;
	private mutationRefreshSequence = 0;

	private preferenceKey(): string | null {
		const user = this.auth.userInfo()?.id;
		return user && this.loadedParentUid
			? `maretha.content-results.v1:${JSON.stringify([user, this.document?.repository ?? 'default', this.loadedParentUid])}`
			: null;
	}

	private restorePreferences(): void {
		this.displayMode.set('table');
		this.columnLayout.set([]);
		this.visibleColumnIds.set(new Set(DEFAULT_VISIBLE_COLUMNS));
		const key = this.preferenceKey();
		if (!key) return;
		try {
			const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
			this.columnLayout.set(readResultColumnLayout(stored?.columnLayout));
			if (stored?.mode === 'table' || stored?.mode === 'grid') this.displayMode.set(stored.mode);
			if (Array.isArray(stored?.columns)) {
				const columns: string[] = stored.columns.filter(
					(id: unknown): id is string =>
						typeof id === 'string' && this.allColumns.some((column) => column.id === id),
				);
				if (columns.length) this.visibleColumnIds.set(new Set(columns));
			}
		} catch {
			/* A blocked or old storage entry must not prevent document browsing. */
		}
	}

	private savePreferences(): void {
		const key = this.preferenceKey();
		if (!key) return;
		try {
			localStorage.setItem(
				key,
				JSON.stringify({
					mode: this.displayMode(),
					columns: [...this.visibleColumnIds()],
					columnLayout: this.columnLayout(),
				}),
			);
		} catch {
			/* Browsing also works when local storage is unavailable. */
		}
	}

	private documentStamp(document: any): string {
		return String(
			document?.changeToken ??
				document?.lastModified ??
				document?.properties?.['dc:modified'] ??
				'',
		);
	}

	private matchesParent(document: any): boolean {
		return (
			!!this.loadedParentUid &&
			(this.isCollection()
				? this.rows().some((row) => row.uid === document?.uid)
				: document?.parentRef === this.loadedParentUid) &&
			(document?.repository ?? 'default') === (this.document?.repository ?? 'default')
		);
	}

	private queryIsUnfiltered(): boolean {
		return (
			!this.titleFilter().trim() &&
			!Object.values(this.aggregateFilters()).some((values) => values.length) &&
			!this.quickFilters().some((filter) => filter.active)
		);
	}

	private retainMutatedDocuments(documents: readonly any[]): void {
		const relevant = documents.filter(
			(document) =>
				this.matchesParent(document) && !document.isTrashed && typeof document.uid === 'string',
		);
		if (!relevant.length) return;
		for (const document of relevant) {
			this.confirmedTrashedIds.delete(document.uid);
			this.pendingDocuments.set(document.uid, this.enhancer.setDocumentCustomProperties(document));
		}
		if (this.queryIsUnfiltered()) {
			const known = new Set(this.rows().map((row) => row.uid));
			const added = relevant.filter((document) => !known.has(document.uid)).length;
			this.rows.set(this.mergePendingDocuments(this.rows()));
			this.total.update((total) => (total === null ? null : total + added));
			if (this.total() !== null && added) {
				this.optimisticMinimum = {
					query: JSON.stringify(this.namedParameters()),
					value: this.total()!,
				};
				this.optimisticTotal = undefined;
			}
		}
		this.scheduleMutationRefresh();
	}

	private mergePendingDocuments(rows: readonly any[]): readonly any[] {
		if (!this.queryIsUnfiltered() || !this.pendingDocuments.size) return rows;
		const merged = new Map(rows.map((row) => [row.uid, row]));
		for (const [id, document] of this.pendingDocuments) merged.set(id, document);
		if (this.naturalOrder()) return [...merged.values()];
		const field = this.sortBy();
		const direction = this.sortAscending() ? 1 : -1;
		return [...merged.values()].sort((left, right) => {
			const value = (document: any) =>
				field === 'state' ? document.state : document.properties?.[field];
			return String(value(left) ?? '').localeCompare(String(value(right) ?? '')) * direction;
		});
	}

	private scheduleMutationRefresh(): void {
		clearTimeout(this.mutationRefreshTimer);
		const sequence = ++this.mutationRefreshSequence;
		const parent = this.loadedParentUid;
		const repository = this.loadedRepository;
		// One reload per mutation: writes ask the server to index synchronously (nx-es-sync), as
		// stock does, and rows the index has not caught up with stay merged as pending documents.
		const refresh = async () => {
			if (
				sequence !== this.mutationRefreshSequence ||
				parent !== this.loadedParentUid ||
				repository !== this.loadedRepository ||
				this.destroyRef.destroyed
			)
				return;
			await this.load(true, true);
		};
		this.mutationRefreshTimer = setTimeout(refresh, 0);
	}

	private removeMutatedDocuments(ids: readonly string[]): void {
		const removedIds = new Set(ids);
		const removed = this.rows().filter((row) => removedIds.has(row.uid)).length;
		if (!removed && !ids.some((id) => this.pendingDocuments.has(id))) return;
		for (const id of ids) {
			this.confirmedTrashedIds.add(id);
			this.pendingDocuments.delete(id);
		}
		this.rows.update((rows) => rows.filter((row) => !removedIds.has(row.uid)));
		this.selectedRows.update((rows) => new Map([...rows].filter(([id]) => !removedIds.has(id))));
		this.total.update((total) => (total === null ? null : Math.max(0, total - removed)));
		if (!this.busy()) this.scheduleMutationRefresh();
	}
	private async execute(command: string): Promise<void> {
		const context = this.toolbarContext();
		if (context.busy || !context.availableCommands.includes(command)) return;
		if (command === 'select-loaded') {
			this.selectRows(this.rows());
			return;
		}
		if (command === 'clear-selection') {
			this.clearSelection();
			return;
		}
		const documents = [...context.selectedDocuments];
		if (command === 'clipboard') {
			this.clipboard.addToClipboard(documents);
			return;
		}
		if (command === 'compare') {
			await this.router.navigate(['/page/compare'], {
				queryParams: {
					left: documents[1]['uid'],
					right: documents[0]['uid'],
					ids: documents.map((document) => document['uid']).join(','),
					repository: String(this.document?.repository ?? 'default'),
				},
			});
			return;
		}
		if (command === 'remove-collection') {
			await this.removeCollectionMembers(documents);
			return;
		}
		if (command === 'move-up' || command === 'move-down') {
			await this.moveSelected(command === 'move-up' ? 'up' : 'down');
			return;
		}
		// The shared collect action owns its existing collection picker and transport.
		if (
			command !== 'trash' ||
			!(await this.confirmDialog.confirm({
				titleKey: 'deleteDocumentsButton.confirm.deleteDocuments',
				title: 'Delete selected document(s)?',
				confirmKey: 'documentTrashAction.tooltip',
				confirm: 'Move to trash',
				icon: 'nuxeo:delete',
			}))
		)
			return;
		const parentUid = this.loadedParentUid;
		this.busy.set(true);
		this.error.set('');
		try {
			await firstValueFrom(
				this.trash.moveDocumentsToTrash(documents.map((document) => String(document['uid']))),
			);
			if (!this.destroyRef.destroyed && this.loadedParentUid === parentUid) {
				// The repository confirms the mutation before its search index catches up.
				// Keep those known-successful removals out of this parent's provider results.
				const ids = new Set(documents.map((document) => String(document['uid'])));
				for (const id of ids) this.confirmedTrashedIds.add(id);
				const removed = this.rows().filter((row) => ids.has(row.uid)).length;
				this.rows.update((rows) => rows.filter((row) => !ids.has(row.uid)));
				this.clearSelection();
				const total = this.total();
				if (total !== null) {
					const value = Math.max(0, total - removed);
					this.total.set(value);
					this.optimisticTotal = { query: JSON.stringify(this.namedParameters()), value };
				}
				await this.load(true);
			}
		} catch {
			if (!this.destroyRef.destroyed && this.loadedParentUid === parentUid)
				this.error.set(
					messageText(
						'app.state.the-selected-documents-could-not-be-moved-to-240f2c',
						'The selected documents could not be moved to trash. Check permissions and retry.',
					),
				);
		} finally {
			if (!this.destroyRef.destroyed) this.busy.set(false);
		}
	}

	private async removeCollectionMembers(documents: readonly any[]): Promise<void> {
		const uid = this.loadedParentUid;
		const repository = String(this.document?.repository ?? 'default');
		this.busy.set(true);
		this.error.set('');
		try {
			await firstValueFrom(
				this.http.post(
					`${environment.nuxeoUrl}/api/v1/automation/Collection.RemoveFromCollection`,
					{
						input: documents.map((document) => String(document.uid)),
						params: { collection: uid },
					},
					{ headers: { 'X-NXRepository': repository, 'nx-es-sync': 'true' } },
				),
			);
			if (this.destroyRef.destroyed || this.loadedParentUid !== uid) return;
			this.removeMutatedDocuments(documents.map((document) => document.uid));
			this.clearSelection();
			await this.load(true);
		} catch {
			if (!this.destroyRef.destroyed && this.loadedParentUid === uid)
				this.error.set(
					messageText(
						'app.state.the-selected-documents-could-not-be-removed-f-94e7f8',
						'The selected documents could not be removed from this collection. Refresh and retry.',
					),
				);
		} finally {
			if (!this.destroyRef.destroyed && this.loadedParentUid === uid) this.busy.set(false);
		}
	}

	private async moveSelected(direction: 'up' | 'down'): Promise<void> {
		const uid = this.loadedParentUid;
		const repository = String(this.document?.repository ?? 'default');
		const selected = this.selectedIds();
		const isCurrent = () =>
			!this.destroyRef.destroyed &&
			this.loadedParentUid === uid &&
			(this.document?.repository ?? 'default') === repository &&
			this.naturalOrder() &&
			this.queryIsUnfiltered();
		this.busy.set(true);
		this.error.set('');
		try {
			const order = await this.ordering.move(
				uid,
				repository,
				selected,
				direction,
				isCurrent,
				this.rows().map((row) => row.uid),
			);
			if (!order || !isCurrent()) return;
			this.pendingDocuments.clear();
			await this.load(true);
			if (!isCurrent()) return;
			// Document.Order succeeded; the page provider behind the reload can still serve the
			// pre-move index order, so the confirmed sibling order decides the rows and the gates.
			const reordered = reorderRowsBySiblings(
				this.rows(),
				order.map((uid) => ({ uid })),
			);
			if (reordered !== this.rows()) this.rows.set(reordered);
			this.selectRows(this.rows().filter((row) => selected.includes(row.uid)));
		} catch (error) {
			if (isCurrent())
				this.error.set(
					error instanceof Error
						? errorMessage(error)
						: messageText(
								'app.state.the-documents-could-not-be-reordered-refresh-0e0bf7',
								'The documents could not be reordered. Refresh and retry.',
							),
				);
		} finally {
			if (!this.destroyRef.destroyed && this.loadedParentUid === uid) this.busy.set(false);
		}
	}

	useNaturalOrder(): void {
		if (!this.isOrderedFolder() || this.busy()) return;
		this.sortApplied.set(false);
		this.naturalOrder.set(true);
		void this.load(true);
	}

	constructor() {
		this.destroyRef.onDestroy(() => {
			clearTimeout(this.titleFilterTimer);
			clearTimeout(this.mutationRefreshTimer);
		});
		this.auth.userInfoUpdated$
			.pipe(takeUntilDestroyed())
			.subscribe(() => this.restorePreferences());
		inject(DocumentCollectionsService)
			.documentsRemovedFromCollection$.pipe(takeUntilDestroyed())
			.subscribe((event) => {
				if (
					!['Collection', 'Favorites'].includes(this.document?.type) ||
					this.document?.uid !== this.loadedParentUid ||
					event.collectionUid !== this.loadedParentUid ||
					(this.document?.repository ?? 'default') !== this.loadedRepository ||
					(event.repository ?? 'default') !== this.loadedRepository
				)
					return;
				this.removeMutatedDocuments(event.documentUids);
				this.scheduleMutationRefresh();
			});
		this.manager.documentsUpdated$.pipe(takeUntilDestroyed()).subscribe((documents) => {
			if (
				this.manager.documentInfo?.uid !== this.loadedParentUid ||
				(this.manager.documentInfo?.repository ?? 'default') !== this.loadedRepository
			)
				return;
			const relevant = documents.filter((document) => this.matchesParent(document));
			const changed = relevant.filter(
				(document) =>
					this.managerSnapshot.has(document.uid) &&
					this.rows().some((row) => row.uid === document.uid) &&
					this.managerSnapshot.get(document.uid) !== this.documentStamp(document),
			);
			const grew = this.managerTotal !== undefined && this.manager.totalCount > this.managerTotal;
			this.managerTotal = this.manager.totalCount;
			this.managerSnapshot = new Map(
				relevant.map((document) => [document.uid, this.documentStamp(document)]),
			);
			// Reordering (Move Up/Down) sorts the manager's documents; the page provider listing
			// behind this layout can lag the index, so take the sibling order from the manager.
			if (this.naturalOrder()) {
				const reordered = reorderRowsBySiblings(this.rows(), relevant);
				if (reordered !== this.rows()) this.rows.set(reordered);
			}
			if (changed.length) this.retainMutatedDocuments(changed);
			else if (grew) this.scheduleMutationRefresh();
		});
		this.clipboard.documentsCopied$.pipe(takeUntilDestroyed()).subscribe((event) => {
			if (!this.isCollection() && event.destinationUid === this.loadedParentUid)
				this.retainMutatedDocuments(event.documents ?? []);
		});
		this.clipboard.documentsMoved$.pipe(takeUntilDestroyed()).subscribe((event) => {
			if (!this.isCollection() && event.destinationUid === this.loadedParentUid)
				this.retainMutatedDocuments(event.documents ?? []);
			else if (!this.isCollection())
				this.removeMutatedDocuments((event.documents ?? []).map((document: any) => document.uid));
		});
		this.clipboard.drawerActionPerformed$.pipe(takeUntilDestroyed()).subscribe((event) => {
			if (
				this.isCollection() ||
				!this.loadedParentUid ||
				event.repository !== this.loadedRepository
			)
				return;
			if (event.destinationUid === this.loadedParentUid) {
				this.scheduleMutationRefresh();
			} else if (event.operation === 'Move') {
				this.removeMutatedDocuments(event.sourceUids);
			}
		});
		this.trash.documentsMovedToTrash$
			.pipe(takeUntilDestroyed())
			.subscribe((ids) => this.removeMutatedDocuments(ids));
		this.trash.documentsPurged$
			.pipe(takeUntilDestroyed())
			.subscribe((ids) => this.removeMutatedDocuments(ids));
		this.trash.documentsRestoredFromTrash$.pipe(takeUntilDestroyed()).subscribe((ids) => {
			for (const id of ids) this.confirmedTrashedIds.delete(id);
			if (this.loadedParentUid) this.scheduleMutationRefresh();
		});
	}

	ngOnChanges(): void {
		this.inputContext.set({
			document: this.document ?? null,
			noEdit: this.noEdit || this.layoutContext?.noEdit === true,
		});
		const uid = typeof this.document?.uid === 'string' ? this.document.uid : '';
		const repository = this.document?.repository ?? 'default';
		if (uid && (uid !== this.loadedParentUid || repository !== this.loadedRepository)) {
			this.loadedParentUid = uid;
			this.loadedRepository = repository;
			this.busy.set(false);
			this.sortApplied.set(false);
			this.naturalOrder.set(this.isOrderedFolder());
			this.sortBy.set('dc:modified');
			this.sortAscending.set(false);
			this.confirmedTrashedIds.clear();
			this.optimisticTotal = undefined;
			this.optimisticMinimum = undefined;
			this.pendingDocuments.clear();
			this.managerTotal = undefined;
			this.managerSnapshot = new Map(
				this.manager.documents
					.filter((document) => this.matchesParent(document))
					.map((document) => [document.uid, this.documentStamp(document)]),
			);
			if (
				this.managerSnapshot.size ||
				(this.manager.totalCount === 0 && this.manager.fetchingDocuments?.() === false)
			)
				this.managerTotal = this.manager.totalCount;
			clearTimeout(this.mutationRefreshTimer);
			++this.mutationRefreshSequence;
			this.restorePreferences();
			clearTimeout(this.titleFilterTimer);
			this.titleFilter.set('');
			this.aggregateFilters.set({ dc_modified_agg: [], dc_last_contributor_agg: [] });
			this.aggregateBuckets.set({ dc_modified_agg: [], dc_last_contributor_agg: [] });
			this.quickFilters.set([]);
			void this.load(true);
		}
		if (!uid) {
			++this.requestGeneration;
			this.loadedParentUid = '';
			this.loadedRepository = repository;
			this.confirmedTrashedIds.clear();
			this.optimisticTotal = undefined;
			this.optimisticMinimum = undefined;
			this.pendingDocuments.clear();
			this.managerTotal = undefined;
			clearTimeout(this.mutationRefreshTimer);
			++this.mutationRefreshSequence;
			clearTimeout(this.titleFilterTimer);
			this.loading.set(false);
			this.error.set('');
			this.reset();
		}
	}

	/** Stock type-ahead queries on every keystroke; a newer keystroke supersedes the in-flight
	 *  request through `requestGeneration` (no debounce). */
	setTitleFilter(value: string): void {
		this.titleFilter.set(value);
		clearTimeout(this.titleFilterTimer);
		void this.load(true);
	}

	toggleAggregate(name: AggregateName, key: string): void {
		this.aggregateFilters.update((filters) => ({
			...filters,
			[name]: filters[name].includes(key)
				? filters[name].filter((value) => value !== key)
				: [...filters[name], key],
		}));
		void this.load(true);
	}

	toggleColumn(id: string): void {
		this.visibleColumnIds.update((visible) => {
			const next = new Set(visible);
			if (next.has(id)) {
				if (next.size > 1) next.delete(id);
			} else next.add(id);
			return next;
		});
		this.savePreferences();
	}

	setDisplayMode(mode: ResultsProjectionMode): void {
		this.displayMode.set(mode);
		this.savePreferences();
	}

	setSort(field: (typeof SORT_OPTIONS)[number]['field']): void {
		if (this.sortBy() === field && this.sortApplied()) return;
		this.sortApplied.set(true);
		this.naturalOrder.set(false);
		this.sortBy.set(field);
		this.sortAscending.set(
			this.sortOptions.find((option) => option.field === field)?.order === 'asc',
		);
		void this.load(true);
	}

	toggleSortOrder(): void {
		// From the displayed default, stock reverses that option: Title descending.
		const { field, ascending } = this.gridSort();
		this.sortApplied.set(true);
		this.naturalOrder.set(false);
		this.sortBy.set(field);
		this.sortAscending.set(!ascending);
		void this.load(true);
	}

	projectedSortChange(event: { columnId: string; direction: 'asc' | 'desc' | null }): void {
		const fields: Record<string, (typeof SORT_OPTIONS)[number]['field']> = {
			title: 'dc:title',
			modified: 'dc:modified',
			lastContributor: 'dc:lastContributor',
			created: 'dc:created',
			author: 'dc:creator',
			state: 'state',
			nature: 'dc:nature',
			coverage: 'dc:coverage',
		};
		if (!event.direction) {
			this.sortApplied.set(false);
			this.naturalOrder.set(this.isOrderedFolder());
			this.sortBy.set('dc:modified');
			this.sortAscending.set(false);
			void this.load(true);
			return;
		}
		if (!fields[event.columnId]) return;
		this.sortApplied.set(true);
		this.naturalOrder.set(false);
		this.sortBy.set(fields[event.columnId]);
		this.sortAscending.set(event.direction === 'asc');
		void this.load(true);
	}

	toggleQuickFilter(name: string): void {
		this.quickFilters.update((filters) =>
			filters.map((filter) =>
				filter.name === name ? { ...filter, active: !filter.active } : filter,
			),
		);
		void this.load(true);
	}

	projectedSelectionChange(ids: readonly string[]): void {
		const selected = new Set(ids);
		if (this.querySelected()) {
			const excluded = new Set(this.queryExcludedIds());
			for (const row of this.rows()) {
				if (selected.has(row.uid)) excluded.delete(row.uid);
				else excluded.add(row.uid);
			}
			this.queryExcludedIds.set(excluded);
		}
		const rows = new Map(this.selectedRows());
		for (const row of this.rows()) {
			if (selected.has(row.uid)) rows.set(row.uid, row);
			else rows.delete(row.uid);
		}
		this.selectedRows.set(rows);
	}

	selectAllMatching(): void {
		if (this.isCollection() || this.loading() || this.busy() || !this.rows().length) return;
		this.selectRows(this.rows());
		this.querySelected.set(true);
		this.queryExcludedIds.set(new Set());
	}

	more(): void {
		if (this.hasMore() && !this.loading() && !this.busy()) void this.load(false);
	}

	retry(): void {
		if (!this.loading() && !this.busy()) void this.load(this.rows().length === 0);
	}

	thumbnail(row: any): string {
		return (
			row?.contextParameters?.thumbnail?.url ??
			row?.contextParameters?.renditions?.find((rendition: any) => rendition?.name === 'thumbnail')
				?.url ??
			''
		);
	}

	contributor(row: any): string {
		return this.principalLabel(row?.properties?.['dc:lastContributor']);
	}

	private directoryLabel(value: any): string {
		if (Array.isArray(value)) return value.map((entry) => this.directoryLabel(entry)).join(', ');
		if (value && typeof value === 'object')
			return String(value.properties?.label ?? value.label ?? value.id ?? '');
		return String(value ?? '');
	}

	private principalLabel(value: any): string {
		if (typeof value === 'string') return value;
		if (value && typeof value === 'object') {
			const properties = value.properties ?? value;
			const name = [properties.firstName, properties.lastName].filter(Boolean).join(' ');
			return String(
				value.displayName ||
					properties.displayName ||
					name ||
					properties.email ||
					value.id ||
					properties.username ||
					'',
			);
		}
		return '';
	}

	contributorId(row: any): string {
		const value = row?.properties?.['dc:lastContributor'];
		return typeof value === 'string'
			? value
			: String(value?.id ?? value?.properties?.username ?? '');
	}

	documentDate(row: any, property: 'dc:modified' | 'dc:created'): string | number | Date | null {
		const value = row?.properties?.[property];
		return value instanceof Date || typeof value === 'string' || typeof value === 'number'
			? value
			: null;
	}

	private async load(reset: boolean, preserveRows = false): Promise<void> {
		const parentUid = typeof this.document?.uid === 'string' ? this.document.uid : '';
		const repository = this.document?.repository ?? 'default';
		// A new parent/filter must supersede an in-flight request. A mutation's refresh
		// also runs before its toolbar releases busy, so only paging is gated here.
		if (!parentUid || (!reset && (this.loading() || this.busy()))) return;
		const request = ++this.requestGeneration;
		const page = reset ? 0 : this.page;
		if (reset && !preserveRows) this.reset();
		this.loading.set(true);
		this.loadingMore.set(!reset);
		this.error.set('');
		try {
			const result: any = await firstValueFrom(this.providerRequest(parentUid, page));
			if (
				request !== this.requestGeneration ||
				this.destroyRef.destroyed ||
				parentUid !== this.loadedParentUid ||
				repository !== this.loadedRepository
			)
				return;
			const received = Array.isArray(result?.entries) ? result.entries : [];
			for (const row of received) {
				const pending = this.pendingDocuments.get(row.uid);
				if (pending && this.documentStamp(pending) === this.documentStamp(row))
					this.pendingDocuments.delete(row.uid);
			}
			const staleTrashedCount = received.filter((row: any) =>
				this.confirmedTrashedIds.has(row?.uid),
			).length;
			const known = new Set(reset ? [] : this.rows().map((row) => row.uid));
			const entries = received
				.filter(
					(row: any) =>
						typeof row?.uid === 'string' &&
						!known.has(row.uid) &&
						!this.confirmedTrashedIds.has(row.uid),
				)
				.map((row: any) => this.enhancer.setDocumentCustomProperties(row));
			this.rows.set(this.mergePendingDocuments(reset ? entries : [...this.rows(), ...entries]));
			if (this.querySelected())
				this.selectRows(this.rows().filter((row) => !this.queryExcludedIds().has(row.uid)));
			this.page = page + 1;
			this.hasMore.set(result?.isNextPageAvailable === true && received.length > 0);
			const reportedTotal =
				typeof result?.totalSize === 'number'
					? result.totalSize
					: typeof result?.resultsCount === 'number'
						? result.resultsCount
						: null;
			const total = reportedTotal === null ? null : Math.max(0, reportedTotal - staleTrashedCount);
			// A complete fresh page also accounts for new children added after the trash.
			if (page === 0 && !result?.isNextPageAvailable && staleTrashedCount === 0)
				this.optimisticTotal = undefined;
			const optimistic =
				this.optimisticTotal?.query === JSON.stringify(this.namedParameters())
					? this.optimisticTotal.value
					: undefined;
			this.total.set(
				total === null || optimistic === undefined ? total : Math.min(total, optimistic),
			);
			const minimum =
				this.optimisticMinimum?.query === JSON.stringify(this.namedParameters())
					? this.optimisticMinimum.value
					: undefined;
			if (minimum !== undefined && this.total() !== null) {
				this.total.update((value) => Math.max(value!, minimum));
				if (reportedTotal !== null && reportedTotal >= minimum) this.optimisticMinimum = undefined;
			}
			if (this.queryIsUnfiltered() && this.pendingDocuments.size)
				this.total.update((value) => (value === null ? null : Math.max(value, this.rows().length)));
			if (
				optimistic !== undefined &&
				staleTrashedCount === 0 &&
				reportedTotal !== null &&
				reportedTotal <= optimistic
			)
				this.optimisticTotal = undefined;
			this.applyQuickFilters(result?.quickFilters);
			this.applyAggregations(result?.aggregations);
			this.resultEpoch.update((epoch) => epoch + 1);
		} catch {
			if (request === this.requestGeneration && !this.destroyRef.destroyed)
				this.error.set(
					messageText(
						'app.state.-value-content-could-not-be-loaded-check-your-2ea53d',
						'{value0} content could not be loaded. Check your access and retry.',
						{ value0: this.contentLabel },
					),
				);
		} finally {
			if (request === this.requestGeneration) {
				this.loading.set(false);
				this.loadingMore.set(false);
			}
		}
	}

	private providerRequest(parentUid: string, page: number) {
		let params = new HttpParams().set('currentPageIndex', page).set('pageSize', PAGE_SIZE);
		if (this.sortApplied())
			params = params
				.set('sortBy', this.sortBy())
				.set('sortOrder', this.sortAscending() ? 'asc' : 'desc');
		for (const [key, value] of Object.entries(this.namedParameters()))
			params = params.set(key, value);
		if (this.isCollection()) params = params.set('queryParams', parentUid);
		else params = params.set('ecm_parentId', parentUid);
		if (this.naturalOrder()) params = params.set('sortBy', 'ecm:pos').set('sortOrder', 'asc');
		return this.http.get(
			`${environment.nuxeoUrl}/api/v1/search/pp/${this.providerName()}/execute`,
			{
				params,
				headers: new HttpHeaders({
					'enrichers-document':
						this.document?.type === 'Favorites'
							? 'thumbnail,permissions'
							: 'thumbnail,permissions,favorites',
					'X-NXRepository': String(this.document?.repository ?? 'default'),
					properties:
						this.document?.type === 'Favorites'
							? 'dublincore,common,uid'
							: this.isCollection()
								? 'dublincore,common,file'
								: 'dublincore,common,uid,file',
					...(!this.isCollection()
						? {
								'X-NXfetch-document': 'properties',
								'fetch-aggregate': 'key',
								'X-NXtranslate-directoryEntry': 'label',
							}
						: {}),
				}),
			},
		);
	}

	private applyAggregations(value: any): void {
		const buckets = (name: AggregateName): readonly AggregateBucket[] => {
			const entries = value?.[name]?.extendedBuckets ?? value?.[name]?.buckets;
			return Array.isArray(entries)
				? entries
						.filter((bucket) => typeof bucket?.key === 'string')
						.map((bucket) => ({
							key: bucket.key,
							label: bucket.fetchedKey ? this.principalLabel(bucket.fetchedKey) : bucket.key,
							...builtinAggregationLabel(name, bucket.key),
							count: Number(bucket.docCount) || 0,
						}))
				: [];
		};
		this.aggregateBuckets.set({
			dc_modified_agg: buckets('dc_modified_agg'),
			dc_last_contributor_agg: buckets('dc_last_contributor_agg'),
		});
	}

	private applyQuickFilters(value: unknown): void {
		if (!Array.isArray(value)) return;
		const active = new Set(
			this.quickFilters()
				.filter((filter) => filter.active)
				.map((filter) => filter.name),
		);
		this.quickFilters.set(
			value
				.filter(
					(filter): filter is Record<string, unknown> => !!filter && typeof filter === 'object',
				)
				.map((filter) => {
					const name = typeof filter['name'] === 'string' ? filter['name'] : '';
					return {
						name,
						label: typeof filter['label'] === 'string' && filter['label'] ? filter['label'] : name,
						active: active.has(name) || filter['active'] === true,
					};
				})
				.filter((filter) => !!filter.name),
		);
	}

	private selectRows(rows: readonly any[]): void {
		this.selectedRows.set(
			new Map(rows.filter((row) => typeof row?.uid === 'string').map((row) => [row.uid, row])),
		);
	}

	private clearSelection(): void {
		this.selectedRows.set(new Map());
		this.querySelected.set(false);
		this.queryExcludedIds.set(new Set());
	}

	private reset(): void {
		this.rows.set([]);
		this.clearSelection();
		this.page = 0;
		this.hasMore.set(false);
		this.total.set(null);
		this.resultEpoch.update((epoch) => epoch + 1);
	}
}
