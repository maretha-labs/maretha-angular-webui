import { documentStatePresentation } from 'app/helpers/document-type-presentation';
import { selectionToolbarShortcut } from 'app/helpers/selection-toolbar-shortcut';
import { SidebarService } from 'app/helpers/sidebar.service';
import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import { CORE_RESULTS_OPTIONS } from 'app/helpers/core-results-options';
import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiMessages } from '@maretha/webui-sdk';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';

import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	viewChild,
	computed,
	effect,
	input,
	inject,
	signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
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
import { followFavoriteChanges } from 'app/modules/explorer/helpers/favorite-changes.service';
import { DocumentGridThumbnailComponent } from 'app/modules/explorer/components/document-grid-thumbnail/document-grid-thumbnail.component';
import { ResultsSortBarComponent } from 'app/modules/explorer/components/results-sort-bar/results-sort-bar.component';
import { EMPTY, firstValueFrom, Subject, takeUntil } from 'rxjs';
import { DocumentSearchService, SavedSearchAction } from '../../helpers/document-search.service';
import {
	SearchSelectionActions,
	SearchResultsToolbarContext,
	UNSELECTED_SEARCH_ACTIONS,
	QUERY_SEARCH_ACTIONS,
	searchSelectionCommands,
} from '../../helpers/search-selection-actions.service';
import { readSearchView, writeSearchView } from '../../helpers/search-view-preferences';
import {
	REPOSITORY_SEARCH,
	type CompiledSearchDefinition,
} from '../../helpers/repository-search-definitions';
import { metadataLabel } from '../../helpers/repository-search-columns';
import { searchViewComponents } from '../../helpers/search-view-components';
import { SearchColumnChooserComponent } from 'app/modules/shared/components/search-column-chooser/search-column-chooser.component';
import { DefaultSearchColumnHeaderComponent } from './default-search-column-header.component';
import { LoadMoreButtonComponent } from 'app/modules/shared/components/load-more/load-more-button.component';
import { SearchResultTagsComponent } from '../search-result-tags/search-result-tags.component';
import {
	stockResultColumnWidths,
	userResultColumnLayout,
} from '../../helpers/stock-result-columns';

import {
	applyResultColumnLayout,
	mergeResultColumnLayout,
	resultFieldColumns,
} from '../../../explorer/helpers/scoped-result-columns';

const QUERY_SELECTION_LIMIT = 500;
const QUERY_SELECTION_MAX_PAGES = 50;

const SORT_OPTIONS = [
	{ field: 'dc:title', label: 'Title', labelKey: 'app.columns.title', order: 'asc' as const },
	{ field: 'dc:created', label: 'Created', labelKey: 'app.columns.created', order: 'asc' as const },
	{
		field: 'dc:modified',
		label: 'Modified',
		labelKey: 'app.columns.modified',
		order: 'desc' as const,
	},
	{
		field: 'dc:lastContributor',
		label: 'Last contributor',
		labelKey: 'app.columns.last-contributor',
		order: 'asc' as const,
	},
	{ field: 'state', label: 'State', labelKey: 'app.columns.state', order: 'asc' as const },
	{ field: 'dc:nature', label: 'Nature', labelKey: 'app.columns.nature', order: 'asc' as const },
	{
		field: 'dc:coverage',
		label: 'Coverage',
		labelKey: 'app.columns.coverage',
		order: 'asc' as const,
	},
] as const;
type SearchSortField = (typeof SORT_OPTIONS)[number]['field'] | 'dc:creator';

