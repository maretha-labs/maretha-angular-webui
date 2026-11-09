import { errorMessage } from 'app/helpers/localized-message';
import { selectionToolbarShortcut } from 'app/helpers/selection-toolbar-shortcut';
import { LocalizedUiError } from '@maretha/webui-sdk';
import { builtinAggregationLabel } from 'app/helpers/builtin-aggregation-labels';
import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { HttpClient, HttpParams } from '@angular/common/http';

import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	computed,
	effect,
	inject,
	input,
	signal,
	untracked,
	viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from 'app/helpers/auth.service';
import { SearchColumnChooserComponent } from 'app/modules/shared/components/search-column-chooser/search-column-chooser.component';
import {
	DocumentViewContext,
	GuardedView,
	ResultsProjectionColumn,
	ResultsColumnLayout,
	ResultsProjectionComponent,
	ResultsProjectionTemplateDirective,
	ResultsQueryScope,
	ResultsSelectionContext,
	WebUiSlotComponent,
	WebUiIconComponent,
	type ResultsProjectionMode,
} from '@maretha/webui-sdk';
import { DocumentLinkPipe } from 'app/helpers/document-route';
import { environment } from 'environments/environment';
import {
	applyResultColumnLayout,
	mergeResultColumnLayout,
	readResultColumnLayout,
	resultFieldColumns,
} from '../../helpers/scoped-result-columns';
import { hasPermission } from 'app/helpers/document-permissions';
import { DocumentGridThumbnailComponent } from '../document-grid-thumbnail/document-grid-thumbnail.component';
import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import { LoadMoreButtonComponent } from 'app/modules/shared/components/load-more/load-more-button.component';
import {
	ContentColumnHeaderComponent,
	type ContentColumnFilters,
} from './content-column-header.component';
import {
	DOCUMENT_CONTENT_SORT_OPTIONS,
	ResultsSortBarComponent,
} from '../results-sort-bar/results-sort-bar.component';

/** The document Trash tab lists direct children, unlike repository Trash search. */
/** Stock trash listing: Title, Modified and Last Contributor until the user chooses otherwise. */
const DEFAULT_VISIBLE_COLUMNS = ['title', 'modified', 'lastContributor'];

