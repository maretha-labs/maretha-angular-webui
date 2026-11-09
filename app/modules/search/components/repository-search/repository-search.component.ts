import { documentStatePresentation } from 'app/helpers/document-type-presentation';
import { selectionToolbarShortcut } from 'app/helpers/selection-toolbar-shortcut';
import { CORE_RESULTS_OPTIONS } from 'app/helpers/core-results-options';
import { RepositorySearchHosts } from '../../helpers/repository-search-hosts.service';
import { JustifiedResultsDirective } from './justified-results.directive';
import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { builtinAggregationLabel } from 'app/helpers/builtin-aggregation-labels';
import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	ElementRef,
	inject,
	input,
	PendingTasks,
	signal,
	untracked,
	viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import {
	DocumentActionContext,
	GuardedView,
	WebUiMessagePipe,
	WebUiSlotComponent,
	ResultsProjectionComponent,
	ResultsPagingSettings,
	ResultsColumnLayout,
	ResultsProjectionTemplateDirective,
	WebUiIconComponent,
	type ApplicationUser,
	type ResultsProjectionMode,
} from '@maretha/webui-sdk';
import {
	DEFAULT_NXQL,
	REPOSITORY_SEARCH_SORTS,
	REPOSITORY_SEARCH_SORT_FIELDS,
	RepositorySearchParameters,
	RepositorySearchService,
	RepositorySavedSearch,
} from '../../helpers/repository-search.service';
import { LazyLoadDirective } from 'app/directives/lazy-load.directive';
import { DocumentLinkPipe, documentUrl } from 'app/helpers/document-route';
import {
	SearchSelectionActions,
	SearchResultsToolbarContext,
	UNSELECTED_SEARCH_ACTIONS,
	QUERY_SEARCH_ACTIONS,
	searchSelectionCommands,
} from '../../helpers/search-selection-actions.service';
import { contributorLabel } from '../../helpers/repository-search-columns';
import { readSearchView, writeSearchView } from '../../helpers/search-view-preferences';
import { AssetsSearchQueueService } from '../../helpers/assets-search-queue.service';
import { DocumentGridThumbnailComponent } from 'app/modules/explorer/components/document-grid-thumbnail/document-grid-thumbnail.component';
import {
	ResultsSortBarComponent,
	ResultsSortOption,
} from 'app/modules/explorer/components/results-sort-bar/results-sort-bar.component';
import { followFavoriteChanges } from 'app/modules/explorer/helpers/favorite-changes.service';
import type { CompiledSearchDefinition } from '../../helpers/repository-search-definitions';
import { SearchFormOutletComponent } from '../search-form/search-form-outlet.component';
import { searchViewComponents } from '../../helpers/search-view-components';
import {
	stockResultColumnWidths,
	userResultColumnLayout,
} from '../../helpers/stock-result-columns';
import { AssetsSearchTileComponent } from './assets-search-tile.component';
import { SearchColumnChooserComponent } from 'app/modules/shared/components/search-column-chooser/search-column-chooser.component';
import { SearchResultTagsComponent } from '../search-result-tags/search-result-tags.component';
import {
	applyResultColumnLayout,
	mergeResultColumnLayout,
	resultFieldColumns,
} from '../../../explorer/helpers/scoped-result-columns';

