import { toObservable } from '@angular/core/rxjs-interop';
import { builtinAggregationLabel } from 'app/helpers/builtin-aggregation-labels';
import { principalLabel } from 'app/modules/shared/components/user-tag/user-tag.component';
import { WebUiIconComponent } from '@maretha/webui-sdk';
import { inject as injectQuickMessages } from '@angular/core';
import { WebUiMessages as QuickFilterMessages } from '@maretha/webui-sdk';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';
import { SuggestionEscapeDirective } from 'app/directives/suggestion-escape.directive';
import { suggestionLimits, suggestionTerms, WebUiMessagePipe } from '@maretha/webui-sdk';
import { SuggestionLimitsDirective } from 'app/directives/suggestion-limits.directive';
import {
	ChangeDetectorRef,
	Component,
	DestroyRef,
	ElementRef,
	inject,
	input,
	OnDestroy,
	ViewChild,
	ChangeDetectionStrategy,
} from '@angular/core';
import {
	FormControl,
	FormGroup,
	UntypedFormBuilder,
	UntypedFormGroup,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import {
	DocumentSearchService,
	IPageProviderAggregation,
	IPageProviderFields,
	IQuickFilters,
	ISavedSearch,
	isDefaultSearchUrl,
	SearchCollection,
} from 'app/modules/search/helpers/document-search.service';
import { animations } from 'app/shared.constants';
import { ToastService } from 'app/helpers/toast.service';
import {
	EMPTY,
	debounceTime,
	distinctUntilChanged,
	catchError,
	filter,
	finalize,
	map,
	of,
	Subject,
	switchMap,
	takeUntil,
	tap,
} from 'rxjs';
import 'prismjs';
import 'prismjs/components/prism-sql';
import {
	BsDropdownDirective,
	BsDropdownToggleDirective,
	BsDropdownMenuDirective,
} from 'ngx-bootstrap/dropdown';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AutofocusDirective } from '../../../../directives/autofocus.directive';
import {
	NgSelectComponent,
	NgOptionTemplateDirective,
	NgLabelTemplateDirective,
	NgMultiLabelTemplateDirective,
} from '@ng-select/ng-select';
import { ButtonCheckboxDirective } from 'ngx-bootstrap/buttons';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { SlicePipe, KeyValuePipe } from '@angular/common';
import { SearchQueueComponent } from '../search-queue/search-queue.component';
import { SearchQueueService } from '../../helpers/search-queue.service';
import { hasPermission } from 'app/helpers/document-permissions';
import { Validators } from '@angular/forms';
import {
	REPOSITORY_SEARCH,
	type CompiledSearchDefinition,
} from '../../helpers/repository-search-definitions';
declare let Prism: any;