@Component({
	selector: 'nx-standard-document-trash-view',
	imports: [
		WebUiDatePipe,
		RouterLink,
		DocumentLinkPipe,
		WebUiSlotComponent,
		WebUiIconComponent,
		ResultsProjectionComponent,
		ResultsProjectionTemplateDirective,
		WebUiMessagePipe,
		DocumentGridThumbnailComponent,
		ResultsSortBarComponent,
		UserTagComponent,
		LoadMoreButtonComponent,
		SearchColumnChooserComponent,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<div class="actions">
			<span role="status">{{
				'results.heading.count' | webuiMessage: '{0} result(s)' : total() ?? rows().length
			}}</span>
			@if (canEmpty()) {
				<button
					type="button"
					class="empty-trash"
					[disabled]="loading() || busy() || !total()"
					(click)="emptyTrash()"
				>
					{{ 'documentTrashContent.emptyTrash' | webuiMessage: 'Empty Trash' }}
				</button>
			}
			<div class="display-controls">
				<button
					type="button"
					[attr.aria-label]="
						'app.modules.standard-document-trash-view.grid-83b613' | webuiMessage: 'Grid'
					"
					[attr.title]="
						'app.modules.standard-document-trash-view.grid-83b613' | webuiMessage: 'Grid'
					"
					[attr.aria-pressed]="mode() === 'grid'"
					(click)="setMode('grid')"
				>
					<nx-webui-icon name="nuxeo:view-thumbnails" />
				</button>
				<button
					type="button"
					[attr.aria-label]="
						'app.modules.standard-document-trash-view.table-5c0c78' | webuiMessage: 'Table'
					"
					[attr.title]="
						'app.modules.standard-document-trash-view.table-5c0c78' | webuiMessage: 'Table'
					"
					[attr.aria-pressed]="mode() === 'table'"
					(click)="setMode('table')"
				>
					<nx-webui-icon name="nuxeo:view-list" />
				</button>
			</div>
		</div>
		@if (selectedIds().length) {
			<div
				class="selection-actions selection-toolbar"
				role="group"
				[attr.aria-label]="
					'app.modules.document-toolbar.actions-for-selected-documents-9706ed'
						| webuiMessage: 'Actions for selected documents'
				"
			>
				<span role="status">{{
					'selectionToolbar.selected.items'
						| webuiMessage: '{0} item(s) selected' : selectedIds().length
				}}</span>
				<button type="button" [disabled]="busy()" (click)="selectedIds.set([])">
					{{ 'command.clear' | webuiMessage: 'Clear' }}
				</button>
				@if (keyboardHint()) {
					<span
						class="shortcut-hint"
						aria-hidden="true"
						[innerHTML]="
							'selectionToolbar.hint.message'
								| webuiMessage
									: 'Use <kbd>{0}</kbd> + <kbd>.</kbd> to navigate to the toolbar'
									: modifierKey
						"
					></span>
				}
				<nx-webui-slot name="TRASH_RESULTS_SELECTION_ACTIONS" [context]="selectionContext()" />
			</div>
		}
		@if (error()) {
			<p role="alert">{{ error() }}</p>
			<button type="button" [disabled]="loading() || busy()" (click)="retry()">
				{{ 'app.modules.standard-document-trash-view.retry-07a813' | webuiMessage: 'Retry' }}
			</button>
		}
		@if (loading() && !rows().length) {
			<p role="status">
				{{
					'app.modules.standard-document-trash-view.loading-trash-44f80c'
						| webuiMessage: 'Loading trash…'
				}}
			</p>
		}
		<!-- Stock nuxeo-data-table: the table's filters and sort arrows live in its column headers. -->
		@if (mode() !== 'table') {
			<!-- Stock nuxeo-document-trash-content: the grid view's sort bar under the count row. -->
			<nx-results-sort-bar
				class="grid-sort"
				[options]="gridSortOptions"
				[field]="gridSort().field"
				[ascending]="gridSort().ascending"
				[disabled]="loading() || busy()"
				(fieldChange)="setSort($event)"
				(orderToggle)="reverseSort()"
			/>
		}
		<nx-results-projection
			[columnLayoutEnabled]="true"
			(columnLayoutChange)="changeColumnLayout($event)"
			[columnChooser]="true"
			(columnChooserOpen)="openColumnChooser()"
			hostId="standard-document-trash"
			[mode]="mode()"
			[rows]="rows()"
			[columns]="columns()"
			[remoteSort]="true"
			[selection]="selectedIds()"
			[contextEpoch]="epoch()"
			[scope]="context().document"
			[loading]="false"
			[readOnly]="loading() || busy()"
			(selectionChange)="select($event)"
			(sortChange)="sortChanged($event)"
			(loadMore)="more()"
		>
			<ng-template
				nxResultsTemplate="item"
				let-row="row"
				let-selected="selected"
				let-toggleSelection="toggleSelection"
			>
				<nx-document-grid-thumbnail
					[document]="row"
					[selected]="selected"
					[selecting]="selectedIds().length > 0"
					[selectionDisabled]="loading() || busy()"
					(toggleSelection)="toggleSelection()"
				/>
			</ng-template>
			<ng-template nxResultsTemplate="cell:title" let-row="row">
				<!-- Stock title cell: the thumbnail beside the plain title. -->
				<div class="table-title">
					@if (thumbnail(row)) {
						<img [src]="thumbnail(row)" alt="" />
					}
					<a [routerLink]="row | documentLink" data-nx-results-interactive>{{ row.title }}</a>
				</div>
			</ng-template>
			<ng-template nxResultsTemplate="cell:modified" let-row="row">
				{{ $any(row).properties?.['dc:modified'] | webuiDate: 'longDate' }}
			</ng-template>
			<ng-template nxResultsTemplate="cell:lastContributor" let-row="row">
				<nx-user-tag [lookup]="false" [user]="$any(row).properties?.['dc:lastContributor']" />
			</ng-template>
			<ng-template nxResultsTemplate="cell:created" let-row="row">{{
				$any(row).properties?.['dc:created'] | webuiDate: 'longDate'
			}}</ng-template>
		</nx-results-projection>
		<nx-search-column-chooser
			[columns]="columns()"
			[lockedColumns]="['title']"
			(visibilityChange)="toggleColumn($event.id)"
			(resetColumns)="resetColumns()"
		/>
		@if (hasMore()) {
			<nx-load-more-button
				[loading]="loading() && rows().length > 0"
				[disabled]="loading() || busy()"
				(more)="more()"
			/>
		}`,
	styles: `
		@use '../document-toolbar/selection-toolbar' as *;
		:host {
			display: block;
			min-width: 0;
			padding: 24px;
		}
		.actions {
			display: flex;
			align-items: center;
			gap: 16px;
			min-height: 44px;
		}
		// The same selection bar as the folder view and the searches.
		.selection-actions {
			@include selection-toolbar;
		}
		.selection-actions button:focus-visible {
			outline: revert;
		}
		nx-webui-slot {
			display: flex;
		}
		button {
			border: 0;
			background: transparent;
			color: var(--nuxeo-primary-color);
			padding: 8px;
		}
		button:disabled {
			opacity: 0.5;
		}
		button:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color);
		}
		a {
			color: var(--nuxeo-link-color, var(--nuxeo-primary-color));
		}
		.display-controls {
			display: flex;
			margin-inline-start: auto;
			align-items: center;
			gap: 8px;
		}
		button[aria-pressed='true'] {
			background: var(--nuxeo-border);
		}
		// Stock title cell: a 32px thumbnail beside the plain, unlinked-looking title.
		.table-title {
			display: flex;
			min-width: 0;
			align-items: center;
			gap: 0.6rem;
		}
		.table-title img {
			width: 32px;
			height: 32px;
			object-fit: cover;
			border-radius: 2px;
		}
		.table-title a {
			overflow: hidden;
			color: inherit;
			text-decoration: none;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		// The header filters' option lists open below the header row instead of being clipped.
		:host ::ng-deep .ag-header-cell,
		:host ::ng-deep .ag-header-viewport {
			overflow: visible;
		}
		:host ::ng-deep .ag-header {
			overflow: visible;
			z-index: 4;
		}
		// Stock nuxeo-document-trash-content: 16px gutters, a 13px count, Empty Trash beside the view
		// switcher (the current mode a primary glyph, a hairline ring on hover), the grid's sort bar
		// under the count row and the thumbnails 16px under the bar.
		:host {
			padding: 11px 16px 24px;
		}
		.actions > span[role='status'] {
			font-size: 13px;
			line-height: 20px;
		}
		.empty-trash {
			margin-inline-start: auto;
			font-size: 13px;
			font-weight: 700;
		}
		.empty-trash + .display-controls {
			margin-inline-start: 0;
		}
		.display-controls > button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			padding: 0;
			border-radius: 50%;
			color: var(--nuxeo-text-default);
			box-shadow: 0 0 0 1px transparent;
			transition: box-shadow 0.12s;
			--webui-icon-size: 20px;
		}
		.display-controls > button[aria-pressed='true'] {
			background: transparent;
			color: var(--nuxeo-primary-color);
		}
		.display-controls > button:not([aria-pressed='true']):hover {
			box-shadow: 0 0 0 1px var(--nuxeo-primary-color);
		}
		.grid-sort {
			margin: 7px 0 16px;
		}
	`,
})
export class StandardDocumentTrashViewComponent implements GuardedView {
	readonly context = input.required<DocumentViewContext>();
	private readonly http = inject(HttpClient);
	private readonly auth = inject(AuthService);
	private readonly destroy = inject(DestroyRef);
	private readonly api = `${environment.nuxeoUrl}/api/v1`;
	private generation = 0;
	private page = 0;
	private scope = '';
	private failedReset = true;
	private readonly removed = new Set<string>();
	private totalCeiling: number | null = null;
	private titleTimer?: ReturnType<typeof setTimeout>;
	private readonly sortApplied = signal(false);
	readonly mode = signal<ResultsProjectionMode>('table');
	readonly titleFilter = signal('');
	readonly sortField = signal('dc:modified');
	readonly gridSortOptions = DOCUMENT_CONTENT_SORT_OPTIONS;
	readonly ascending = signal(false);
	/**
	 * Stock nuxeo-document-trash-content's sort select shows Created ascending until a sort is
	 * applied, although the server's order is what the rows follow.
	 */
	readonly gridSort = computed(() =>
		this.sortApplied()
			? { field: this.sortField(), ascending: this.ascending() }
			: { field: 'dc:created', ascending: true },
	);
	readonly visibleColumns = signal<ReadonlySet<string>>(new Set(DEFAULT_VISIBLE_COLUMNS));
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
		this.visibleColumns.set(new Set(DEFAULT_VISIBLE_COLUMNS));
		this.columnLayout.set([]);
		this.savePreferences();
	}
	readonly aggregateFilters = [
		{ name: 'dc_modified_agg', label: 'Modified', labelKey: 'app.columns.last-modified' },
		{
			name: 'dc_last_contributor_agg',
			label: 'Last Contributor',
			labelKey: 'app.columns.last-contributor',
		},
	] as const;
	readonly selectedAggregates = signal<Record<string, readonly string[]>>({
		dc_modified_agg: [],
		dc_last_contributor_agg: [],
	});
	readonly aggregations = signal<
		Partial<Record<string, { key: string; label: string; labelKey?: string; count: number }[]>>
	>({});
	readonly rows = signal<any[]>([]);
	readonly selectedIds = signal<readonly string[]>([]);
	/** Shortcut hint in the selection bar; shown until the bar itself is used (focus or shortcut). */
	private readonly shortcut = selectionToolbarShortcut('.selection-actions');
	readonly keyboardHint = this.shortcut.keyboardHint;
	readonly modifierKey = this.shortcut.modifierKey;
	readonly loading = signal(false);
	readonly busy = signal(false);
	/** The folder View tab's header filters, bound to this listing's own filter state. */
	private readonly columnFilters: ContentColumnFilters = {
		busy: () => this.busy(),
		titleFilter: () => this.titleFilter(),
		setTitleFilter: (value) => this.filterTitle(value),
		aggregateBuckets: () => this.aggregations(),
		aggregateFilters: () => this.selectedAggregates(),
		toggleAggregate: (name, key) => this.toggleAggregate(name, key),
	};
	readonly error = localizedText('');
	readonly hasMore = signal(false);
	readonly total = signal<number | null>(null);
	readonly epoch = signal(0);
	/** The page-provider query behind the loaded rows. */
	private readonly appliedScope = signal<ResultsQueryScope | undefined>(undefined);
	readonly allColumns: readonly ResultsProjectionColumn<any>[] = [
		{
			id: 'title',
			label: 'Title',
			labelKey: 'app.columns.title',
			value: (row) => row.title ?? '',
			minWidth: 230,
		},
		{ id: 'type', label: 'Type', labelKey: 'app.columns.type', value: (row) => row.type ?? '' },
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
			value: (row) => this.principalLabel(row),
		},
		{ id: 'state', label: 'State', labelKey: 'app.columns.state', value: (row) => row.state ?? '' },
		{
			id: 'version',
			label: 'Version',
			labelKey: 'app.columns.version',
			value: (row) => row.versionLabel ?? '',
		},
		{
			id: 'created',
			label: 'Created',
			labelKey: 'app.columns.created',
			value: (row) => row.properties?.['dc:created'] ?? '',
		},
		{
			id: 'author',
			label: 'Author',
			labelKey: 'app.columns.author',
			value: (row) => this.userLabel(row.properties?.['dc:creator']),
		},
		{
			id: 'nature',
			label: 'Nature',
			labelKey: 'app.columns.nature',
			value: (row) => this.directoryLabel(row.properties?.['dc:nature']),
		},
		{
			id: 'coverage',
			label: 'Coverage',
			labelKey: 'app.columns.coverage',
			value: (row) => this.directoryLabel(row.properties?.['dc:coverage']),
		},
		{
			id: 'subjects',
			label: 'Subjects',
			labelKey: 'app.columns.subjects',
			value: (row) => this.directoryLabel(row.properties?.['dc:subjects']),
		},
	];
	readonly columns = computed(() =>
		applyResultColumnLayout(this.allColumns, this.columnLayout()).map((column) => ({
			...column,
			hidden: !this.visibleColumns().has(column.id),
			headerComponent: ContentColumnHeaderComponent,
			headerComponentParams: { content: this.columnFilters, id: column.id },
		})),
	);
	readonly canEmpty = computed(() => this.mayEmpty(this.context().document));
	readonly selectionContext = computed<ResultsSelectionContext>(() => {
		const context = this.context();
		const scope = this.identity(context.document);
		return {
			...context,
			selectedDocuments: this.rows().filter((row) => this.selectedIds().includes(row.uid)),
			items: this.rows(),
			displayMode: this.mode(),
			columns: resultFieldColumns(this.columns()),
			queryScope: this.appliedScope(),
			busy: this.busy() || this.loading(),
			setBusy: (value) => {
				if (this.scope === scope) this.busy.set(value);
			},
			reportMessage: (key, fallback, values) => {
				if (this.scope === scope) this.error.set(messageText(key, fallback, values));
			},
			reportError: (message) => {
				if (this.scope === scope) this.error.set(message);
			},
			refresh: async (ids = []) => {
				if (this.scope !== scope || this.destroy.destroyed) return;
				this.removeCommitted(ids);
				await this.load(true);
			},
		};
	});
	constructor() {
		effect(() => {
			const document = this.context().document;
			const scope = this.identity(document);
			if (scope === this.scope) return;
			this.scope = scope;
			this.removed.clear();
			this.totalCeiling = null;
			this.busy.set(false);
			untracked(() => {
				this.titleFilter.set('');
				this.selectedAggregates.set({ dc_modified_agg: [], dc_last_contributor_agg: [] });
				this.sortApplied.set(false);
				this.sortField.set('dc:modified');
				this.ascending.set(false);
				this.restorePreferences();
				void this.load(true);
			});
		});
		this.destroy.onDestroy(() => {
			this.generation++;
			if (this.titleTimer) clearTimeout(this.titleTimer);
		});
	}
	private identity(document: Readonly<Record<string, unknown>> | null): string {
		return JSON.stringify([document?.['repository'] ?? 'default', document?.['uid'] ?? null]);
	}
	private headers(document = this.context().document): Record<string, string> {
		return {
			'X-NXRepository': String(document?.['repository'] ?? 'default'),
			'enrichers-document': 'thumbnail,permissions',
			properties: 'dublincore,common,uid,file',
			'fetch-document': 'properties',
			'translate-directoryEntry': 'label',
			'fetch-aggregate': 'key',
		};
	}
	private async load(reset: boolean): Promise<void> {
		if (!reset && (this.loading() || this.busy() || !this.hasMore())) return;
		const document = this.context().document;
		const generation = reset ? ++this.generation : this.generation;
		const page = reset ? 0 : this.page + 1;
		if (reset) {
			this.rows.set([]);
			this.appliedScope.set(undefined);
			this.selectedIds.set([]);
			this.hasMore.set(false);
			this.page = 0;
			this.epoch.update((value) => value + 1);
		}
		this.error.set('');
		this.loading.set(true);
		try {
			if (!document?.['uid']) {
				this.total.set(0);
				return;
			}
			const namedParameters: Record<string, string> = {
				ecm_parentId: String(document['uid']),
				ecm_trashed: 'true',
			};
			if (this.titleFilter().trim()) namedParameters['title'] = `${this.titleFilter().trim()}*`;
			for (const [name, values] of Object.entries(this.selectedAggregates()))
				if (values.length) namedParameters[name] = JSON.stringify(values);
			let params = new HttpParams({ fromObject: namedParameters })
				.set('pageSize', 40)
				.set('currentPageIndex', page);
			if (this.sortApplied())
				params = params
					.set('sortBy', this.sortField())
					.set('sortOrder', this.ascending() ? 'asc' : 'desc');
			const result = await firstValueFrom(
				this.http.get<any>(`${this.api}/search/pp/advanced_document_content/execute`, {
					params,
					headers: this.headers(document),
				}),
			);
			if (generation !== this.generation || this.destroy.destroyed) return;
			const raw: any[] = result.entries ?? [];
			this.applyAggregations(result.aggregations);
			const entries = raw.filter((row) => !this.removed.has(row.uid));
			this.rows.update((rows) => [
				...new Map([...rows, ...entries].map((row) => [row.uid, row])).values(),
			]);
			this.page = page;
			if (reset)
				this.appliedScope.set({
					repository: String(document['repository'] ?? 'default'),
					providerName: 'advanced_document_content',
					queryParams: [],
					namedParameters,
				});
			const total =
				typeof result.resultsCount === 'number' && result.resultsCount >= 0
					? result.resultsCount
					: null;
			this.total.set(
				total === null
					? null
					: this.totalCeiling === null
						? total
						: Math.min(total, this.totalCeiling),
			);
			if (this.totalCeiling !== null && total !== null && total <= this.totalCeiling)
				this.totalCeiling = null;
			this.hasMore.set(result.isNextPageAvailable === true);
			this.epoch.update((value) => value + 1);
		} catch {
			if (generation === this.generation && !this.destroy.destroyed) {
				this.failedReset = reset;
				this.error.set(
					messageText('app.state.trash-could-not-be-loaded-b3ca80', 'Trash could not be loaded.'),
				);
			}
		} finally {
			if (generation === this.generation && !this.destroy.destroyed) this.loading.set(false);
		}
	}
	private removeCommitted(ids: readonly string[]): void {
		const removed = new Set(ids);
		const count = this.rows().filter((row) => removed.has(row.uid)).length;
		ids.forEach((id) => this.removed.add(id));
		this.rows.update((rows) => rows.filter((row) => !removed.has(row.uid)));
		this.selectedIds.set([]);
		if (this.total() !== null) {
			this.totalCeiling = Math.max(0, this.total()! - count);
			this.total.set(this.totalCeiling);
		}
	}
	select(ids: readonly string[]): void {
		if (this.loading() || this.busy()) return;
		const available = new Set(this.rows().map((row) => row.uid));
		this.selectedIds.set(ids.filter((id) => available.has(id)));
	}
	more(): void {
		void this.load(false);
	}
	retry(): void {
		if (!this.loading() && !this.busy()) void this.load(this.failedReset);
	}
	private mayEmpty(document: any): boolean {
		return (
			!this.context().noEdit &&
			hasPermission(document, 'RemoveChildren') &&
			!document.isRecord &&
			!document.hasLegalHold &&
			!document.retainUntil
		);
	}
	async emptyTrash(): Promise<void> {
		if (this.busy() || this.loading() || !this.canEmpty() || !this.total()) return;
		const document = this.context().document!;
		const generation = this.generation;
		this.busy.set(true);
		this.error.set('');
		try {
			const fresh = await firstValueFrom(
				this.http.get<any>(
					`${this.api}/repo/${encodeURIComponent(String(document['repository'] ?? 'default'))}/id/${encodeURIComponent(String(document['uid']))}`,
					{ headers: this.headers(document) },
				),
			);
			if (generation !== this.generation || this.destroy.destroyed) return;
			if (!this.mayEmpty(fresh))
				throw new LocalizedUiError(
					'app.errors.permission-to-empty-this-trash-has-chang-9c8d9d',
					'Permission to empty this trash has changed.',
				);
			await firstValueFrom(
				this.http.post(
					`${this.api}/automation/Document.EmptyTrash`,
					{ params: { parent: document['uid'] }, context: {} },
					{ headers: { ...this.headers(document), 'nx-es-sync': 'true' } },
				),
			);
			if (generation !== this.generation || this.destroy.destroyed) return;
			this.removeCommitted(this.rows().map((row) => row.uid));
			this.totalCeiling = 0;
			this.total.set(0);
			await this.load(true);
		} catch (error) {
			if (generation === this.generation && !this.destroy.destroyed)
				this.error.set(
					error instanceof Error
						? errorMessage(error)
						: messageText(
								'app.state.trash-could-not-be-emptied-04df71',
								'Trash could not be emptied.',
							),
				);
		} finally {
			if (
				!this.destroy.destroyed &&
				this.identity(this.context().document) === this.identity(document)
			)
				this.busy.set(false);
		}
	}
	thumbnail(row: any): string {
		return (
			row?.contextParameters?.thumbnail?.url ??
			row?.contextParameters?.renditions?.find((rendition: any) => rendition?.name === 'thumbnail')
				?.url ??
			''
		);
	}
	principalId(row: any): string {
		const user = row.properties?.['dc:lastContributor'];
		return typeof user === 'string' ? user : String(user?.id ?? user?.properties?.username ?? '');
	}
	filterTitle(value: string): void {
		if (this.busy()) return;
		this.titleFilter.set(value);
		if (this.titleTimer) clearTimeout(this.titleTimer);
		this.titleTimer = setTimeout(() => this.queryChanged(), 300);
	}
	toggleAggregate(name: string, key: string): void {
		if (this.busy()) return;
		this.selectedAggregates.update((filters) => ({
			...filters,
			[name]: filters[name].includes(key)
				? filters[name].filter((value) => value !== key)
				: [...filters[name], key],
		}));
		this.queryChanged();
	}
	setSort(field: string): void {
		if (
			this.busy() ||
			!['dc:title', 'dc:created', 'dc:modified', 'dc:lastContributor', 'dc:creator'].includes(field)
		)
			return;
		this.sortApplied.set(true);
		this.sortField.set(field);
		this.ascending.set(field !== 'dc:modified');
		this.queryChanged();
	}
	reverseSort(): void {
		if (this.busy()) return;
		// From the displayed default, stock reverses that option: Created descending.
		const { field, ascending } = this.gridSort();
		this.sortApplied.set(true);
		this.sortField.set(field);
		this.ascending.set(!ascending);
		this.queryChanged();
	}
	sortChanged(event: { columnId: string; direction: 'asc' | 'desc' | null }): void {
		const field = (
			{
				title: 'dc:title',
				modified: 'dc:modified',
				lastContributor: 'dc:lastContributor',
				created: 'dc:created',
				author: 'dc:creator',
			} as Record<string, string>
		)[event.columnId];
		if (!field || this.busy()) return;
		this.sortApplied.set(!!event.direction);
		this.sortField.set(event.direction ? field : 'dc:modified');
		this.ascending.set(event.direction === 'asc');
		this.queryChanged();
	}
	private queryChanged(): void {
		if (this.titleTimer) clearTimeout(this.titleTimer);
		this.totalCeiling = null;
		void this.load(true);
	}
	setMode(mode: ResultsProjectionMode): void {
		this.mode.set(mode);
		this.savePreferences();
	}
	toggleColumn(id: string): void {
		if (id === 'title') return;
		this.visibleColumns.update((columns) => {
			const next = new Set(columns);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
		this.savePreferences();
	}
	private preferenceKey(): string {
		return (
			'maretha.document-trash.v1:' +
			JSON.stringify([this.auth.userInfo()?.id ?? 'anonymous', this.scope])
		);
	}
	private restorePreferences(): void {
		this.mode.set('table');
		this.columnLayout.set([]);
		this.visibleColumns.set(new Set(DEFAULT_VISIBLE_COLUMNS));
		try {
			const value = JSON.parse(localStorage.getItem(this.preferenceKey()) ?? 'null');
			this.columnLayout.set(readResultColumnLayout(value?.columnLayout));
			if (value?.mode === 'grid' || value?.mode === 'table') this.mode.set(value.mode);
			if (Array.isArray(value?.columns))
				this.visibleColumns.set(
					new Set([
						'title',
						...value.columns.filter((id: unknown) =>
							this.allColumns.some((column) => column.id === id),
						),
					]),
				);
		} catch {
			/* A blocked or malformed preference must not prevent document access. */
		}
	}
	changeColumnLayout(layout: readonly ResultsColumnLayout[]): void {
		this.columnLayout.set(mergeResultColumnLayout(this.columnLayout(), layout));
		this.savePreferences();
	}
	private savePreferences(): void {
		try {
			localStorage.setItem(
				this.preferenceKey(),
				JSON.stringify({
					mode: this.mode(),
					columns: [...this.visibleColumns()],
					columnLayout: this.columnLayout(),
				}),
			);
		} catch {
			/* Preferences are optional. */
		}
	}
	private applyAggregations(value: any): void {
		this.aggregations.set(
			Object.fromEntries(
				this.aggregateFilters.map(({ name }) => [
					name,
					(value?.[name]?.extendedBuckets ?? value?.[name]?.buckets ?? [])
						.filter((bucket: any) => typeof bucket.key === 'string')
						.map((bucket: any) => ({
							key: bucket.key,
							label: bucket.fetchedKey ? this.userLabel(bucket.fetchedKey) : bucket.key,
							...builtinAggregationLabel(name, bucket.key),
							count: Number(bucket.docCount) || 0,
						})),
				]),
			),
		);
	}
	private directoryLabel(value: any): string {
		return Array.isArray(value)
			? value.map((item) => this.directoryLabel(item)).join(', ')
			: typeof value === 'string'
				? value
				: String(value?.properties?.label ?? value?.label ?? value?.id ?? '');
	}
	private userLabel(user: any): string {
		return typeof user === 'string'
			? user
			: [user?.properties?.firstName, user?.properties?.lastName].filter(Boolean).join(' ') ||
					user?.properties?.email ||
					String(user?.id ?? '');
	}
	principalLabel(row: any): string {
		const user = row.properties?.['dc:lastContributor'];
		const name = [user?.properties?.firstName, user?.properties?.lastName]
			.filter(Boolean)
			.join(' ');
		return name || user?.properties?.email || this.principalId(row);
	}
	canDeactivate(): boolean {
		return !this.busy();
	}
}