interface SearchContext extends DocumentActionContext {
	readonly user: ApplicationUser | null;
}
const facetLabels: Record<string, { label: string; labelKey: string }> = {
	dc_creator_agg: { label: 'Authors', labelKey: 'defaultSearch.authors' },
	common_size_agg: { label: 'Size', labelKey: 'defaultSearch.size' },
	system_primaryType_agg: { label: 'Asset type', labelKey: 'assetsSearch.assetType' },
	system_mimetype_agg: { label: 'Format', labelKey: 'app.columns.format' },
	asset_width_agg: { label: 'Width', labelKey: 'videoViewLayout.width' },
	asset_height_agg: { label: 'Height', labelKey: 'videoViewLayout.height' },
	color_profile_agg: { label: 'Color profile', labelKey: 'assetsSearch.colorProfile' },
	color_depth_agg: { label: 'Color depth', labelKey: 'app.search.color-depth' },
	video_duration_agg: { label: 'Duration', labelKey: 'videoViewLayout.duration' },
};
const QUERY_SELECTION_LIMIT = 500;
const QUERY_SELECTION_MAX_PAGES = 25;
const MODE_BUTTONS = [
	{
		mode: 'grid',
		icon: 'nuxeo:view-thumbnails',
		label: messageText('displayModeButton.display.grid', 'Switch to Grid View'),
		title: messageText('app.modules.repository-search.grid-view-906aa6', 'Grid View'),
	},
	{
		mode: 'table',
		icon: 'nuxeo:view-list',
		label: messageText('displayModeButton.display.table', 'Switch to Table View'),
		title: messageText('app.modules.repository-search.table-view-f3c31c', 'Table View'),
	},
	{
		mode: 'list',
		icon: 'nuxeo:view-headline',
		label: messageText(
			'app.modules.repository-search.switch-to-list-view-c12585',
			'Switch to List View',
		),
		title: messageText('app.modules.repository-search.list-view-8724fc', 'List View'),
	},
] as const;
@Component({
	selector: 'nx-repository-search',
	imports: [
		JustifiedResultsDirective,
		UserTagComponent,
		WebUiNumberPipe,
		SearchFormOutletComponent,
		AssetsSearchTileComponent,
		SearchColumnChooserComponent,
		FormsModule,
		CdkTrapFocus,
		LazyLoadDirective,
		RouterLink,
		WebUiMessagePipe,
		WebUiSlotComponent,
		ResultsProjectionComponent,
		ResultsProjectionTemplateDirective,
		WebUiIconComponent,
		DocumentLinkPipe,
		DocumentGridThumbnailComponent,
		ResultsSortBarComponent,
		SearchResultTagsComponent,
	],
	templateUrl: './repository-search.component.html',
	styleUrls: ['./repository-search.component.scss', './search-layout.scss'],
	host: {
		'[class]': '"nx-search--" + definition().id',
		'[class.stock-layout]': 'stockResults()',
		'[class.justified-grid]': 'definition().views.grid?.layout === "justified"',
		'[class.stock-results]': 'stockResults()',
		'[class.drawer-only]': 'drawerOnly()',
		'[class.inline-form]': 'definition().layout.form === "inline"',
	},
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepositorySearchComponent implements GuardedView {
	readonly statePresentation = (row: any) =>
		documentStatePresentation(row.state ?? row.currentLifeCycleState);
	readonly drawerOnly = input(false);
	private readonly coreResultsOptions = inject(CORE_RESULTS_OPTIONS);
	private readonly hosts = inject(RepositorySearchHosts);
	private readonly uiRepositorySearchComponentConfirmations = injectUiMessages(RuntimeUiMessages);

	readonly matchingQuerySelected = signal(false);
	readonly excludedResultActions = computed(() =>
		!this.selectedIds().length
			? UNSELECTED_SEARCH_ACTIONS
			: this.matchingQuerySelected()
				? []
				: QUERY_SEARCH_ACTIONS,
	);
	/** Default search results: select-loaded / clear live in the blue selection bar, not the result row. */
	readonly resultbarExcludedActions = computed(() => [
		...new Set([
			...this.excludedResultActions(),
			'maretha.toolbar.select-loaded',
			'maretha.toolbar.clear-selection',
		]),
	]);
	private readonly actions = inject(SearchSelectionActions);
	private readonly assetsQueue = inject(AssetsSearchQueueService);
	private readonly paging = inject(ResultsPagingSettings);
	private readonly confirmedTrashedIds = new Set<string>();
	readonly context = input.required<SearchContext>();
	readonly definition = input.required<CompiledSearchDefinition>();
	readonly modeButtons = computed(() =>
		MODE_BUTTONS.filter(({ mode }) => this.definition().views[mode]),
	);
	readonly resultComponents = computed(() =>
		searchViewComponents(this.definition(), this.displayMode()),
	);
	readonly formInputs = { search: this };
	readonly usesAssetTiles = computed(() => this.definition().views.grid?.item === 'assetTile');
	/** Stock `nuxeo-results` searches: Expired and Assets. */
	readonly stockResults = computed(() => this.definition().layout.results === 'stock');
	readonly allowed = computed(
		() =>
			!!this.context().user &&
			(this.definition().access !== 'administrator' ||
				this.context().user?.isAdministrator === true),
	);
	private readonly scope = computed(() =>
		JSON.stringify([
			this.definition().id,
			this.context().user?.id,
			this.context().user?.isAdministrator,
			this.context().document?.['repository'] ?? 'default',
		]),
	);
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly routeQuery = toSignal(this.route.queryParamMap, {
		initialValue: this.route.snapshot.queryParamMap,
	});
	/**
	 * The drawer's own form keeps the URL it opened with: the routed results page follows the URL,
	 * and takes the drawer's place as soon as it is mounted.
	 */
	private readonly drawerQuery = this.route.snapshot.queryParamMap;
	private readonly query = computed(() => {
		if (this.definition().form.criteria !== 'memory')
			return this.drawerOnly() ? this.drawerQuery : this.routeQuery();
		// A `memory` search keeps stock's bare address: the session holds its applied criteria. The
		// drawer's own form opens on them and, like the URL snapshot, never follows its submissions.
		const scope = this.scope();
		return this.drawerOnly()
			? untracked(() => this.hosts.criteria(scope))
			: this.hosts.criteria(scope);
	});
	readonly appliedText = computed(() =>
		this.definition().request.text ? (this.query().get('q') ?? '') : '',
	);
	private readonly search = inject(RepositorySearchService);
	private readonly tasks = inject(PendingTasks);
	private readonly destroyRef = inject(DestroyRef);
	private readonly cancelled = new Subject<void>();
	private readonly selectionCancelled = new Subject<void>();
	private generation = 0;
	private selectionGeneration = 0;
	private page = 0;
	private applied: RepositorySearchParameters = {
		text: '',
		path: '/',
		nxql: DEFAULT_NXQL,
		expiredAt: '',
		facets: {},
	};
	// The input representation is retained separately from the canonical ISO cutoff.
	// A datetime-local control has no timezone suffix, while the provider needs one.
	private appliedExpiredAtInput = '';
	private signature = '';
	private criteriaSignature = '';
	readonly rows = signal<any[]>([]);
	readonly aggregations = signal<Record<string, any>>({});
	readonly selection = signal<ReadonlySet<string>>(new Set());
	readonly selectedIds = computed(() => [...this.selection()]);
	/** Default-search "Display selection": the list shows only the selected rows. */
	readonly selectionOnly = signal(false);
	readonly displayedRows = computed(() =>
		this.selectionOnly() && this.selectedRows().size
			? [...this.selectedRows().values()]
			: this.rows(),
	);
	/** Shortcut hint in the selection bar; shown until the bar itself is used (focus or shortcut). */
	private readonly shortcut = selectionToolbarShortcut('.stock-selection');
	readonly keyboardHint = this.shortcut.keyboardHint;
	readonly modifierKey = this.shortcut.modifierKey;
	clearSelectionView(): void {
		this.clearSelection();
		this.selectionOnly.set(false);
	}
	/** "Save As" only when there is something to save: a filled form, a quick filter, or a saved
	 *  search in hand. */
	canSaveSearch(): boolean {
		if (!this.definition().savedSearches) return false;
		return (
			!!this.selectedSavedSearch ||
			!!this.text.trim() ||
			this.quickFilters.length > 0 ||
			Object.values(this.facets).some((values) => values.length > 0) ||
			(this.definition().request.path && !!this.path && this.path !== '/') ||
			(!!this.definition().request.nxql && this.nxql !== DEFAULT_NXQL)
		);
	}
	/** Stock search form `dirty`: the Expired and Assets Reset stays grey and disabled until the
	 *  form holds input, then turns blue. */
	hasFormInput(): boolean {
		return (
			!!this.selectedSavedSearch ||
			!!this.text ||
			(this.definition().request.path && !!this.path && this.path !== '/') ||
			Object.values(this.facets).some((values) => values.length > 0)
		);
	}
	readonly resultEpoch = signal(0);
	private readonly selectedRows = signal<ReadonlyMap<string, any>>(new Map());
	private readonly hasQuery = signal(false);
	readonly loading = signal(false);
	readonly busy = signal(false);
	readonly selectingQuery = signal(false);
	readonly selectionProgress = signal({ selected: 0, total: null as number | null });
	readonly selectionOutcome = localizedText('');
	readonly error = localizedText('');
	readonly hasMore = signal(false);
	readonly total = signal<number | null>(null);
	readonly filtersOpen = signal(true);
	readonly autoSearch = signal(true);
	readonly assetFacetExpanded = signal<ReadonlySet<string>>(new Set());
	private readonly expandedBucketLists = signal<ReadonlySet<string>>(new Set());
	private autoSearchTimer?: ReturnType<typeof setTimeout>;
	readonly displayMode = signal<ResultsProjectionMode>('table');
	readonly savedSearches = signal<RepositorySavedSearch[]>([]);
	readonly quickFilterOptions = signal<{ name: string; active: boolean }[]>([]);
	quickFilters: string[] = [];
	readonly savingSearch = signal(false);
	readonly savedSearchError = localizedText('');
	readonly savedSearchStatus = localizedText('');
	readonly saveDialog = signal(false);
	selectedSavedSearch = '';
	savedSearchTitle = '';
	private savedSearchScope = '';
	private displayScope = '';

	readonly sortOptions = REPOSITORY_SEARCH_SORTS;
	/**
	 * The grid and list sort bar. As stock nuxeo-sort-select, no sort applied shows the search's
	 * default sort field ascending, although the server's order is what the rows follow.
	 */
	readonly sortBarOptions: readonly ResultsSortOption[] = REPOSITORY_SEARCH_SORTS;
	sortBy = '';
	sortOrder: 'asc' | 'desc' = 'asc';
	text = '';
	path = '/';
	nxql = DEFAULT_NXQL;
	expiredAt = '';
	facets: Record<string, string[]> = {};
	activeFacetChips(): { key: string; value: string; label: string }[] {
		return Object.entries(this.applied.facets).flatMap(([key, values]) =>
			values.map((value) => ({
				key,
				value,
				label: this.uiRepositorySearchComponentConfirmations.format(
					'app.search.facet-value',
					{ label: this.labels[key] ?? key, value },
					'{label}: {value}',
				),
			})),
		);
	}
	readonly columnLayout = signal<readonly ResultsColumnLayout[]>([]);
	readonly columnVisibility = signal<Record<string, boolean>>({});
	readonly columnChoices = computed(() => this.definition().views.table?.columns ?? []);
	readonly hasColumnChooser = computed(() => this.definition().views.table?.columnChooser === true);
	readonly resultColumns = computed(() =>
		applyResultColumnLayout(
			this.columnChoices().map((column) => ({
				...column,
				hidden: this.hasColumnChooser()
					? !(this.columnVisibility()[column.id] ?? !column.hidden)
					: column.hidden,
			})),
			this.columnLayout(),
		),
	);
	private readonly projectionElement = viewChild(ResultsProjectionComponent, {
		read: ElementRef<HTMLElement>,
	});
	readonly tableWidth = signal(0);
	private readonly observeTableWidth = effect((onCleanup) => {
		if (this.definition().layout.form !== 'inline') return;
		const element = this.projectionElement()?.nativeElement;
		if (!element) return;
		const update = () => this.tableWidth.set(element.getBoundingClientRect().width);
		const observer = new ResizeObserver(update);
		observer.observe(element);
		update();
		onCleanup(() => observer.disconnect());
	});
	readonly tableColumns = computed(() =>
		this.definition().layout.form === 'inline'
			? stockResultColumnWidths(this.resultColumns(), this.tableWidth(), this.hasColumnChooser())
			: this.resultColumns(),
	);
	private readonly columnChooserDialog = viewChild.required(SearchColumnChooserComponent);
	private readonly projectionHost = viewChild.required(ResultsProjectionComponent, {
		read: ElementRef<HTMLElement>,
	});
	/** The gear sits in the projection's header, so both the dialog and the grid exist when it is clicked. */
	openColumnChooser(): void {
		this.columnChooserDialog().open(() =>
			this.projectionHost().nativeElement.querySelector('.nx-results-projection__settings-button'),
		);
	}
	columnVisible(id: string): boolean {
		return this.resultColumns().some((column) => column.id === id && !column.hidden);
	}
	toggleColumn(id: string): void {
		if (!this.hasColumnChooser() || !this.columnChoices().some((column) => column.id === id))
			return;
		// Keep at least one data column so the table remains navigable.
		if (
			this.columnVisible(id) &&
			this.resultColumns().filter((column) => !column.hidden).length === 1
		)
			return;
		this.columnVisibility.update((columns) => ({ ...columns, [id]: !this.columnVisible(id) }));
		writeSearchView(
			this.definition().id,
			this.context().user?.id ?? 'anonymous',
			String(this.context().document?.['repository'] ?? 'default'),
			{ columns: this.columnVisibility() },
		);
	}
	resetStockColumns(): void {
		if (!this.hasColumnChooser()) return;
		this.columnVisibility.set({});
		this.columnLayout.set([]);
		writeSearchView(
			this.definition().id,
			this.context().user?.id ?? 'anonymous',
			String(this.context().document?.['repository'] ?? 'default'),
			{ columns: {}, columnLayout: [] },
		);
	}
	columnLayoutChanged(layout: readonly ResultsColumnLayout[]): void {
		const adjusted =
			this.definition().layout.form === 'inline'
				? userResultColumnLayout(layout, this.columnLayout(), this.tableColumns())
				: layout;
		this.columnLayout.set(mergeResultColumnLayout(this.columnLayout(), adjusted));
		writeSearchView(
			this.definition().id,
			this.context().user?.id ?? 'anonymous',
			String(this.context().document?.['repository'] ?? 'default'),
			{ columnLayout: this.columnLayout() },
		);
	}
	activateResult(row: any): void {
		if (this.allowed() && !this.loading() && !this.busy() && !this.selectingQuery())
			void this.router.navigateByUrl(documentUrl(row));
	}
	activateAsset(row: any, event?: Event, toggle?: () => void): void {
		if (
			event?.target instanceof Element &&
			event.target.closest('button,a,input,select,textarea,label')
		)
			return;
		event?.preventDefault();
		event?.stopPropagation();
		if (
			!this.allowed() ||
			this.loading() ||
			this.busy() ||
			this.selectingQuery() ||
			!this.rows().includes(row)
		)
			return;
		if (this.usesAssetTiles() && this.displayMode() === 'grid' && this.selectedIds().length) {
			if (toggle) toggle();
			else
				this.projectedSelectionChange(
					this.selection().has(row.uid)
						? this.selectedIds().filter((id) => id !== row.uid)
						: [...this.selectedIds(), row.uid],
				);
		} else this.activateResult(row);
	}
	get labels(): Record<string, string> {
		return Object.fromEntries(
			Object.entries(facetLabels).map(([name, message]) => [
				name,
				this.uiRepositorySearchComponentConfirmations.text(message.labelKey, message.label),
			]),
		);
	}
	get assetLabels(): Record<string, string> {
		return Object.fromEntries(
			Object.entries({
				system_primaryType_agg: ['assetsSearch.assetType', 'Asset Type'],
				system_mimetype_agg: ['assetsSearch.assetFormat', 'Asset Format'],
				asset_width_agg: ['assetsSearch.assetWidth', 'Asset Width'],
				asset_height_agg: ['assetsSearch.assetHeight', 'Asset Height'],
				color_profile_agg: ['assetsSearch.colorProfile', 'Color Profile'],
				color_depth_agg: ['assetsSearch.colorDepth', 'Color Depth per Channel'],
				video_duration_agg: ['assetsSearch.videoDuration', 'Video Duration'],
				common_size_agg: ['defaultSearch.size', 'Size'],
			}).map(([name, [key, fallback]]) => [
				name,
				this.uiRepositorySearchComponentConfirmations.text(key, fallback),
			]),
		);
	}
	readonly selectedAll = computed(
		() => this.rows().length > 0 && this.rows().every((row) => this.selection().has(row.uid)),
	);
	readonly toolbarContext = computed<SearchResultsToolbarContext>(() => ({
		csvSort: this.applied.sortBy
			? { sortBy: this.applied.sortBy, sortOrder: this.applied.sortOrder ?? 'asc' }
			: undefined,
		csvSchemas: [...this.definition().results.csvSchemas],
		columns: resultFieldColumns(this.resultColumns()),
		items: this.rows(),
		displayMode: this.displayMode(),
		queryScope:
			this.hasQuery() && this.allowed() && !this.loading() && !this.error()
				? this.search.queryScope(
						this.definition(),
						String(this.context().document?.['repository'] ?? 'default'),
						this.applied,
					)
				: undefined,
		document: { repository: this.context().document?.['repository'] ?? 'default' },
		noEdit: this.context().noEdit,
		selectedDocuments: [...this.selectedRows().values()],
		busy: this.busy() || this.loading() || this.selectingQuery(),
		setBusy: (value) => this.busy.set(value),
		refresh: async () => {
			if (this.hasQuery()) await this.load(true);
		},
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
				this.context().noEdit,
				this.coreResultsOptions.bulkEdit,
			),
		],
		workflows: [],
		execute: async (command) => {
			if (!this.busy() && !this.loading() && !this.selectingQuery()) {
				if (command === 'select-loaded') this.setSelectedRows(this.rows());
				if (command === 'select-query') await this.selectMatchingQuery();
				if (command === 'clear-selection') this.clearSelection();
				if (['clipboard', 'compare', 'trash', 'edit-selection'].includes(command))
					await this.executeSelection(command);
			}
		},
	}));
	constructor() {
		effect((cleanup) => {
			if (!this.drawerOnly()) cleanup(this.hosts.register(this.definition().id, this));
		});
		this.destroyRef.onDestroy(() => {
			this.cancelAutoSearch();
			this.generation++;
			this.selectionGeneration++;
			this.cancelled.next();
			this.cancelled.complete();
			this.selectionCancelled.next();
			this.selectionCancelled.complete();
		});
		effect(() => this.tasks.run(() => this.syncQuery()));
	}
	/** Synchronize immediately after accepted navigation, regardless of effect scheduling. */
	private async syncQuery(runExplicit = false): Promise<void> {
		const scope = this.scope();
		const query = this.query();
		const definition = this.definition();
		const request = definition.request;
		const criteriaSignature = JSON.stringify([
			scope,
			request.text ? query.get('q') : null,
			request.path ? query.get('path') : null,
			request.nxql ? query.get('nxql') : null,
			request.expiredAt ? query.get('expiredAt') : null,
			definition.facets.length ? query.get('facets') : null,
			definition.quickFilters ? query.get('quickFilters') : null,
		]);
		const signature = JSON.stringify([
			criteriaSignature,
			query.get('sortBy'),
			query.get('sortOrder'),
		]);
		if (signature === this.signature) {
			if (runExplicit) await this.load(true);
			return;
		}
		this.signature = signature;
		const hydrateDraft =
			definition.form.submission !== 'explicit' || criteriaSignature !== this.criteriaSignature;
		this.criteriaSignature = criteriaSignature;
		this.cancelAutoSearch();
		const restoredViewState =
			scope !== this.displayScope && this.definition().queue
				? this.assetsQueue.consumeViewState(
						this.context().user?.id ?? '',
						String(this.context().document?.['repository'] ?? 'default'),
						this.router.getCurrentNavigation()?.finalUrl?.toString() ?? this.router.url,
					)
				: undefined;
		let submittedUrl: string | undefined;
		if (scope !== this.displayScope) {
			this.displayScope = scope;
			this.autoSearch.set(
				restoredViewState?.autoSearch ?? definition.form.submission !== 'explicit',
			);
			const handedOff = this.drawerOnly()
				? undefined
				: this.hosts.takeHandOff(definition.id, scope);
			submittedUrl = handedOff?.submittedUrl;
			this.assetFacetExpanded.set(handedOff?.facetsExpanded ?? new Set());
			this.expandedBucketLists.set(handedOff?.bucketListsExpanded ?? new Set());
			const preferences = readSearchView(
				this.definition().id,
				this.context().user?.id ?? 'anonymous',
				String(this.context().document?.['repository'] ?? 'default'),
			);
			this.columnVisibility.set(preferences.columns ?? {});
			this.columnLayout.set(preferences.columnLayout ?? []);
			const savedMode = preferences.displayMode;
			this.displayMode.set(
				savedMode && definition.views[savedMode] ? savedMode : definition.defaultMode,
			);
		}
		if (scope !== this.savedSearchScope) {
			this.savedSearchScope = scope;
			this.selectedSavedSearch = restoredViewState?.selectedSavedSearch ?? '';
			this.savedSearches.set([]);
			this.savedSearchError.set('');
			this.savedSearchStatus.set('');
			this.saveDialog.set(false);
			if (this.allowed() && this.definition().savedSearches) void this.loadSavedSearches();
		}

		const quickFilters = ((definition.quickFilters ? query.get('quickFilters') : null) ?? '')
			.split(',')
			.filter(Boolean);
		const text = this.appliedText();
		const path = (request.path ? query.get('path') : null) ?? '/';
		const nxql = (request.nxql ? query.get('nxql') : null) ?? DEFAULT_NXQL;
		const sortBy = query.get('sortBy') ?? '';
		this.sortBy = REPOSITORY_SEARCH_SORT_FIELDS.includes(sortBy) ? sortBy : '';
		this.sortOrder = query.get('sortOrder') === 'desc' ? 'desc' : 'asc';
		const rawExpiredAt = (request.expiredAt ? query.get('expiredAt') : null) ?? '';
		const expiredAt = rawExpiredAt && !Number.isNaN(Date.parse(rawExpiredAt)) ? rawExpiredAt : '';
		const facets: Record<string, string[]> = {};
		try {
			const parsed: unknown = JSON.parse(
				(definition.facets.length ? query.get('facets') : null) ?? '{}',
			);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
				for (const key of definition.facets) {
					const values = (parsed as Record<string, unknown>)[key];
					if (Array.isArray(values) && values.every((value) => typeof value === 'string'))
						facets[key] = values;
				}
		} catch {
			/* Invalid optional filters are ignored; never forwarded as executable input. */
		}
		if (hydrateDraft) {
			this.quickFilters = [...quickFilters];
			this.text = text;
			this.path = path;
			this.nxql = nxql;
			this.expiredAt = expiredAt;
			this.facets = structuredClone(facets);
		}
		this.applied = {
			quickFilters,
			text,
			path,
			nxql,
			facets,
			sortBy: this.sortBy,
			sortOrder: this.sortOrder,
			expiredAt: expiredAt
				? new Date(expiredAt).toISOString()
				: hydrateDraft
					? new Date().toISOString()
					: this.applied.expiredAt,
		};
		this.appliedExpiredAtInput = expiredAt;
		// Explicit forms hydrate URLs without running them. A drawer's Search carries a one-use
		// submission to its paired page; reloading or visiting that URL cannot replay the action.
		const submitted =
			submittedUrl ===
			(this.router.getCurrentNavigation()?.finalUrl?.toString() ?? this.router.url);
		if (
			(definition.form.submission !== 'explicit' || runExplicit || submitted) &&
			(definition.form.loadDrawer || !this.drawerOnly())
		)
			await this.load(true);
		else this.clearResults();
	}
	async submit(text = this.text): Promise<void> {
		this.cancelAutoSearch();
		// The Assets/Expired filter form stays live while results load: its Reset or Search replaces
		// the pending search (`load(true)` cancels it) instead of being dropped.
		if (
			this.busy() ||
			(this.loading() && !this.definition().form.submitWhileLoading) ||
			this.savingSearch() ||
			!this.allowed()
		)
			return;
		if (this.definition().request.nxql && !this.nxql.trim()) {
			this.error.set(messageText('app.state.enter-an-nxql-query-22e2ac', 'Enter an NXQL query.'));
			return;
		}
		if (this.definition().request.path && this.path && !this.path.startsWith('/')) {
			this.error.set(
				messageText(
					'app.state.enter-an-absolute-repository-path-d6ebeb',
					'Enter an absolute repository path.',
				),
			);
			return;
		}
		if (
			this.definition().request.expiredAt &&
			this.expiredAt &&
			Number.isNaN(Date.parse(this.expiredAt))
		) {
			this.error.set(
				messageText(
					'app.state.enter-a-valid-expiration-date-2183d9',
					'Enter a valid expiration date.',
				),
			);
			return;
		}
		if (
			!this.drawerOnly() &&
			text === this.applied.text &&
			this.path === this.applied.path &&
			this.nxql === this.applied.nxql &&
			this.expiredAt === this.appliedExpiredAtInput &&
			JSON.stringify(this.quickFilters) === JSON.stringify(this.applied.quickFilters ?? []) &&
			this.sortBy === this.applied.sortBy &&
			this.sortOrder === this.applied.sortOrder &&
			JSON.stringify(this.facets) === JSON.stringify(this.applied.facets)
		) {
			// Angular skips navigation to identical URLs. Explicit Search still refreshes repository data.
			if (this.definition().request.expiredAt && !this.appliedExpiredAtInput)
				this.applied = { ...this.applied, expiredAt: new Date().toISOString() };
			await this.load(true);
			return;
		}
		// The route owns applied criteria (a `memory` search's session, under its bare address). A
		// refused navigation leaves the current result set intact.
		const definition = this.definition();
		const scope = this.scope();
		const drawer = this.drawerOnly();
		const commands = drawer ? ['/page', definition.id] : [];
		const extras = {
			...(drawer ? {} : { relativeTo: this.route, queryParamsHandling: 'merge' as const }),
			queryParams: {
				quickFilters: definition.quickFilters ? this.quickFilters.join(',') || null : null,
				q: definition.request.text ? text || null : null,
				path: definition.request.path ? this.path : null,
				nxql: definition.request.nxql ? this.nxql : null,
				expiredAt: definition.request.expiredAt && this.expiredAt ? this.expiredAt : null,
				sortBy: this.sortBy || null,
				sortOrder: this.sortBy ? this.sortOrder : null,
				facets: Object.values(this.facets).some((values) => values.length)
					? JSON.stringify(this.facets)
					: null,
			},
		};
		const memory = definition.form.criteria === 'memory';
		const undoCriteria = memory ? this.hosts.applyCriteria(scope, extras.queryParams) : undefined;
		const navigation = memory ? {} : extras;
		const cancelHandOff = drawer
			? this.hosts.handOff(definition.id, {
					scope,
					facetsExpanded: this.assetFacetExpanded(),
					bucketListsExpanded: this.expandedBucketLists(),
					submittedUrl: this.router.createUrlTree(commands, navigation).toString(),
				})
			: undefined;
		// A `memory` results page applies in place; only its drawer navigates, to the bare page.
		let accepted = memory && !drawer;
		try {
			if (!accepted) accepted = await this.router.navigate(commands, navigation);
		} finally {
			// Refused and failed navigation must not leave a submission for a later page visit.
			if (!accepted) {
				cancelHandOff?.();
				undoCriteria?.();
			}
		}
		if (
			accepted &&
			!drawer &&
			!this.destroyRef.destroyed &&
			scope === this.scope() &&
			definition.form.submission === 'explicit'
		)
			await this.syncQuery(true);
	}

	async loadSavedSearches(): Promise<void> {
		const definition = this.definition();
		if (!definition.savedSearches) return;
		const scope = this.savedSearchScope;
		try {
			const result = await firstValueFrom(
				this.search.savedSearches(definition).pipe(takeUntilDestroyed(this.destroyRef)),
			);
			if (scope === this.savedSearchScope) this.savedSearches.set(result.entries ?? []);
		} catch {
			if (scope === this.savedSearchScope)
				this.savedSearchError.set(
					messageText(
						'app.state.unable-to-load-saved-searches-ac687d',
						'Unable to load saved searches.',
					),
				);
		}
	}
	async loadSavedSearch(id: string): Promise<void> {
		const definition = this.definition();
		if (!definition.savedSearches) return;
		if (!id) {
			this.selectedSavedSearch = '';
			if (definition.savedSearches.resetOnClear) this.reset();
			return;
		}
		const saved = this.savedSearches().find((item) => item.id === id);
		if (!saved || (this.loading() && !definition.savedSearches.loadWhileLoading) || this.busy())
			return;
		const criteria = this.search.criteriaFromSaved(definition, saved);
		this.quickFilters = [...(criteria.quickFilters ?? [])];
		this.text = criteria.text ?? '';
		this.path = criteria.path ?? '/';
		const cutoff = criteria.expiredAt ? new Date(criteria.expiredAt) : null;
		this.expiredAt =
			cutoff && !Number.isNaN(cutoff.getTime())
				? new Date(cutoff.getTime() - cutoff.getTimezoneOffset() * 60_000)
						.toISOString()
						.slice(0, 23)
				: '';
		this.facets = Object.fromEntries(
			Object.entries(criteria.facets ?? {}).map(([key, values]) => [key, [...values]]),
		);
		this.selectedSavedSearch = id;
		await this.submit();
	}
	openSaveSearch(): void {
		this.savedSearchTitle =
			this.savedSearches().find((item) => item.id === this.selectedSavedSearch)?.title ?? '';
		this.savedSearchError.set('');
		this.saveDialog.set(true);
	}
	async updateSelectedSearch(): Promise<void> {
		const selected = this.savedSearches().find((item) => item.id === this.selectedSavedSearch);
		if (!selected) return;
		this.savedSearchTitle = selected.title;
		await this.saveSearch(true);
	}
	async saveSearch(update = false): Promise<void> {
		const definition = this.definition();
		if (
			!definition.savedSearches ||
			this.savingSearch() ||
			!this.savedSearchTitle.trim() ||
			!this.allowed()
		)
			return;
		const scope = this.savedSearchScope;
		this.savingSearch.set(true);
		this.savedSearchError.set('');
		this.savedSearchStatus.set('');
		const criteria = definition.savedSearches.useDraft
			? {
					...this.applied,
					text: this.text,
					facets: structuredClone(this.facets),
					quickFilters: [...this.quickFilters],
				}
			: this.applied;
		try {
			const request =
				update && this.selectedSavedSearch
					? this.search.updateSavedSearch(
							this.selectedSavedSearch,
							definition,
							this.savedSearchTitle.trim(),
							criteria,
						)
					: this.search.saveSavedSearch(definition, this.savedSearchTitle.trim(), criteria);
			const result = await firstValueFrom(request.pipe(takeUntilDestroyed(this.destroyRef)));
			if (scope !== this.savedSearchScope) return;
			this.selectedSavedSearch = result.id;
			this.saveDialog.set(false);
			await this.loadSavedSearches();
			if (scope === this.savedSearchScope)
				this.savedSearchStatus.set(messageText('app.state.search-saved-681246', 'Search saved.'));
		} catch {
			if (scope === this.savedSearchScope)
				this.savedSearchError.set(
					messageText('app.state.unable-to-save-this-search-265779', 'Unable to save this search.'),
				);
		} finally {
			this.savingSearch.set(false);
		}
	}
	async deleteSearch(): Promise<void> {
		const saved = this.savedSearches().find((item) => item.id === this.selectedSavedSearch);
		if (
			!saved ||
			this.savingSearch() ||
			!window.confirm(
				this.uiRepositorySearchComponentConfirmations.format(
					'app.notices.delete-saved-search-value-61ad3f',
					{ value0: saved.title },
					'Delete saved search “{value0}”?',
				),
			)
		)
			return;
		const scope = this.savedSearchScope;
		this.savingSearch.set(true);
		try {
			await firstValueFrom(
				this.search.deleteSavedSearch(saved.id).pipe(takeUntilDestroyed(this.destroyRef)),
			);
			if (scope !== this.savedSearchScope) return;
			this.selectedSavedSearch = '';
			await this.loadSavedSearches();
		} catch {
			if (scope === this.savedSearchScope)
				this.savedSearchError.set(
					messageText(
						'app.state.unable-to-delete-this-search-4ba973',
						'Unable to delete this search.',
					),
				);
		} finally {
			this.savingSearch.set(false);
		}
	}

	quickFilterLabel(name: string): string {
		const canonical = (
			{ nofolder: 'noFolder', mostrecent: 'mostRecent', onlyvalidated: 'onlyValidated' } as Record<
				string,
				string
			>
		)[name.replace(/[^a-z]/gi, '').toLowerCase()];
		if (canonical)
			return this.uiRepositorySearchComponentConfirmations.text(
				`ui.label.quickFilters.${canonical}`,
				(
					{
						noFolder: 'No Containers',
						mostRecent: 'Most Recent',
						onlyValidated: 'Validated',
					} as Record<string, string>
				)[canonical],
			);
		return name === 'approved'
			? this.uiRepositorySearchComponentConfirmations.text('label.ui.state.approved', 'Approved')
			: name;
	}

	toggleQuickFilter(name: string): void {
		if (!this.quickFilterOptions().some((filter) => filter.name === name)) return;
		this.quickFilters = this.quickFilters.includes(name)
			? this.quickFilters.filter((value) => value !== name)
			: [...this.quickFilters, name];
		this.applyFilters();
	}
	sortColumn(event: { columnId: string; direction: 'asc' | 'desc' | null }): void {
		const fields: Record<string, string> = {
			title: 'dc:title',
			modified: 'dc:modified',
			lastContributor: 'dc:lastContributor',
			created: 'dc:created',
			author: 'dc:creator',
			path: 'ecm:path',
			size: this.definition().results.sizeField,
		};
		if (!fields[event.columnId]) return;
		this.sortBy = event.direction ? fields[event.columnId] : '';
		this.sortOrder = event.direction ?? 'asc';
		this.applySort();
	}

	removeFacet(key: string, value: string): void {
		this.facets = {
			...this.facets,
			[key]: (this.facets[key] ?? []).filter((item) => item !== value),
		};
		this.filtersChanged();
	}
	reset(): void {
		this.selectedSavedSearch = '';
		this.quickFilters = [];
		this.text = '';
		this.path = '/';
		this.nxql = DEFAULT_NXQL;
		this.expiredAt = '';
		this.facets = {};
		this.cancelAutoSearch();
		if (this.definition().form.submission === 'explicit') this.clearResults();
		else void this.submit();
	}
	private cancelAutoSearch(): void {
		if (this.autoSearchTimer !== undefined) clearTimeout(this.autoSearchTimer);
		this.autoSearchTimer = undefined;
	}
	setAutoSearch(value: boolean): void {
		this.cancelAutoSearch();
		this.autoSearch.set(value);
		if (value) this.filtersChanged();
	}
	filtersChanged(): void {
		if (this.definition().form.submission === 'explicit') return;
		if (this.definition().form.submission === 'immediate') {
			this.applyFilters();
			return;
		}
		this.cancelAutoSearch();
		if (!this.autoSearch() || this.busy() || this.savingSearch() || !this.allowed()) return;
		this.autoSearchTimer = setTimeout(() => {
			this.autoSearchTimer = undefined;
			void this.submit();
		}, 300);
	}
	toggleFacet(key: string, value: string): void {
		if (!(this.definition().facets as readonly string[]).includes(key) || this.busy()) return;
		const values = this.facets[key] ?? [];
		this.facets = {
			...this.facets,
			[key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
		};
		this.filtersChanged();
	}
	facetExpanded(key: string): boolean {
		return this.assetFacetExpanded().has(key);
	}
	toggleFacetExpanded(key: string): void {
		this.assetFacetExpanded.update((expanded) => {
			const next = new Set(expanded);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}
	assetBuckets(key: string): { key: string; label: string; count: number }[] {
		const buckets = this.buckets(key);
		return this.facetShowAll(key) ? buckets : buckets.slice(0, 8);
	}
	hasExtraBuckets(key: string): boolean {
		return this.buckets(key).length > 8;
	}
	facetShowAll(key: string): boolean {
		return this.expandedBucketLists().has(key);
	}
	toggleFacetShowAll(key: string): void {
		this.expandedBucketLists.update((expanded) => {
			const next = new Set(expanded);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}
	onResultsScroll(event: Event): void {
		const viewport = event.currentTarget;
		if (
			!this.paging.scrollPagingEnabled() ||
			!this.definition().results.scrollPaging ||
			this.displayMode() === 'table' ||
			this.error() ||
			this.selectingQuery() ||
			!(viewport instanceof HTMLElement)
		)
			return;
		if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 200) this.more();
	}
	assetAspectRatio(row: any): number {
		const info = row.properties?.['picture:info'];
		const width = Number(info?.width);
		const height = Number(info?.height);
		const videoWidth = Number(row.properties?.['vid:info']?.width ?? row.properties?.['vid:width']);
		const videoHeight = Number(
			row.properties?.['vid:info']?.height ?? row.properties?.['vid:height'],
		);
		if (!(width > 0 && height > 0) && videoWidth > 0 && videoHeight > 0)
			return videoWidth / videoHeight;
		return width > 0 && height > 0 && Number.isFinite(width / height) ? width / height : 1;
	}
	openQueue(): void {
		const user = this.context().user;
		if (
			!this.definition().queue ||
			!user ||
			!this.allowed() ||
			this.loading() ||
			this.busy() ||
			this.selectingQuery()
		)
			return;
		this.assetsQueue.open(
			user.id,
			String(this.context().document?.['repository'] ?? 'default'),
			structuredClone(this.applied),
			this.router.url,
			{ autoSearch: this.autoSearch(), selectedSavedSearch: this.selectedSavedSearch },
			this.definition().queue!.kind,
		);
	}
	applyFilters(): void {
		if (!this.loading() && !this.busy() && this.allowed()) void this.submit();
	}
	toggleFilters(): void {
		this.filtersOpen.update((open) => !open);
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
		writeSearchView(
			this.definition().id,
			this.context().user?.id ?? 'anonymous',
			String(this.context().document?.['repository'] ?? 'default'),
			{ displayMode: mode },
		);
	}
	async applySort(): Promise<void> {
		if (
			this.loading() ||
			this.busy() ||
			this.savingSearch() ||
			this.selectingQuery() ||
			!this.hasQuery() ||
			!this.allowed()
		)
			return;
		this.cancelAutoSearch();
		const scope = this.scope();
		const sort = { sortBy: this.sortBy || null, sortOrder: this.sortBy ? this.sortOrder : null };
		let accepted = true;
		if (this.definition().form.criteria === 'memory') this.hosts.applyCriteria(scope, sort, true);
		else
			accepted = await this.router.navigate([], {
				relativeTo: this.route,
				queryParamsHandling: 'merge',
				queryParams: sort,
			});
		if (
			accepted &&
			!this.destroyRef.destroyed &&
			scope === this.scope() &&
			this.definition().form.submission === 'explicit'
		)
			await this.syncQuery(true);
	}
	reverseSort(): void {
		if (!this.sortBy) this.sortBy = this.definition().results.defaultSort;
		this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
		this.applySort();
	}
	runNxql(event: Event): void {
		event.preventDefault();
		this.applyFilters();
	}
	expandNxql(event: Event): void {
		const textarea = event.target as HTMLTextAreaElement;
		textarea.style.height = 'auto';
		textarea.style.height = `${textarea.scrollHeight}px`;
	}
	thumbnail(row: any): string {
		const value = row.contextParameters?.thumbnail;
		return typeof value === 'string' ? value : (value?.url ?? '');
	}
	formatBytes(value: unknown): string {
		const bytes = Number(value);
		if (!Number.isFinite(bytes) || bytes < 0) return '';
		const locale = this.uiRepositorySearchComponentConfirmations.locale();
		if (bytes < 1024)
			return new Intl.NumberFormat(locale, {
				style: 'unit',
				unit: 'byte',
				unitDisplay: 'short',
			}).format(bytes);
		const units = ['KB', 'MB', 'GB', 'TB'];
		const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length);
		return `${new Intl.NumberFormat(locale, { minimumFractionDigits: exponent === 1 ? 0 : 1, maximumFractionDigits: exponent === 1 ? 0 : 1 }).format(bytes / 1024 ** exponent)} ${units[exponent - 1]}`;
	}
	formatModified(value: unknown): string {
		const date = new Date(String(value));
		return Number.isNaN(date.valueOf())
			? String(value ?? '')
			: new Intl.DateTimeFormat(
					this.uiRepositorySearchComponentConfirmations.locale(),
					// Stock nuxeo-date (Expired, Assets tables): the long date only ("October 28, 2026").
					this.stockResults() ? { dateStyle: 'long' } : { dateStyle: 'medium', timeStyle: 'short' },
				).format(date);
	}
	/** Stock toggle buttons listen for `removed-from-favorites`: a change made anywhere updates the star. */
	private readonly favoriteChanges = followFavoriteChanges(this.rows);
	documentPath(row: any): string {
		return String(row?.path ?? row?.properties?.['ecm:path'] ?? '');
	}
	documentSize(row: any): unknown {
		return this.definition().results.sizeField === 'file:content/length'
			? (row?.properties?.['file:content']?.length ?? row?.properties?.['common:size'])
			: (row?.properties?.['common:size'] ?? row?.properties?.['file:content']?.length);
	}
	documentModified(row: any): unknown {
		return row?.properties?.['dc:modified'];
	}
	lastContributor(row: any): string {
		return contributorLabel(row?.properties?.['dc:lastContributor']);
	}
	contributorInitials(row: any): string {
		const value = this.lastContributor(row);
		const parts = value.split(/[\s@.]+/).filter(Boolean);
		return parts.length >= 2
			? (parts[0][0] + parts[1][0]).toUpperCase()
			: value.slice(0, 2).toUpperCase() || '?';
	}
	contributorColor(row: any): string {
		const value = this.lastContributor(row);
		let hash = 0;
		for (let index = 0; index < value.length; index++)
			hash = value.charCodeAt(index) + ((hash << 5) - hash);
		const colors = ['#1f28bf', '#0066ff', '#279e70', '#6f42c1', '#287bb5'];
		return colors[Math.abs(hash) % colors.length];
	}
	retry(): void {
		if (this.hasQuery() && !this.loading() && !this.busy())
			this.tasks.run(() => this.load(this.rows().length === 0));
	}
	more(): void {
		if (this.hasMore() && !this.loading() && !this.busy()) this.tasks.run(() => this.load(false));
	}
	/** Stable option list for the Authors dropdown: a fresh array per change detection makes
	 *  ng-select re-render its options under the pointer, so clicks never land. */
	buckets(key: string): { key: string; label: string; labelKey?: string; count: number }[] {
		return (this.aggregations()[key]?.buckets ?? []).map((bucket: any) => ({
			key: String(bucket.key?.id ?? bucket.key),
			label: String(
				bucket.key?.properties?.label ?? bucket.key?.label ?? bucket.key?.id ?? bucket.key,
			),
			...builtinAggregationLabel(key, String(bucket.key?.id ?? bucket.key)),
			count: bucket.docCount ?? bucket.doc_count ?? 0,
		}));
	}
	select(uid: string, event: Event): void {
		if (this.busy() || this.loading() || this.selectingQuery()) return;
		this.matchingQuerySelected.set(false);
		const row = this.rows().find((candidate) => candidate.uid === uid);
		if ((event.target as HTMLInputElement).checked && row)
			this.setSelectedRows([...this.selectedRows().values(), row]);
		else this.removeSelectedRow(uid);
	}
	projectedSelectionChange(ids: readonly string[]): void {
		this.matchingQuerySelected.set(false);
		const selected = new Set(ids);
		const current = new Map(this.selectedRows());
		for (const row of this.rows()) {
			if (selected.has(row.uid)) current.set(row.uid, row);
			else current.delete(row.uid);
		}
		this.selectedRows.set(current);
		this.selection.set(new Set(current.keys()));
	}
	stopSelectingQuery(): void {
		if (!this.selectingQuery()) return;
		this.cancelQuerySelection(
			messageText(
				'selection.stopped',
				'{count, plural, one {Selection stopped after # document.} other {Selection stopped after # documents.}}',
				{ count: this.selection().size },
			),
		);
	}
	async selectMatchingQuery(): Promise<void> {
		if (
			!this.hasQuery() ||
			this.selectingQuery() ||
			this.loading() ||
			this.busy() ||
			!this.allowed()
		)
			return;
		const generation = ++this.selectionGeneration;
		const criteria = structuredClone(this.applied);
		const repository = String(this.context().document?.['repository'] ?? 'default');
		this.clearSelection();
		this.selectingQuery.set(true);
		this.selectionProgress.set({ selected: 0, total: this.total() });
		let page = 0;
		let next = true;
		let truncated = false;
		let partialReason = '';
		try {
			while (
				next &&
				this.selection().size < QUERY_SELECTION_LIMIT &&
				page < QUERY_SELECTION_MAX_PAGES
			) {
				const result = await firstValueFrom(
					this.search
						.search(this.definition(), repository, criteria, page)
						.pipe(takeUntil(this.selectionCancelled)),
				);
				if (generation !== this.selectionGeneration || this.destroyRef.destroyed) return;
				if (!Array.isArray(result.entries)) {
					partialReason = 'invalid';
					break;
				}
				const before = this.selection().size;
				truncated = result.entries.length > QUERY_SELECTION_LIMIT - before;
				this.setSelectedRows(result.entries.slice(0, QUERY_SELECTION_LIMIT - before));
				this.selectionProgress.set({
					selected: this.selection().size,
					total: result.resultsCount ?? this.total(),
				});
				next = result.isNextPageAvailable === true && result.entries.length > 0;
				if (result.isNextPageAvailable === true && result.entries.length === 0) {
					partialReason = 'empty';
					break;
				}
				if (result.entries.length > 0 && this.selection().size === before) {
					partialReason = 'duplicate';
					break;
				}
				page++;
			}
			if (generation !== this.selectionGeneration) return;
			if (!partialReason && next && page >= QUERY_SELECTION_MAX_PAGES) partialReason = 'limit';
			const capped = truncated || (this.selection().size >= QUERY_SELECTION_LIMIT && next);
			this.matchingQuerySelected.set(!partialReason && !capped && !next);
			this.selectionOutcome.set(
				partialReason
					? messageText(
							'selection.partial',
							'{count, plural, one {Only # document was selected.} other {Only # documents were selected.}} {reason, select, invalid {The search provider returned an invalid result page.} empty {The search provider reported another page without returning documents.} duplicate {The search provider repeated documents instead of advancing to a new page.} limit {The selection stopped after {pages, number} pages.} other {The search provider did not advance to a new page.}} You can run an action on this partial selection or retry.',
							{
								count: this.selection().size,
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
								{ count: this.selection().size },
							),
			);
		} catch {
			if (generation === this.selectionGeneration && !this.destroyRef.destroyed)
				this.selectionOutcome.set(
					messageText(
						'selection.failed',
						'{count, plural, one {Only # document was selected before the query failed.} other {Only # documents were selected before the query failed.}} You can run an action on this partial selection or retry.',
						{ count: this.selection().size },
					),
				);
		} finally {
			if (generation === this.selectionGeneration) this.selectingQuery.set(false);
		}
	}
	private cancelQuerySelection(outcome?: string | MessageText): void {
		this.matchingQuerySelected.set(false);
		this.selectionGeneration++;
		this.selectionCancelled.next();
		this.selectingQuery.set(false);
		if (outcome) this.selectionOutcome.set(outcome);
	}
	private setSelectedRows(rows: readonly any[]): void {
		const next = new Map(this.selectedRows());
		for (const row of rows) if (typeof row?.uid === 'string' && row.uid) next.set(row.uid, row);
		this.selectedRows.set(next);
		this.selection.set(new Set(next.keys()));
	}
	private removeSelectedRow(uid: string): void {
		const next = new Map(this.selectedRows());
		next.delete(uid);
		this.selectedRows.set(next);
		this.selection.set(new Set(next.keys()));
	}
	private clearSelection(): void {
		this.matchingQuerySelected.set(false);
		this.selection.set(new Set());
		this.selectedRows.set(new Map());
		this.selectionOutcome.set('');
	}
	private clearResults(): void {
		this.generation++;
		this.cancelled.next();
		if (this.selectingQuery()) this.cancelQuerySelection();
		this.rows.set([]);
		this.aggregations.set({});
		this.clearSelection();
		this.page = 0;
		this.hasMore.set(false);
		this.total.set(null);
		this.hasQuery.set(false);
		this.loading.set(false);
		this.error.set('');
		this.resultEpoch.update((epoch) => epoch + 1);
	}
	private async load(reset: boolean): Promise<void> {
		if (reset) this.clearResults();
		const generation = this.generation;
		this.error.set('');
		if (!this.allowed()) {
			this.loading.set(false);
			return;
		}
		this.hasQuery.set(true);
		this.loading.set(true);
		try {
			const page = reset ? 0 : this.page + 1;
			const result = await firstValueFrom(
				this.search
					.search(
						this.definition(),
						String(this.context().document?.['repository'] ?? 'default'),
						this.applied,
						page,
					)
					.pipe(takeUntil(this.cancelled)),
			);
			if (generation !== this.generation || this.destroyRef.destroyed) return;
			const known = new Set(this.rows().map((row) => row.uid));
			const entries = result.entries.filter(
				(row) =>
					!known.has(row.uid) &&
					(this.definition().results.includeTrashed || !this.confirmedTrashedIds.has(row.uid)),
			);
			this.rows.update((rows) => [...rows, ...entries]);
			this.resultEpoch.update((epoch) => epoch + 1);
			this.page = page;
			this.hasMore.set(result.isNextPageAvailable === true && entries.length > 0);
			this.total.set(
				typeof result.resultsCount === 'number' && result.resultsCount >= 0
					? result.resultsCount
					: null,
			);
			this.aggregations.set(result.aggregations ?? {});
			this.quickFilterOptions.set(
				this.definition().quickFilters ? (result.quickFilters ?? []) : [],
			);
		} catch {
			if (generation === this.generation && !this.destroyRef.destroyed)
				this.error.set(
					messageText(
						'app.state.search-failed-check-the-query-permissions-and-48df75',
						'Search failed. Check the query, permissions and availability of this search provider, then retry.',
					),
				);
		} finally {
			if (generation === this.generation) this.loading.set(false);
		}
	}
	private async executeSelection(command: string): Promise<void> {
		const generation = this.generation;
		const selection = this.selectedIds().join(',');
		const removed = await this.actions.execute(
			command,
			this.toolbarContext(),
			() =>
				!this.destroyRef.destroyed &&
				generation === this.generation &&
				selection === this.selectedIds().join(','),
		);
		if (!removed.length) return;
		for (const uid of removed) this.confirmedTrashedIds.add(uid);
		this.rows.update((rows) => rows.filter((row) => !this.confirmedTrashedIds.has(row.uid)));
		this.total.update((total) => (total === null ? null : Math.max(0, total - removed.length)));
		this.clearSelection();
		this.resultEpoch.update((epoch) => epoch + 1);
	}
	canDeactivate(): boolean {
		return !this.busy() && !this.savingSearch();
	}
	hasPendingChanges(): boolean {
		return this.busy() || this.savingSearch();
	}
}