@Component({
	selector: 'nx-default-search-results',
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
		WebUiMessagePipe,
		DocumentGridThumbnailComponent,
		ResultsSortBarComponent,
		SearchColumnChooserComponent,
		LoadMoreButtonComponent,
		SearchResultTagsComponent,
	],
	templateUrl: './default-search-results.component.html',
	styleUrls: [
		'./default-search-results.component.scss',
		'./default-search-stock.scss',
		'./default-search-actions.scss',
	],
	host: { '[class]': '"nx-search--" + definition().id' },
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefaultSearchResultsComponent {
	readonly definition = input<CompiledSearchDefinition>(REPOSITORY_SEARCH.default);
	readonly viewComponents = computed(() => {
		const components = searchViewComponents(this.definition(), this.displayMode());
		// An empty list declaration keeps the stock presentation, just like an empty grid declaration.
		return this.displayMode() === 'list' && !components.item
			? searchViewComponents(REPOSITORY_SEARCH.default, 'list')
			: components;
	});
	readonly statePresentation = (row: any) =>
		documentStatePresentation(row.state ?? row.currentLifeCycleState);
	private readonly messages = inject(WebUiMessages);
	private readonly sidebar = inject(SidebarService);
	private readonly coreResultsOptions = inject(CORE_RESULTS_OPTIONS);
	readonly selectionOnly = signal(false);
	readonly displayedRows = computed(() =>
		this.selectionOnly() && this.selectedRows().size
			? [...this.selectedRows().values()]
			: this.rows(),
	);
	readonly quickFilters = signal<Record<string, boolean>>({});
	openSaveAs(): void {
		this.sidebar.selectTab('search');
		this.search.saveAsOpen.set(true);
	}
	/** Stock `nuxeo-saved-search-actions` visibility rules. */
	readonly showSaveAs = computed(
		() => !!this.search.selectedSavedSearch?.() || !!this.search.searchFormDirty?.(),
	);
	readonly showSave = computed(
		() =>
			!!this.search.selectedSavedSearch?.() &&
			!!this.search.searchFormDirty?.() &&
			!!this.search.savedSearchWritable?.(),
	);
	readonly showSavedSearchMenu = computed(
		() => !!this.search.selectedSavedSearch?.() && !!this.search.savedSearchWritable?.(),
	);
	savedSearchAction(action: SavedSearchAction): void {
		this.sidebar.selectTab('search');
		this.search.savedSearchAction?.set(action);
	}
	toggleQuickFilter(key: string): void {
		const values = { ...this.quickFilters(), [key]: !this.quickFilters()[key] };
		this.quickFilters.set(values);
		this.search.searchParameters = { ...this.search.searchParameters, quickFilters: values };
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
	quickFilterKeys(): string[] {
		return Object.keys(this.quickFilters());
	}
	private readonly auth = inject(AuthService);
	private readonly router = inject(Router);
	private readonly route = inject(ActivatedRoute);
	private readonly preferenceUser = this.auth.userInfo()?.id ?? 'anonymous';
	readonly columnVisibility = signal<Record<string, boolean>>({});
	readonly matchingQuerySelected = signal(false);
	readonly selectingQuery = signal(false);
	readonly selectionOutcome = localizedText('');
	readonly excludedResultActions = computed(() =>
		!this.selectedIds().length
			? UNSELECTED_SEARCH_ACTIONS
			: this.matchingQuerySelected()
				? []
				: QUERY_SEARCH_ACTIONS,
	);
	/** The count row never shows select/clear icons: the stock selection bar owns those. */
	readonly resultbarExcludedActions = computed(() => [
		...new Set([
			...this.excludedResultActions(),
			'maretha.toolbar.select-loaded',
			'maretha.toolbar.clear-selection',
		]),
	]);
	readonly rows = signal<readonly any[]>([]);
	readonly selectedRows = signal<ReadonlyMap<string, any>>(new Map());
	readonly displayMode = signal<ResultsProjectionMode>('list');
	readonly sortBy = signal<SearchSortField>('dc:created');
	readonly sortAscending = signal(true);
	/** Stock parity: no sortBy goes on the wire until the user picks a sort; the provider orders. */
	readonly sortTouched = signal(false);
	/** Starts true: the first load is scheduled at construction, so no empty state flashes first. */
	readonly loading = signal(true);
	/** First page of a fresh search in flight: hide stale chrome and show one notice. */
	readonly initialLoading = computed(() => this.loading() && !this.rows().length && !this.error());
	readonly busy = signal(false);
	readonly error = localizedText('');
	readonly hasMore = signal(false);
	readonly total = signal<number | null>(null);
	readonly resultEpoch = signal(0);
	readonly selectedIds = computed(() => [...this.selectedRows().keys()]);
	readonly selectedAll = computed(
		() => this.rows().length > 0 && this.rows().every((row) => this.selectedRows().has(row.uid)),
	);

	readonly columnLayout = signal<readonly ResultsColumnLayout[]>([]);
	readonly resultColumns = computed(() => {
		this.messages.locale();
		return applyResultColumnLayout(
			(this.definition().views.table?.columns ?? []).map((column) => ({
				...column,
				hidden: !(this.columnVisibility()[column.id] ?? !column.hidden),
			})),
			this.columnLayout(),
		);
	});
	private readonly element = inject(ElementRef<HTMLElement>);
	private readonly columnChooser = viewChild(SearchColumnChooserComponent);
	openColumnChooser(): void {
		this.columnChooser()?.open(() =>
			this.element.nativeElement.querySelector('.nx-results-projection__settings-button'),
		);
	}
	resetStockColumns(): void {
		this.columnVisibility.set({});
		this.columnLayout.set([]);
		writeSearchView(this.definition().id, this.preferenceUser, 'default', {
			columns: {},
			columnLayout: [],
		});
	}
	private readonly projectionElement = viewChild(ResultsProjectionComponent, {
		read: ElementRef<HTMLElement>,
	});
	readonly tableWidth = signal(0);
	private readonly observeTableWidth = effect((onCleanup) => {
		const element = this.projectionElement()?.nativeElement;
		if (!element) return;
		const update = () => this.tableWidth.set(element.getBoundingClientRect().width);
		const observer = new ResizeObserver(update);
		observer.observe(element);
		update();
		onCleanup(() => observer.disconnect());
	});
	/** Polymer distributes free space after each column's 150px basis; user widths stay fixed. */
	readonly tableColumns = computed(() => {
		const columns = stockResultColumnWidths(
			this.resultColumns(),
			this.tableWidth(),
			this.definition().views.table?.columnChooser === true,
		);
		return columns.map((column) => ({
			...column,
			...(!column.headerComponent
				? {
						headerComponent: DefaultSearchColumnHeaderComponent,
					}
				: {}),
		}));
	});
	columnLayoutChanged(layout: readonly ResultsColumnLayout[]): void {
		const adjusted = userResultColumnLayout(layout, this.columnLayout(), this.tableColumns());
		this.columnLayout.set(mergeResultColumnLayout(this.columnLayout(), adjusted));
		writeSearchView(this.definition().id, this.preferenceUser, 'default', {
			columnLayout: this.columnLayout(),
		});
	}
	activateResult(row: any): void {
		if (!this.loading() && !this.busy() && !this.selectingQuery())
			void this.router.navigateByUrl(documentUrl(row));
	}
	readonly visibleColumnCount = computed(
		() => this.resultColumns().filter((column) => !column.hidden).length,
	);
	readonly sortOptions = SORT_OPTIONS;
	readonly toolbarContext = computed<SearchResultsToolbarContext>(() => ({
		columns: resultFieldColumns(this.resultColumns()),
		items: this.rows(),
		displayMode: this.displayMode(),
		csvSchemas: this.definition().results.csvSchemas,
		csvSort: { sortBy: this.sortBy(), sortOrder: this.sortAscending() ? 'asc' : 'desc' },
		queryScope: this.appliedScope(),
		queryToken: this.appliedToken(),
		routeToken: this.resultEpoch(),
		document: { repository: 'default' },
		noEdit: false,
		selectedDocuments: [...this.selectedRows().values()],
		busy: this.busy() || this.loading() || this.selectingQuery(),
		setBusy: (value) => this.busy.set(value),
		refresh: async () => this.load(true),
		reportError: (message) => this.error.set(message),
		reportMessage: (key, fallback, values) => this.error.set(messageText(key, fallback, values)),
		loadedCount: this.rows().length,
		totalCount: this.total() ?? this.rows().length,
		allSelected: this.selectedAll(),
		availableCommands: [
			'select-loaded',
			'select-query',
			'clear-selection',
			...searchSelectionCommands(
				[...this.selectedRows().values()],
				false,
				this.coreResultsOptions.bulkEdit,
			),
		],
		workflows: [],
		execute: async (command) => {
			if (this.loading() || this.busy() || this.selectingQuery()) return;
			if (command === 'select-loaded') {
				this.matchingQuerySelected.set(false);
				this.selectRows(this.rows());
			}
			if (command === 'select-query') await this.selectMatchingQuery();
			if (command === 'clear-selection') this.clearSelection();
			if (['clipboard', 'compare', 'trash', 'edit-selection'].includes(command))
				await this.executeSelection(command);
		},
	}));

	private readonly search = inject(DocumentSearchService);
	private readonly actions = inject(SearchSelectionActions);
	private readonly destroyRef = inject(DestroyRef);
	private readonly cancelled = new Subject<void>();
	private readonly selectionCancelled = new Subject<void>();
	private selectionGeneration = 0;
	private readonly confirmedTrashedIds = new Set<string>();
	private readonly appliedScope = signal<ResultsToolbarContext['queryScope']>(undefined);
	private readonly appliedToken = signal<number | undefined>(undefined);
	private requestGeneration = 0;
	private restoreGeneration = 0;
	/** A page provider has been selected while this view was mounted. */
	private hadProvider = false;
	private page = 0;

	/** Shortcut hint in the selection bar; shown until the bar itself is used (focus or shortcut). */
	private readonly shortcut = selectionToolbarShortcut('.default-search-results__selection');
	readonly keyboardHint = this.shortcut.keyboardHint;
	readonly modifierKey = this.shortcut.modifierKey;

	constructor() {
		effect(() => {
			const definition = this.definition();
			const preferences = readSearchView(definition.id, this.preferenceUser, 'default');
			const mode = preferences.displayMode;
			this.displayMode.set(mode && definition.views[mode] ? mode : definition.defaultMode);
			this.columnVisibility.set(preferences.columns ?? {});
			this.columnLayout.set(preferences.columnLayout ?? []);
		});
		(this.search.pageProviderUpdated$ ?? EMPTY)
			.pipe(takeUntilDestroyed())
			.subscribe((key) =>
				this.quickFilters.set({ ...this.search.pageProviders[key]?.quickFilters }),
			);
		// Attach before the drawer can ask for facets: this view's load carries them.
		const detachResultsHost = this.search.attachResultsHost?.();
		this.destroyRef.onDestroy(() => detachResultsHost?.());
		if (!this.search.searchPaneVisibility()) this.search.showSearchPaneVisibility();
		// This view owns the default-search request: each published change to the query is one
		// load. A query selection in flight stops at once: its pages belong to the old query.
		(this.search.searchParametersChanged$ ?? EMPTY).pipe(takeUntilDestroyed()).subscribe(() => {
			this.cancelQuerySelection();
			void this.load(true);
		});
		(this.search.pageProviderChanged$ ?? EMPTY).pipe(takeUntilDestroyed()).subscribe(() => {
			this.cancelQuerySelection();
			const savedSearchId = this.route.snapshot.paramMap.get('savedSearchId');
			if (this.hadProvider && savedSearchId) {
				// A provider picked in the drawer: the saved search the URL names belonged to the
				// previous provider. The route follows; its parameter change loads nothing more.
				void this.router.navigate(['/search/default'], { replaceUrl: true });
				void this.load(true);
				return;
			}
			this.reconcileRoute(savedSearchId, true);
		});
		// The route names the saved search to show. Its first emission is the construction.
		let routed = false;
		this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
			const initial = !routed;
			routed = true;
			this.reconcileRoute(params.get('savedSearchId'), initial);
		});
		this.destroyRef.onDestroy(() => {
			this.cancelQuerySelection();
			this.selectionCancelled.complete();
			this.requestGeneration++;
			this.restoreGeneration++;
			this.cancelled.next();
			this.cancelled.complete();
		});
	}

	setDisplayMode(mode: ResultsProjectionMode): void {
		if (
			!this.definition().views[mode] ||
			mode === this.displayMode() ||
			this.busy() ||
			this.selectingQuery()
		)
			return;
		this.clearSelection();
		this.displayMode.set(mode);
		writeSearchView(this.definition().id, this.preferenceUser, 'default', { displayMode: mode });
	}

	toggleColumn(id: string, visible: boolean): void {
		if (!visible && this.visibleColumnCount() <= 1) return;
		this.columnVisibility.update((columns) => ({ ...columns, [id]: visible }));
		writeSearchView(this.definition().id, this.preferenceUser, 'default', {
			columns: this.columnVisibility(),
		});
	}

	metadataLabel(value: any): string {
		return metadataLabel(value, 'mixed');
	}

	setSort(field: (typeof SORT_OPTIONS)[number]['field']): void {
		if (this.sortBy() === field && this.sortTouched()) return;
		this.sortTouched.set(true);
		this.sortBy.set(field);
		this.sortAscending.set(
			this.sortOptions.find((option) => option.field === field)?.order === 'asc',
		);
		void this.load(true);
	}

	toggleSortOrder(): void {
		this.sortTouched.set(true);
		this.sortAscending.update((value) => !value);
		void this.load(true);
	}

	projectedSortChange(event: { columnId: string; direction: 'asc' | 'desc' | null }): void {
		const fieldsByColumn: Record<string, SearchSortField> = {
			title: 'dc:title',
			modified: 'dc:modified',
			lastContributor: 'dc:lastContributor',
			created: 'dc:created',
			author: 'dc:creator',
			state: 'state',
			nature: 'dc:nature',
			coverage: 'dc:coverage',
		};
		const sortBy =
			event.direction && fieldsByColumn[event.columnId]
				? fieldsByColumn[event.columnId]
				: 'dc:created';
		this.sortTouched.set(true);
		this.sortBy.set(sortBy);
		this.sortAscending.set(event.direction ? event.direction === 'asc' : true);
		void this.load(true);
	}

	projectedSelectionChange(ids: readonly string[]): void {
		if (this.loading() || this.busy() || this.selectingQuery()) return;
		this.matchingQuerySelected.set(false);
		const selected = new Set(ids);
		const rows = new Map(this.selectedRows());
		for (const row of this.rows()) {
			if (selected.has(row.uid)) rows.set(row.uid, row);
			else rows.delete(row.uid);
		}
		this.selectedRows.set(rows);
	}

	async selectMatchingQuery(): Promise<void> {
		const scope = this.appliedScope();
		if (!scope || this.loading() || this.busy() || this.selectingQuery()) return;
		const generation = ++this.selectionGeneration;
		const capturedScope = structuredClone(scope);
		const sortBy = this.sortBy();
		const ascending = this.sortAscending();
		this.clearSelection();
		this.selectingQuery.set(true);
		let page = 0;
		let next = true;
		let capped = false;
		let partialReason = '';
		try {
			while (
				next &&
				this.selectedRows().size < QUERY_SELECTION_LIMIT &&
				page < QUERY_SELECTION_MAX_PAGES
			) {
				const result: any = await firstValueFrom(
					this.search
						.loadAppliedQuery(
							capturedScope,
							page,
							this.definition().request.pageSize,
							[sortBy],
							ascending,
						)
						.pipe(takeUntil(this.selectionCancelled)),
				);
				if (generation !== this.selectionGeneration || this.destroyRef.destroyed) return;
				if (!Array.isArray(result.entries)) {
					partialReason = 'invalid';
					break;
				}
				const selected = new Map(this.selectedRows());
				const before = selected.size;
				for (const row of result.entries) {
					if (typeof row?.uid !== 'string' || !row.uid || selected.has(row.uid)) continue;
					if (selected.size >= QUERY_SELECTION_LIMIT) {
						capped = true;
						break;
					}
					selected.set(row.uid, row);
				}
				this.selectedRows.set(selected);
				this.selectionOutcome.set(
					messageText(
						'selection.selecting',
						'Selecting matching documents\u2026 {count, number} selected.',
						{ count: selected.size },
					),
				);
				next = result.isNextPageAvailable === true;
				if (next && selected.size === before) {
					partialReason = 'advance';
					break;
				}
				page++;
			}
			if (generation !== this.selectionGeneration) return;
			if (!partialReason && next && page >= QUERY_SELECTION_MAX_PAGES) partialReason = 'limit';
			capped ||= this.selectedRows().size >= QUERY_SELECTION_LIMIT && next;
			this.matchingQuerySelected.set(!partialReason && !capped && !next);
			this.selectionOutcome.set(
				partialReason
					? messageText(
							'selection.partial',
							'{count, plural, one {Only # document was selected.} other {Only # documents were selected.}} {reason, select, invalid {The search provider returned an invalid result page.} empty {The search provider reported another page without returning documents.} duplicate {The search provider repeated documents instead of advancing to a new page.} limit {The selection stopped after {pages, number} pages.} other {The search provider did not advance to a new page.}} You can run an action on this partial selection or retry.',
							{
								count: this.selectedRows().size,
								reason: partialReason,
								pages: QUERY_SELECTION_MAX_PAGES,
							},
						)
					: capped
						? messageText(
								'selection.capped',
								'{count, plural, one {Selected the first # matching document.} other {Selected the first # matching documents.}} Refine the filters before running an action on more results.',
								{ count: QUERY_SELECTION_LIMIT },
							)
						: messageText(
								'selection.complete',
								'{count, plural, one {Selected the matching document.} other {Selected all # matching documents.}}',
								{ count: this.selectedRows().size },
							),
			);
		} catch {
			if (generation === this.selectionGeneration && !this.destroyRef.destroyed)
				this.selectionOutcome.set(
					messageText(
						'selection.failed',
						'{count, plural, one {Only # document was selected before the query failed.} other {Only # documents were selected before the query failed.}} You can run an action on this partial selection or retry.',
						{ count: this.selectedRows().size },
					),
				);
		} finally {
			if (generation === this.selectionGeneration) this.selectingQuery.set(false);
		}
	}

	stopSelectingQuery(): void {
		if (!this.selectingQuery()) return;
		this.cancelQuerySelection();
		this.selectionOutcome.set(
			messageText(
				'selection.stopped',
				'{count, plural, one {Selection stopped after # document.} other {Selection stopped after # documents.}}',
				{ count: this.selectedRows().size },
			),
		);
	}

	private cancelQuerySelection(): void {
		this.selectionGeneration++;
		this.selectionCancelled.next();
		this.selectingQuery.set(false);
		this.matchingQuerySelected.set(false);
	}

	more(): void {
		if (this.hasMore() && !this.loading() && !this.busy() && !this.selectingQuery())
			void this.load(false);
	}

	retry(): void {
		if (!this.loading() && !this.busy() && !this.selectingQuery())
			void this.load(this.rows().length === 0);
	}

	modified(row: any): string | number | Date | null {
		const value = row?.properties?.['dc:modified'];
		return value instanceof Date || typeof value === 'string' || typeof value === 'number'
			? value
			: null;
	}

	lastContributor(row: any): string {
		return this.metadataLabel(row?.properties?.['dc:lastContributor']);
	}

	/** Keep stars synchronized when a list action commits and the user changes view. */
	private readonly favoriteChanges = followFavoriteChanges(this.rows);

	/**
	 * Aligns the search state with the saved search the URL names, then loads once. `initial` is
	 * the first alignment for a provider: it loads even when the state already matches the URL.
	 * Until a page provider is selected nothing loads; its selection restarts the alignment.
	 */
	private reconcileRoute(savedSearchId: string | null, initial: boolean): void {
		if (!this.search.currentPageProviderKey) return;
		this.hadProvider = true;
		const selectedId = this.search.selectedSavedSearch?.()?.id ?? null;
		if (savedSearchId === selectedId) {
			if (initial) void this.load(true);
			return;
		}
		if (!savedSearchId) {
			// Publishing the cleared parameters is the one load.
			this.search.applySavedSearch?.(undefined);
			return;
		}
		this.restoreSavedSearch(savedSearchId);
	}

	/** Applies the saved search the URL names; publishing its criteria is the one load. */
	private restoreSavedSearch(savedSearchId: string): void {
		const generation = ++this.restoreGeneration;
		const request = this.search.getSavedSearch?.(savedSearchId);
		if (!request) {
			void this.load(true);
			return;
		}
		this.loading.set(true);
		request.pipe(takeUntil(this.cancelled)).subscribe({
			next: (saved) => {
				if (generation !== this.restoreGeneration || this.destroyRef.destroyed) return;
				this.search.applySavedSearch?.(saved);
			},
			error: () => {
				// An unknown or unreadable saved search: the current criteria still load.
				if (generation !== this.restoreGeneration || this.destroyRef.destroyed) return;
				void this.load(true);
			},
		});
	}

	private async load(reset: boolean): Promise<void> {
		if ((!reset && this.loading()) || this.busy()) return;
		const request = ++this.requestGeneration;
		const page = reset ? 0 : this.page;
		if (reset) {
			this.cancelQuerySelection();
			this.cancelled.next();
			this.rows.set([]);
			this.clearSelection();
			this.page = 0;
			this.hasMore.set(false);
			this.total.set(null);
			this.appliedScope.set(undefined);
			this.appliedToken.set(undefined);
			this.resultEpoch.update((epoch) => epoch + 1);
		}
		this.loading.set(true);
		this.error.set('');
		try {
			const result: any = await firstValueFrom(
				this.search
					.loadMore(
						page,
						this.definition().request.pageSize,
						this.sortTouched() ? [this.sortBy()] : [],
						this.sortAscending(),
						true,
					)
					.pipe(takeUntil(this.cancelled)),
			);
			if (request !== this.requestGeneration || this.destroyRef.destroyed) return;
			const received = Array.isArray(result?.entries) ? result.entries : [];
			const known = new Set(reset ? [] : this.rows().map((row) => row.uid));
			const entries = received.filter(
				(row: any) =>
					typeof row?.uid === 'string' &&
					!known.has(row.uid) &&
					!this.confirmedTrashedIds.has(row.uid),
			);
			this.rows.set(reset ? entries : [...this.rows(), ...entries]);
			this.page = page + 1;
			this.hasMore.set(result?.isNextPageAvailable === true && entries.length > 0);
			this.total.set(
				typeof result?.totalSize === 'number'
					? result.totalSize
					: typeof result?.resultsCount === 'number'
						? result.resultsCount
						: null,
			);
			this.appliedScope.set(this.search.getCurrentQueryScope());
			this.appliedToken.set(this.search.getCurrentQueryToken());
			this.resultEpoch.update((epoch) => epoch + 1);
		} catch {
			if (request === this.requestGeneration && !this.destroyRef.destroyed)
				this.error.set(
					messageText(
						'app.state.search-failed-check-the-filters-and-retry-f73bdd',
						'Search failed. Check the filters and retry.',
					),
				);
		} finally {
			if (request === this.requestGeneration) this.loading.set(false);
		}
	}

	private selectRows(rows: readonly any[]): void {
		this.selectedRows.set(
			new Map(rows.filter((row) => typeof row?.uid === 'string').map((row) => [row.uid, row])),
		);
	}

	thumbnail(row: any): string {
		const thumbnail = row.contextParameters?.thumbnail;
		return typeof thumbnail === 'string' ? thumbnail : (thumbnail?.url ?? '');
	}

	private async executeSelection(command: string): Promise<void> {
		const generation = this.requestGeneration;
		const selection = this.selectedIds().join(',');
		const removed = await this.actions.execute(
			command,
			this.toolbarContext(),
			() =>
				!this.destroyRef.destroyed &&
				generation === this.requestGeneration &&
				selection === this.selectedIds().join(','),
		);
		if (!removed.length) return;
		for (const uid of removed) this.confirmedTrashedIds.add(uid);
		this.rows.update((rows) => rows.filter((row) => !this.confirmedTrashedIds.has(row.uid)));
		this.total.update((total) => (total === null ? null : Math.max(0, total - removed.length)));
		this.clearSelection();
		this.resultEpoch.update((epoch) => epoch + 1);
	}

	clearSelection(): void {
		this.matchingQuerySelected.set(false);
		this.selectionOutcome.set('');
		this.selectedRows.set(new Map());
	}
}