@Component({
	selector: 'nx-search',
	templateUrl: './search-pane.component.html',
	styleUrls: [
		'./search-pane.component.scss',
		'./default-search-form.scss',
		'./saved-search-dialogs.scss',
	],
	animations: [
		animations.horizontalInOutAnimation,
		animations.itemsAnimation,
		animations.listAnimation,
	],
	imports: [
		WebUiIconComponent,
		LocalizedSelectDirective,
		SuggestionEscapeDirective,
		FormsModule,
		ReactiveFormsModule,
		BsDropdownDirective,
		BsDropdownToggleDirective,
		FontAwesomeModule,
		BsDropdownMenuDirective,
		AutofocusDirective,
		NgSelectComponent,
		NgOptionTemplateDirective,
		NgLabelTemplateDirective,
		NgMultiLabelTemplateDirective,
		ButtonCheckboxDirective,
		TooltipDirective,
		SlicePipe,
		KeyValuePipe,
		TranslateModule,
		SearchQueueComponent,
		WebUiMessagePipe,
		SuggestionLimitsDirective,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchComponent implements OnDestroy {
	readonly definition = input<CompiledSearchDefinition>(REPOSITORY_SEARCH.default);
	private readonly quickMessages = injectQuickMessages(QuickFilterMessages);

	private readonly destroy$ = new Subject();
	private readonly destroyRef = inject(DestroyRef);
	private nxqlQueryDefaultValue =
		"SELECT *\nFROM Document\nWHERE NOT (ecm:path STARTSWITH '/maretha')\nAND ecm:isProxy = 0\nAND ecm:isVersion = 0\nAND ecm:isTrashed = 0";
	private ampRegex = new RegExp('&', 'g');
	private ltRegex = new RegExp('<', 'g');

	@ViewChild('textarea') textareaElement: ElementRef | undefined;
	@ViewChild('pre') preElement: ElementRef | undefined;
	@ViewChild('queryParams') queryParamsElement: ElementRef | undefined;
	searchPaneOpen = false;
	readonly savedSearchesForm: UntypedFormGroup;
	parentSearchForm?: UntypedFormGroup | undefined;
	currentPageProviderKey = this.documentSearchService.currentPageProviderKey;
	fields: IPageProviderFields = {};
	customFilters: Record<string, IPageProviderAggregation> = {};
	quickFilters: IQuickFilters | undefined;
	collections: readonly SearchCollection[] = [];
	tagSuggestions: readonly SearchTag[] = [];
	tagsLoading = false;
	readonly tagLimits = suggestionLimits('tag', () => 'ecm:tag');
	readonly tagInput$ = new Subject<string>();
	savedSearches: any[] | undefined;
	private readonly route = inject(ActivatedRoute);
	private localSelectedSavedSearch: ISavedSearch | undefined;
	get selectedSavedSearch(): ISavedSearch | undefined {
		return this.documentSearchService.selectedSavedSearch?.() ?? this.localSelectedSavedSearch;
	}
	set selectedSavedSearch(value: ISavedSearch | undefined) {
		if (value === this.localSelectedSavedSearch) return;
		this.localSelectedSavedSearch = value;
		this.documentSearchService.selectedSavedSearch?.set(value);
		this.loadSavedSearchPermissions(value);
	}
	@ViewChild('saveDialog') saveDialog: ElementRef<HTMLDialogElement> | undefined;
	@ViewChild('renameDialog') renameDialog: ElementRef<HTMLDialogElement> | undefined;
	@ViewChild('shareDialog') shareDialog: ElementRef<HTMLDialogElement> | undefined;
	@ViewChild('deleteDialog') deleteDialog: ElementRef<HTMLDialogElement> | undefined;
	/** Which saved-search dialog is open; mirrors the native dialogs for tests and templates. */
	savedSearchDialog: 'save' | 'rename' | 'share' | 'delete' | null = null;
	private readonly savedSearchStatusMessageState = localizedText();
	get savedSearchStatus(): string {
		return this.savedSearchStatusMessageState();
	}
	set savedSearchStatus(value: string | MessageText) {
		this.savedSearchStatusMessageState.set(value);
	}
	private readonly savedSearchErrorMessageState = localizedText();
	get savedSearchError(): string {
		return this.savedSearchErrorMessageState();
	}
	set savedSearchError(value: string | MessageText) {
		this.savedSearchErrorMessageState.set(value);
	}
	savingSavedSearch = false;
	sharePrincipal = '';
	shareNotify = false;
	autoSearch = true;
	readonly coreFacets = [
		'dc_modified_agg',
		'dc_nature_agg',
		'dc_subjects_agg',
		'dc_coverage_agg',
		'common_size_agg',
	];
	pageProviders: any = {};
	loading = false;
	private lastAutoSnapshot: string | null = null;
	readonly queueActive = this.searchQueue.active;
	private savedSearchGeneration = 0;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly fb: UntypedFormBuilder,
		private readonly documentSearchService: DocumentSearchService,
		private readonly toastrService: ToastService,
		private readonly translateService: TranslateService,
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly router: Router,
		private readonly cdr: ChangeDetectorRef,
		private readonly searchQueue: SearchQueueService,
	) {
		this.setupForm();
		(this.documentSearchService.saveAsRequested$ ?? EMPTY)
			.pipe(takeUntil(this.destroy$))
			.subscribe(() => this.openSavedSearchDialog('save'));
		if (this.documentSearchService.saveAsOpen)
			toObservable(this.documentSearchService.saveAsOpen)
				.pipe(takeUntil(this.destroy$))
				.subscribe((open) => {
					if (open) {
						this.documentSearchService.saveAsOpen.set(false);
						this.openSavedSearchDialog('save');
					}
				});
		if (this.documentSearchService.savedSearchAction)
			toObservable(this.documentSearchService.savedSearchAction)
				.pipe(takeUntil(this.destroy$))
				.subscribe((action) => {
					if (!action) return;
					this.documentSearchService.savedSearchAction.set(null);
					if (action === 'saveAs') this.openSavedSearchDialog('save');
					else if (action === 'save') this.overwriteSavedSearch();
					else if (this.selectedSavedSearch) this.openSavedSearchDialog(action);
				});
		this.tagInput$
			.pipe(
				takeUntil(this.destroy$),
				suggestionTerms(this.tagLimits),
				map((term) => term?.trim() ?? null),
				distinctUntilChanged(),
				tap((term) => (this.tagsLoading = !!term)),
				switchMap((term) =>
					term
						? this.documentsManagerService.suggestTag(term).pipe(catchError(() => of([])))
						: of([]),
				),
			)
			.subscribe((response: unknown) => {
				this.tagSuggestions = Array.isArray(response)
					? response.flatMap((tag): SearchTag[] => {
							const value = tag as { id?: unknown; displayLabel?: unknown };
							return typeof value?.id === 'string'
								? [{ id: value.id, label: String(value.displayLabel ?? value.id) }]
								: [];
						})
					: [];
				this.tagsLoading = false;
				this.cdr.markForCheck();
			});

		documentSearchService.pageProvidersUpdated$.pipe(takeUntil(this.destroy$)).subscribe((x) => {
			this.pageProviders = Object.fromEntries(Object.entries(x).filter(([key]) => x[key].enabled));
			this.cdr.markForCheck();
		});

		// The drawer is created when it opens: its form starts from the provider selected now and
		// follows later selections. Facets arrive with each page-provider response.
		if (this.currentPageProviderKey) this.usePageProvider(this.currentPageProviderKey);
		this.documentSearchService.pageProviderChanged$
			.pipe(takeUntil(this.destroy$))
			.subscribe((x) => {
				this.usePageProvider(x.key);
				this.cdr.markForCheck();
			});

		this.documentSearchService.pageProviderUpdated$
			.pipe(takeUntil(this.destroy$))
			.subscribe((x) => {
				this.applyFacets(x);
				this.cdr.markForCheck();
			});

		// A saved search selected elsewhere (the results page restoring the one its URL names) is
		// mirrored into the form; the page already published its criteria.
		if (this.documentSearchService.selectedSavedSearch)
			toObservable(this.documentSearchService.selectedSavedSearch)
				.pipe(takeUntil(this.destroy$))
				.subscribe((saved) => this.mirrorSelectedSavedSearch(saved));

		// Stock fetches the form's provider when the drawer opens. The service sends nothing when a
		// results view or a request for the same query already supplies the facets.
		documentSearchService.searchPaneVisibilityChanged$
			.pipe(
				takeUntil(this.destroy$),
				filter((visible) => visible && !this.queueActive()),
				switchMap(() => this.documentSearchService.loadFilters?.() ?? EMPTY),
			)
			.subscribe();

		documentSearchService.searchPaneVisibilityChanged$
			.pipe(takeUntil(this.destroy$))
			.subscribe((x) => {
				this.searchPaneOpen = x;
				this.cdr.markForCheck();
			});

		documentSearchService.fetchingDocuments$
			.pipe(
				takeUntil(this.destroy$),
				filter(() => this.searchPaneOpen),
			)
			.subscribe((x) => {
				this.loading = x;
				this.cdr.markForCheck();
			});

		documentsManagerService.documentFetched$
			.pipe(
				takeUntil(this.destroy$),
				filter(() => this.searchPaneOpen),
			)
			.subscribe((document: any) => {
				// Opening a result hides the filters unless the queue keeps the results beside it.
				if (document && !document.ng?.isFolder && !this.searchQueue.active())
					this.closeSearchPane();
			});

		this.savedSearchesForm = this.fb.group({
			title: ['', [Validators.required, Validators.pattern(/^[^/]*$/)]],
		});
	}

	// --------------------------------------------------------------------------------------------------
	closeSearchPane() {
		this.searchQueue.close();
		this.documentSearchService.hideSearchPaneVisibility();
	}

	openQueue(): void {
		this.searchQueue.open();
		this.cdr.markForCheck();
	}

	quickFilterLabel(key: string): string {
		return (
			{
				nofolder: this.quickMessages.text('search.quick.nofolder', 'No Containers'),
				mostrecent: this.quickMessages.text('search.quick.mostrecent', 'Most Recent'),
				onlyvalidated: this.quickMessages.text('search.quick.onlyvalidated', 'Validated'),
			}[key.replace(/[^a-z]/gi, '').toLowerCase()] ?? key
		);
	}

	/** Publishes the form as the search parameters, then shows the results page for them. */
	search(): void {
		if (!this.parentSearchForm || this.currentPageProviderKey === 'nxql_search') return;
		const parameters = this.parentSearchForm.getRawValue();
		this.lastAutoSnapshot = this.nonTextSnapshot(parameters);
		this.publishSearchParameters(parameters);
		this.showResults();
	}

	/** Routes to the results page naming the selected saved search, unless the URL already does. */
	private showResults(): void {
		const selectedId = this.selectedSavedSearch?.id ?? null;
		if (this.isDefaultSearchRoute() && this.requestedSavedSearchId() === selectedId) return;
		void this.router.navigate(selectedId ? ['/search/default', selectedId] : ['/search/default']);
	}

	/** Rebuilds the form for a page provider and fetches the lists the form offers. */
	private usePageProvider(key: string): void {
		this.savedSearchGeneration++;
		this.currentPageProviderKey = key;

		this.fields = {};
		this.customFilters = {};
		this.quickFilters = {};

		this.resetForm();
		this.setupFormSearchFields();
		if (key === 'default_search') this.loadCollections();

		if (key === 'nxql_search') {
			this.parentSearchForm?.get('local')?.setValue(false, { emitEvent: false });
			this.parentSearchForm?.get('local')?.disable({ emitEvent: false });
		} else {
			this.parentSearchForm?.get('local')?.setValue(false, { emitEvent: false });
			this.parentSearchForm?.get('local')?.enable({ emitEvent: false });
		}
		this.applyFacets(key);
		this.savedSearches = undefined;
		this.loadSavedSearches();
		this.mirrorSelectedSavedSearch(this.documentSearchService.selectedSavedSearch?.());
		// Initial values are the comparison baseline, not a user action that submits a search.
		this.lastAutoSnapshot = this.nonTextSnapshot(this.parentSearchForm!.getRawValue());
		this.syncFormState();
	}

	/** Facets and quick filters from the provider's latest response. */
	private applyFacets(key: string): void {
		const provider = this.documentSearchService.pageProviders[key];
		if (!provider) return;
		this.setupFormCustomFilters();
		this.setupFormQuickFilters();
		this.fields = provider.fields;
		this.customFilters = provider.aggregations;
		this.quickFilters = provider.quickFilters;
	}

	private loadSavedSearches(): void {
		const generation = this.savedSearchGeneration;
		this.documentSearchService
			.getSavedSearches()
			.pipe(
				takeUntil(this.destroy$),
				catchError(() => of([])),
			)
			.subscribe((x) => {
				if (generation !== this.savedSearchGeneration) return;
				this.savedSearches = x || [];
				this.cdr.markForCheck();
			});
	}

	private mirrorSelectedSavedSearch(saved: ISavedSearch | undefined): void {
		if (saved?.id === this.localSelectedSavedSearch?.id) return;
		if (saved) this.restoreSavedSearch(saved);
		else {
			this.parentSearchForm?.reset({ local: false }, { emitEvent: false });
			this.localSelectedSavedSearch = undefined;
			this.loadSavedSearchPermissions(undefined);
			this.savedSearchStatus = '';
			this.lastAutoSnapshot = this.nonTextSnapshot(this.parentSearchForm!.getRawValue());
			this.syncFormState();
		}
		this.cdr.markForCheck();
	}

	/** Form value with free-text fields removed, serialized for change comparison. */
	private nonTextSnapshot(value: any): string {
		const textKeys = new Set(['ecm_fulltext']);
		for (const [key, field] of Object.entries(this.fields ?? {}))
			if ((field as any)?.type === 'string') textKeys.add(key);
		const meaningful = ([key, item]: [string, any]) =>
			!textKeys.has(key) &&
			item != null &&
			item !== false &&
			item !== '' &&
			(!Array.isArray(item) || item.length > 0);
		const groups: Record<string, unknown> = {};
		for (const groupName of ['searchFields', 'customFilters', 'quickFilters'])
			groups[groupName] = Object.fromEntries(
				Object.entries(value?.[groupName] ?? {}).filter(meaningful),
			);
		return JSON.stringify({
			local: value?.local ?? false,
			queryParams: value?.queryParams ?? null,
			...groups,
		});
	}

	private isDefaultSearchRoute(): boolean {
		return isDefaultSearchUrl(this.router.url);
	}

	/**
	 * The saved search named by the current URL. The drawer is not a routed component, so its
	 * injected `ActivatedRoute` is the root route and never carries `savedSearchId`; the router
	 * URL is read first and the route parameter kept as a fallback for routed hosts.
	 */
	private requestedSavedSearchId(): string | null {
		const match = /^\/search\/default\/([^/]+)$/.exec(this.router.url.split(/[?#]/, 1)[0]);
		if (match) {
			try {
				return decodeURIComponent(match[1]);
			} catch {
				return match[1];
			}
		}
		return this.route.snapshot.paramMap.get('savedSearchId');
	}

	private loadCollections(): void {
		this.documentSearchService
			.getUserCollections()
			.pipe(
				takeUntil(this.destroy$),
				catchError(() => of([])),
			)
			.subscribe((collections) => {
				this.collections = collections;
				this.cdr.markForCheck();
			});
	}

	// --------------------------------------------------------------------------------------------------
	useSearchProvider(searchProviderKey: any) {
		if (this.currentPageProviderKey === searchProviderKey) return;

		if (searchProviderKey === 'nxql_search') {
			this.parentSearchForm!.get('queryParams')?.setValue(this.nxqlQueryDefaultValue);
			setTimeout(() => {
				if (!this.destroyRef.destroyed) this.syncQueryParamsValue();
			});
		} else this.parentSearchForm!.get('queryParams')?.setValue(null);

		this.setupFormSearchFields();

		this.documentSearchService
			.useSearchProvider(searchProviderKey)
			.pipe(
				switchMap(() => this.documentSearchService.loadFilters?.() ?? EMPTY),
				takeUntil(this.destroy$),
			)
			.subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	/** Stock "Save As": always creates a new saved search from the current criteria. */
	saveSearch() {
		const title = String(this.savedSearchesForm.getRawValue().title || '').trim();
		if (this.savingSavedSearch || !title || !this.parentSearchForm) return;
		const params = this.savedSearchParams();
		const generation = this.savedSearchGeneration;
		this.savingSavedSearch = true;
		this.savedSearchError = '';
		this.documentSearchService
			.saveSearch(title, params)
			.pipe(
				takeUntil(this.destroy$),
				finalize(() => {
					this.savingSavedSearch = false;
					this.cdr.markForCheck();
				}),
			)
			.subscribe({
				next: (x: ISavedSearch) => {
					if (generation !== this.savedSearchGeneration) return;
					this.toastrService.success(
						this.translateService.instant('search.searchFieldsSavedAck', { title }),
						this.translateService.instant('search.searchFieldsSaved'),
					);

					this.savedSearchesForm.reset();
					this.closeSavedSearchDialog();

					// New array: ng-select resolves the bound id against the items it was given.
					this.savedSearches = [...(this.savedSearches ?? []), { id: x.id, title, params }].sort(
						(a, b) => a.title.localeCompare(b.title),
					);
					this.selectedSavedSearch = this.savedSearches!.find((saved) => saved.id === x.id);
					this.parentSearchForm?.markAsPristine();
					this.syncFormState();
					this.showResults();
					this.savedSearchStatus = messageText('app.state.saved-value-79e8db', 'Saved {value0}.', {
						value0: title,
					});
					this.cdr.markForCheck();
				},
				error: () => {
					this.savedSearchError = messageText(
						'app.state.unable-to-save-this-search-check-your-permiss-a7bdca',
						'Unable to save this search. Check your permissions and retry.',
					);
				},
			});
	}

	/** Changes only the title; the saved criteria stay as they were. */
	renameSavedSearch() {
		const selected = this.selectedSavedSearch;
		const title = String(this.savedSearchesForm.getRawValue().title || '').trim();
		if (this.savingSavedSearch || !selected || !title || title === selected.title) return;
		const generation = this.savedSearchGeneration;
		this.savingSavedSearch = true;
		this.savedSearchError = '';
		this.documentSearchService
			.updateSavedSearch(selected, title, selected.params)
			.pipe(
				takeUntil(this.destroy$),
				finalize(() => {
					this.savingSavedSearch = false;
					this.cdr.markForCheck();
				}),
			)
			.subscribe({
				next: (saved) => {
					if (generation !== this.savedSearchGeneration) return;
					this.savedSearches = this.savedSearches!.map((entry) =>
						entry.id === selected.id ? { ...entry, ...saved, title } : entry,
					);
					this.localSelectedSavedSearch = this.savedSearches.find(
						(entry) => entry.id === selected.id,
					);
					this.documentSearchService.selectedSavedSearch?.set(this.localSelectedSavedSearch);
					this.closeSavedSearchDialog();
					this.savedSearchStatus = messageText(
						'app.state.renamed-value-2f1c7a',
						'Renamed to {value0}.',
						{ value0: title },
					);
					this.cdr.markForCheck();
				},
				error: () => {
					this.savedSearchError = messageText(
						'app.state.unable-to-rename-this-search-check-your-permi-5d0b3c',
						'Unable to rename this search. Check your permissions and retry.',
					);
				},
			});
	}
	overwriteSavedSearch() {
		const selected = this.selectedSavedSearch;
		const title = String(selected?.title || '').trim();
		if (this.savingSavedSearch || !selected || !title) return;
		const generation = this.savedSearchGeneration;
		this.savingSavedSearch = true;
		this.savedSearchError = '';
		this.documentSearchService
			.updateSavedSearch(selected, title, this.savedSearchParams())
			.pipe(
				takeUntil(this.destroy$),
				finalize(() => {
					this.savingSavedSearch = false;
					this.cdr.markForCheck();
				}),
			)
			.subscribe({
				next: (saved) => {
					if (generation !== this.savedSearchGeneration) return;
					this.savedSearches = this.savedSearches!.map((entry) =>
						entry.id === selected.id ? { ...entry, ...saved, title } : entry,
					);
					this.localSelectedSavedSearch = this.savedSearches.find(
						(entry) => entry.id === selected.id,
					);
					this.documentSearchService.selectedSavedSearch?.set(this.localSelectedSavedSearch);
					this.parentSearchForm?.markAsPristine();
					this.syncFormState();
					this.savedSearchStatus = messageText(
						'app.state.updated-value-064850',
						'Updated {value0}.',
						{ value0: title },
					);
					this.cdr.markForCheck();
				},
				error: () => {
					this.savedSearchError = messageText(
						'app.state.unable-to-update-this-search-check-your-permi-a85910',
						'Unable to update this search. Check your permissions and retry.',
					);
				},
			});
	}

	shareSavedSearch() {
		const selected = this.selectedSavedSearch;
		const principal = this.sharePrincipal.trim();
		if (this.savingSavedSearch || !selected || !principal || /[\r\n]/.test(principal)) {
			this.sharePrincipal = '';
			this.savedSearchError = messageText(
				'app.state.enter-one-user-or-group-name-without-line-bre-88f55c',
				'Enter one user or group name without line breaks.',
			);
			return;
		}
		const savedSearchId = selected.id;
		const notify = this.shareNotify;
		this.savingSavedSearch = true;
		this.savedSearchError = '';
		this.documentSearchService
			.getSavedSearchPermissions(savedSearchId)
			.pipe(
				switchMap((document) => {
					if (!hasPermission(document, 'WriteSecurity'))
						throw new Error('You do not have permission to share this saved search.');
					return this.documentSearchService.shareSavedSearch(savedSearchId, principal, notify);
				}),
				takeUntil(this.destroy$),
				finalize(() => {
					this.savingSavedSearch = false;
					this.cdr.markForCheck();
				}),
			)
			.subscribe({
				next: () => {
					this.sharePrincipal = '';
					this.shareNotify = false;
					this.closeSavedSearchDialog();
					this.savedSearchStatus = messageText(
						'app.state.granted-read-access-to-value-740215',
						'Granted Read access to {value0}.',
						{ value0: principal },
					);
				},
				error: () => {
					this.savedSearchError = messageText(
						'app.state.unable-to-share-this-search-you-need-permissi-ef6a3e',
						'Unable to share this search. You need permission to manage it.',
					);
				},
			});
	}

	// --------------------------------------------------------------------------------------------------
	restoreSavedSearch(savedSearch: ISavedSearch) {
		if (
			!savedSearch ||
			!this.parentSearchForm ||
			!savedSearch.params ||
			typeof savedSearch.params !== 'object'
		) {
			this.savedSearchError = messageText(
				'app.state.this-saved-search-has-invalid-parameters-b85643',
				'This saved search has invalid parameters.',
			);
			return;
		}

		this.parentSearchForm!.reset(
			{
				local: savedSearch.params.local ?? false,
			},
			{ emitEvent: false },
		);

		let group = this.parentSearchForm!.get('searchFields') as FormGroup;
		for (const control in group.controls)
			group.get(control)?.setValue(savedSearch.params[control], { emitEvent: false });

		group = this.parentSearchForm!.get('customFilters') as FormGroup;
		for (const control in group.controls)
			if (Object.prototype.hasOwnProperty.call(group.controls, control))
				if (savedSearch.params[control]?.length)
					group.get(control)?.setValue(savedSearch.params[control], { emitEvent: false });

		const quickFilters: string[] =
			typeof savedSearch.params.quickFilters === 'string'
				? savedSearch.params.quickFilters.split(',')
				: [];
		group = this.parentSearchForm!.get('quickFilters') as FormGroup;
		for (const control in group.controls)
			if (Object.prototype.hasOwnProperty.call(group.controls, control)) {
				const quickFilter = quickFilters.find((x) => x === control);

				if (quickFilter) group.get(control)?.setValue(true, { emitEvent: false });
			}

		this.parentSearchForm?.markAsPristine();
		this.selectedSavedSearch = savedSearch;
		this.lastAutoSnapshot = this.nonTextSnapshot(this.parentSearchForm.getRawValue());
		this.syncFormState();
		this.savedSearchStatus = messageText('app.state.restored-value-b065a7', 'Restored {value0}.', {
			value0: savedSearch.title,
		});
	}

	// --------------------------------------------------------------------------------------------------
	deleteSavedSearch(savedSearch: ISavedSearch) {
		if (!savedSearch || this.savingSavedSearch) return;
		this.savingSavedSearch = true;
		this.savedSearchError = '';

		this.documentSearchService
			.deleteSavedSearch(savedSearch.id)
			.pipe(
				takeUntil(this.destroy$),
				finalize(() => {
					this.savingSavedSearch = false;
					this.cdr.markForCheck();
				}),
			)
			.subscribe({
				next: () => {
					this.savedSearches = this.savedSearches!.filter((x) => x.id !== savedSearch.id);
					this.closeSavedSearchDialog();
					if (this.selectedSavedSearch?.id === savedSearch.id) {
						this.savedSearchesForm.reset();
						this.clearForm();
					}
					this.savedSearchStatus = messageText(
						'app.state.deleted-value-93c1b6',
						'Deleted {value0}.',
						{ value0: savedSearch.title },
					);
					this.cdr.markForCheck();

					this.toastrService.info(
						this.translateService.instant('search.savedSearchRemovedAck', {
							title: savedSearch.title,
						}),
						this.translateService.instant('search.searchFieldsRemoved'),
					);
				},
				error: () => {
					this.savedSearchError = messageText(
						'app.state.unable-to-delete-this-search-check-your-permi-4ab2af',
						'Unable to delete this search. Check your permissions and retry.',
					);
				},
			});
	}

	// --------------------------------------------------------------------------------------------------
	clearForm() {
		this.parentSearchForm?.reset(
			{
				local: false,
			},
			{ emitEvent: false },
		);
		this.selectedSavedSearch = undefined;
		this.savedSearchStatus = '';
		this.syncFormState();
		this.search();
	}

	// --------------------------------------------------------------------------------------------------
	// Saved-search dialogs (stock opens Save As / Rename / Share / Delete as modal dialogs from the
	// results header; the drawer only hosts them).
	openSavedSearchDialog(kind: 'save' | 'rename' | 'share' | 'delete'): void {
		this.savedSearchError = '';
		if (kind === 'save') this.savedSearchesForm.reset({ title: '' });
		else if (kind === 'rename')
			this.savedSearchesForm.reset({ title: this.selectedSavedSearch?.title ?? '' });
		this.savedSearchDialog = kind;
		this.cdr.markForCheck();
		const dialog = this.dialogFor(kind)?.nativeElement;
		if (dialog && !dialog.open) dialog.showModal();
	}

	closeSavedSearchDialog(): void {
		for (const kind of ['save', 'rename', 'share', 'delete'] as const) {
			const dialog = this.dialogFor(kind)?.nativeElement;
			if (dialog?.open) dialog.close();
		}
		this.savedSearchDialog = null;
		this.cdr.markForCheck();
	}

	private dialogFor(kind: 'save' | 'rename' | 'share' | 'delete') {
		return kind === 'save'
			? this.saveDialog
			: kind === 'rename'
				? this.renameDialog
				: kind === 'share'
					? this.shareDialog
					: this.deleteDialog;
	}

	/** Mirrors the form's dirty flag to the shared signal the results header reads. */
	private syncFormState(): void {
		this.documentSearchService.searchFormDirty?.set(!!this.parentSearchForm?.dirty);
	}

	/** Stock shows Save / Rename / Share / Delete only with WriteProperties on the saved search. */
	private loadSavedSearchPermissions(saved: ISavedSearch | undefined): void {
		const writable = this.documentSearchService.savedSearchWritable;
		if (!writable) return;
		if (!saved) {
			writable.set(false);
			return;
		}
		this.documentSearchService
			.getSavedSearchPermissions(saved.id)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (document) =>
					writable.set(
						this.selectedSavedSearch?.id === saved.id && hasPermission(document, 'WriteProperties'),
					),
				error: () => writable.set(false),
			});
	}

	private savedSearchParams(): any {
		const rawValues = this.parentSearchForm!.getRawValue();
		const params: any = { local: rawValues.local };
		for (const rawKey in rawValues.searchFields)
			if (Object.prototype.hasOwnProperty.call(rawValues.searchFields, rawKey))
				if (rawValues.searchFields[rawKey]) params[rawKey] = rawValues.searchFields[rawKey];
		for (const rawKey in rawValues.customFilters)
			if (Object.prototype.hasOwnProperty.call(rawValues.customFilters, rawKey))
				if (rawValues.customFilters[rawKey]?.length)
					params[rawKey] = rawValues.customFilters[rawKey];
		const quickFilters: string[] = [];
		for (const rawKey in rawValues.quickFilters)
			if (Object.prototype.hasOwnProperty.call(rawValues.quickFilters, rawKey))
				if (rawValues.quickFilters[rawKey]) quickFilters.push(rawKey);
		params.quickFilters = quickFilters.join(',');
		return params;
	}

	// --------------------------------------------------------------------------------------------------
	runNxqlQuery() {
		this.documentSearchService.searchParameters = {
			...this.documentSearchService.searchParameters,
			queryParams: this.parentSearchForm!.get('queryParams')?.value,
		};
		this.showResults();
	}

	// --------------------------------------------------------------------------------------------------
	syncQueryParamsScroll(event: any) {
		this.preElement!.nativeElement.scrollTop = event.srcElement.scrollTop;
		this.preElement!.nativeElement.scrollLeft = event.srcElement.scrollLeft;
	}

	// --------------------------------------------------------------------------------------------------
	checkQueryParamsTab(event: any) {
		if (event.key !== 'Tab') return;

		event.preventDefault();

		const element = this.textareaElement!.nativeElement;
		const code = element.value;

		const before_tab = code.slice(0, element.selectionStart); // text before tab
		const after_tab = code.slice(element.selectionEnd, element.value.length); // text after tab
		const cursor_pos = element.selectionEnd + 1; // where cursor moves after tab - moving forward by 1 char to after tab
		element.value = before_tab + '\t' + after_tab; // add tab char
		// move cursor
		element.selectionStart = cursor_pos;
		element.selectionEnd = cursor_pos;

		this.parentSearchForm!.get('queryParams')!.setValue(element.value);
	}

	// --------------------------------------------------------------------------------------------------
	syncQueryParamsValue() {
		let text = this.textareaElement!.nativeElement.value;

		// If the last character is a newline character
		if (text && text[text.length - 1] === '\n') text += ' '; // Add a placeholder space character to the final line

		this.queryParamsElement!.nativeElement.innerHTML = text
			? text.replace(this.ampRegex, '&amp;').replace(this.ltRegex, '<')
			: '';
		Prism.highlightElement(this.queryParamsElement!.nativeElement);
	}

	// --------------------------------------------------------------------------------------------------
	get quickFiltersFormGroup() {
		return this.parentSearchForm!.get('quickFilters') as FormGroup;
	}

	// --------------------------------------------------------------------------------------------------
	private setupForm() {
		this.parentSearchForm = this.fb.group({
			local: this.fb.control(false),
			searchFields: this.fb.group({}),
			customFilters: this.fb.group({}),
			quickFilters: this.fb.group({}),
			queryParams: this.fb.control(null),
		});

		// Trigger a new search
		this.parentSearchForm!.valueChanges.pipe(
			takeUntil(this.destroy$),
			distinctUntilChanged(),
			debounceTime(this.parentSearchForm.pristine ? 100 : 600),
		).subscribe((changes) => {
			this.syncFormState();
			if (!this.autoSearch) return;
			// Typing in a text field never searches by itself; those fields submit on Enter.
			const snapshot = this.nonTextSnapshot(changes);
			if (snapshot === this.lastAutoSnapshot) return;
			this.lastAutoSnapshot = snapshot;
			if (this.isDefaultSearchRoute()) this.publishSearchParameters(changes);
			else if (this.parentSearchForm?.dirty) void this.search();
		});
	}

	private publishSearchParameters(changes: any): void {
		if (this.currentPageProviderKey === 'nxql_search') return;

		const searchParameters: any = {
			location: changes.local ? this.documentsManagerService.documentInfo?.path : undefined,
		};

		// Loop through the form groups we're interested in and keep only the children that have a value
		for (const groupName of ['searchFields', 'customFilters', 'quickFilters'])
			if (changes[groupName])
				searchParameters[groupName] = Object.entries(changes[groupName])
					.filter(
						([_, value]) =>
							value != null &&
							value !== false &&
							value !== '' &&
							(!Array.isArray(value) || value.length > 0),
					)
					.reduce((result: any, [key, value]) => {
						result[key] = value;
						return result;
					}, {});

		this.documentSearchService.searchParameters = searchParameters;
	}

	// --------------------------------------------------------------------------------------------------
	private resetForm() {
		for (const formGroupName of ['searchFields', 'customFilters', 'quickFilters']) {
			const formGroup = this.parentSearchForm?.get(formGroupName) as FormGroup;

			if (!formGroup) continue;

			// Remove all of the group's children
			for (const field in formGroup.controls)
				if (Object.prototype.hasOwnProperty.call(formGroup.controls, field))
					formGroup.removeControl(field, { emitEvent: false });
		}
	}

	// --------------------------------------------------------------------------------------------------
	private setupFormSearchFields() {
		if (this.currentPageProviderKey === 'default_search')
			(this.parentSearchForm!.get('customFilters') as FormGroup).addControl(
				'dc_creator_agg',
				new FormControl([]),
				{ emitEvent: false },
			);
		const pageProvider = this.documentSearchService.pageProviders[this.currentPageProviderKey!];

		const pageProviderFormGroup = this.parentSearchForm!.get('searchFields') as FormGroup;

		for (const fieldName in pageProvider.fields)
			if (Object.prototype.hasOwnProperty.call(pageProvider.fields, fieldName))
				pageProviderFormGroup.addControl(
					fieldName,
					this.fb.control(pageProvider.fields[fieldName].value, { initialValueIsDefault: true }),
					{ emitEvent: false },
				);
	}

	// --------------------------------------------------------------------------------------------------
	private setupFormCustomFilters() {
		const aggregations =
			this.documentSearchService.pageProviders[this.currentPageProviderKey!]?.aggregations ?? {};

		const pageProviderFormGroup = this.parentSearchForm!.get('customFilters') as FormGroup;

		for (const key in aggregations)
			if (Object.prototype.hasOwnProperty.call(aggregations, key))
				pageProviderFormGroup.addControl(
					key,
					new FormControl(aggregations[key].selection, { initialValueIsDefault: true }),
					{ emitEvent: false },
				);
	}

	// --------------------------------------------------------------------------------------------------
	private setupFormQuickFilters() {
		const quickFilters =
			this.documentSearchService.pageProviders[this.currentPageProviderKey!]?.quickFilters ?? {};

		const quickFiltersFormGroup = this.parentSearchForm!.get('quickFilters') as FormGroup;

		for (const key in quickFilters)
			if (Object.prototype.hasOwnProperty.call(quickFilters, key)) {
				if (quickFiltersFormGroup.get(key))
					quickFiltersFormGroup.get(key)!.setValue(quickFilters[key], { emitEvent: false });
				else
					quickFiltersFormGroup.addControl(
						key,
						this.fb.control(quickFilters[key], { initialValueIsDefault: true }),
						{ emitEvent: false },
					);
			}
	}

	coreFacetLabel(key: string): string {
		return this.quickMessages.text(
			(
				{
					dc_modified_agg: 'defaultSearch.modifiedDate',
					dc_nature_agg: 'defaultSearch.nature',
					dc_subjects_agg: 'defaultSearch.subject',
					dc_coverage_agg: 'defaultSearch.coverage',
					common_size_agg: 'defaultSearch.size',
				} as Record<string, string>
			)[key],
			(
				{
					dc_modified_agg: 'Modification Date',
					dc_nature_agg: 'Nature',
					dc_subjects_agg: 'Subjects',
					dc_coverage_agg: 'Coverage',
					common_size_agg: 'Size',
				} as Record<string, string>
			)[key],
		);
	}
	// Memoized per aggregation object: ng-select rebuilds its options whenever `[items]` changes
	// identity, which with a fresh array per change detection made option clicks land on a
	// replaced element and never select.
	private readonly bucketCache = new WeakMap<
		object,
		{ key: string; label: string; count: number }[]
	>();
	coreBuckets(key: string): { key: string; label: string; count: number }[] {
		const aggregation = this.customFilters[key];
		if (!aggregation) return [];
		const cached = this.bucketCache.get(aggregation);
		if (cached) return cached;
		const result = this.computeBuckets(key, aggregation);
		this.bucketCache.set(aggregation, result);
		return result;
	}
	private computeBuckets(
		key: string,
		aggregation: IPageProviderAggregation,
	): { key: string; label: string; count: number }[] {
		return (aggregation.buckets ?? []).map((bucket: any) => {
			const raw: any = bucket.key;
			const id = String(raw?.id ?? raw);
			const builtin = builtinAggregationLabel(key, id);
			return {
				key: id,
				label: builtin.labelKey
					? this.quickMessages.text(builtin.labelKey, builtin.label ?? id)
					: this.bucketLabel(id, bucket.fetchedKey ?? (typeof raw === 'object' ? raw : undefined)),
				count: bucket.docCount ?? 0,
			};
		});
	}
	/** Stock nuxeo-aggregation-behavior `_computeLabel`: resolved entry, else `label.ui.aggregate.<key>`. */
	private bucketLabel(id: string, fetched: any): string {
		if (fetched && typeof fetched === 'object') {
			if (fetched['entity-type'] === 'directoryEntry') return this.directoryEntryLabel(fetched);
			if (fetched['entity-type'] === 'user') return principalLabel(fetched) || id;
			if (fetched['entity-type'] === 'document')
				return fetched.properties?.['dc:title'] || fetched.title || id;
		}
		return this.quickMessages.text(`label.ui.aggregate.${id}`, id);
	}
	/** Stock `labelForDirectoryEntry`: localised label per level, parents first, joined with "/". */
	private directoryEntryLabel(entry: any): string {
		const language = this.quickMessages.locale().split('-')[0];
		const labels: string[] = [];
		for (
			let current = entry;
			current && typeof current === 'object';
			current = current.properties?.parent
		) {
			const props = current.properties ?? {};
			labels.push(
				props[`label_${language}`] || props.label || props.label_en || props.id || current.id || '',
			);
		}
		return labels.reverse().filter(Boolean).join('/');
	}
	coreFacetSelected(key: string, value: string): boolean {
		return this.parentSearchForm?.get(['customFilters', key])?.value?.includes(value) ?? false;
	}
	toggleCoreFacet(key: string, value: string): void {
		const group = this.parentSearchForm?.get('customFilters') as FormGroup;
		if (!group.get(key)) group.addControl(key, new FormControl([]));
		const control = group.get(key)!;
		const selected: string[] = control.value ?? [];
		control.setValue(
			selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
		);
		this.parentSearchForm?.markAsDirty();
	}
	/** A pick in the saved-search list: restore the form, then one search shows and routes it. */
	selectSavedSearch(id: string | null | undefined): void {
		const saved = id ? this.savedSearches?.find((item) => item.id === id) : undefined;
		if (saved) {
			this.restoreSavedSearch(saved);
			this.search();
		} else if (this.selectedSavedSearch) this.clearForm();
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.destroy$.next(0);
		this.destroy$.complete();
	}
}

interface SearchTag {
	id: string;
	label: string;
}
