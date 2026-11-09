import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';
import {
	provideSuggestionScope,
	suggestionLimits,
	suggestionTerms,
	WebUiMessagePipe,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { SuggestionLimitsDirective } from 'app/directives/suggestion-limits.directive';
import {
	CdkVirtualScrollViewport,
	CdkFixedSizeVirtualScroll,
	CdkVirtualForOf,
} from '@angular/cdk/scrolling';
import {
	ChangeDetectorRef,
	Component,
	inject,
	Input,
	OnChanges,
	OnDestroy,
	ViewChild,
	ChangeDetectionStrategy,
} from '@angular/core';
import { UsersAndGroupsFinderService } from 'app/helpers/users-and-groups-finder.service';
import { animations } from 'app/shared.constants';
import {
	Observable,
	Subject,
	concat,
	of,
	distinctUntilChanged,
	tap,
	switchMap,
	catchError,
	Subscription,
	takeUntil,
} from 'rxjs';
import { DocumentActivityService } from '../../helpers/document-activity.service';
import { PopoverDirective } from 'ngx-bootstrap/popover';
import { ClickOutsideDirective } from '../../../../directives/click-outside.directive';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import {
	NgSelectComponent,
	NgOptionTemplateDirective,
	NgLabelTemplateDirective,
} from '@ng-select/ng-select';
import { FormsModule } from '@angular/forms';
import { AutofocusDirective } from '../../../../directives/autofocus.directive';
import { BsDatepickerInputDirective, BsDatepickerDirective } from 'ngx-bootstrap/datepicker';
import { AsyncPipe } from '@angular/common';
import { TimeagoModule } from 'ngx-timeago';

@Component({
	selector: 'nx-document-activity',
	templateUrl: './document-activity.component.html',
	styleUrls: ['./document-activity.component.scss'],
	animations: [animations.horizontalInOutAnimation],
	imports: [
		LocalizedSelectDirective,
		CdkVirtualScrollViewport,
		CdkFixedSizeVirtualScroll,
		PopoverDirective,
		ClickOutsideDirective,
		FontAwesomeModule,
		TooltipDirective,
		CdkVirtualForOf,
		NgSelectComponent,
		FormsModule,
		AutofocusDirective,
		NgOptionTemplateDirective,
		NgLabelTemplateDirective,
		BsDatepickerInputDirective,
		BsDatepickerDirective,
		AsyncPipe,
		TimeagoModule,
		WebUiMessagePipe,
		SuggestionLimitsDirective,
	],
	providers: [provideSuggestionScope('maretha.document.history')],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentActivityComponent implements OnChanges, OnDestroy {
	private readonly destroy$ = new Subject<void>();
	private request?: Subscription;
	private readonly errorMessageState = localizedText(null);
	get error(): string | null {
		return this.errorMessageState();
	}
	set error(value: string | null | MessageText) {
		this.errorMessageState.set(value);
	}
	@ViewChild(CdkVirtualScrollViewport, { static: false }) activityTableViewport:
		| CdkVirtualScrollViewport
		| undefined;
	@Input() document: any | null;
	loadingActivities = false;
	currentPage = 1;
	canLoadMore = true;
	documentActivity: any[] = [];
	eventTypes: any[] = [];
	auditEventPickerPopover = false;
	userPickerPopover = false;
	dateRangePickerPickerPopover = false;
	users$: Observable<any[]> | undefined;
	usersSearch$ = new Subject<string>();
	loadingUsers = false;
	readonly userLimits = suggestionLimits('user', () => 'principalName');
	initialUsersLoad = false;
	readonly dateRangeMaxDate = new Date();
	filters: any = {
		principalName: undefined,
		startEventDate: undefined,
		endEventDate: undefined,
		eventId: undefined,
	};
	appliedFilters: any = {};

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly documentActivityService: DocumentActivityService,
		private readonly usersAndGroupsService: UsersAndGroupsFinderService,
		private readonly cdr: ChangeDetectorRef,
	) {
		documentActivityService.initialized$.pipe(takeUntil(this.destroy$)).subscribe((x: any) => {
			// ng-select reads the accessible option name from `label`; keep it the stock message.
			this.eventTypes = [...x.types]
				.map((type: any) => ({ ...type, label: this.eventTypeLabel(type) }))
				.sort((a: any, b: any) => a.label.localeCompare(b.label));
			this.cdr.markForCheck();
		});

		this.configureUserFinder();
	}

	private readonly messages = inject(WebUiMessages);
	/** Stock audit tables label events through `eventType.<id>`; the directory label is the fallback. */
	eventTypeLabel(item: { id?: string; displayLabel?: string; label?: string }): string {
		const id = item?.id ?? '';
		return this.messages.text(`eventType.${id}`, item?.displayLabel || item?.label || id);
	}
	/** Resolve retained rows against the current server-localized event vocabulary. */
	eventLabel(entry: { eventId?: string; event?: string }): string {
		const type = this.eventTypes.find((item) => item.id === entry.eventId);
		return this.eventTypeLabel(type ?? { id: entry.eventId }) || entry.event || '';
	}

	// --------------------------------------------------------------------------------------------------
	getDocumentActivity(refresh = false) {
		if (
			!this.document?.uid ||
			(!refresh && (this.loadingActivities || !this.canLoadMore || this.error))
		)
			return;

		if (refresh) {
			this.request?.unsubscribe();
			this.currentPage = 1;
			this.documentActivity = [];
			this.canLoadMore = true;
		}

		this.loadingActivities = true;
		this.error = null;

		this.request = this.documentActivityService
			.getDocumentActivity(this.document.uid, this.appliedFilters, this.currentPage)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (x) => {
					this.canLoadMore = x.canLoadMore;
					this.currentPage++;

					this.documentActivity = refresh ? x.entries : [...this.documentActivity, ...x.entries];

					this.loadingActivities = false;
					this.cdr.markForCheck();
				},
				error: () => {
					this.loadingActivities = false;
					this.error = messageText(
						'app.state.history-could-not-be-loaded-check-your-access-ae2d65',
						'History could not be loaded. Check your access and try again.',
					);
					this.cdr.markForCheck();
				},
			});
	}

	// --------------------------------------------------------------------------------------------------
	retryActivity(): void {
		this.error = null;
		this.getDocumentActivity();
	}

	applyFilter(filter: string) {
		switch (filter) {
			case 'dateRange':
				if (this.filters.startEventDate === undefined) delete this.appliedFilters.startEventDate;
				else this.appliedFilters.startEventDate = this.filters.startEventDate.toISOString();

				if (this.filters.endEventDate === undefined) delete this.appliedFilters.endEventDate;
				else this.appliedFilters.endEventDate = this.filters.endEventDate.toISOString();
				break;

			default:
				if (this.filters[filter] === undefined) delete this.appliedFilters[filter];
				else this.appliedFilters[filter] = this.filters[filter];
		}

		this.getDocumentActivity(true);

		// this.auditEventPickerPopover = false;
		// this.userPickerPopover = false;
		// this.dateRangePickerPickerPopover = false;
	}

	// --------------------------------------------------------------------------------------------------
	clearFilter(filter: string) {
		switch (filter) {
			case 'dateRange':
				this.filters.startEventDate = undefined;
				delete this.appliedFilters.startEventDate;
				this.filters.endEventDate = undefined;
				delete this.appliedFilters.endEventDate;
				break;

			default:
				this.filters[filter] = undefined;
				delete this.appliedFilters[filter];
		}

		this.getDocumentActivity(true);

		// this.auditEventPickerPopover = false;
		// this.userPickerPopover = false;
		// this.dateRangePickerPickerPopover = false;
	}

	// --------------------------------------------------------------------------------------------------
	fetchUsers(_event: any) {
		if (this.initialUsersLoad) return;

		this.usersSearch$.next('');
		this.initialUsersLoad = true;
	}

	// --------------------------------------------------------------------------------------------------
	private configureUserFinder() {
		this.users$ = concat(
			of([]), // default items
			this.usersSearch$.pipe(
				distinctUntilChanged(),
				suggestionTerms(this.userLimits),
				tap((term) => (this.loadingUsers = term !== null)),
				switchMap((term) =>
					term === null
						? of([])
						: this.usersAndGroupsService.findUsers(term).pipe(
								catchError(() => of([])), // empty list on error
								tap(() => (this.loadingUsers = false)),
							),
				),
			),
		);
	}

	// --------------------------------------------------------------------------------------------------
	dateRangeMaxDateChanged(date: any) {
		setTimeout(() => {
			this.filters.endEventDate = date;

			if (date && this.filters.startEventDate && date < this.filters.startEventDate)
				this.filters.startEventDate = undefined;

			this.applyFilter('dateRange');
		});
	}

	// --------------------------------------------------------------------------------------------------
	dateRangeMinDateChanged(date: any) {
		setTimeout(() => {
			this.filters.startEventDate = date;

			if (date && this.filters.endEventDate && date > this.filters.endEventDate)
				this.filters.endEventDate = undefined;

			this.applyFilter('dateRange');
		});
	}

	// --------------------------------------------------------------------------------------------------
	trackByFn = (index: number, entry: any) => entry.uid;

	// --------------------------------------------------------------------------------------------------
	activityTableViewportScrolled() {
		const end = this.activityTableViewport!.getRenderedRange().end;
		const total = this.activityTableViewport!.getDataLength();

		if (end === total && !this.loadingActivities) this.getDocumentActivity();
	}

	// --------------------------------------------------------------------------------------------------
	get inverseOfTranslation(): string {
		if (!this.activityTableViewport || !this.activityTableViewport['_renderedContentOffset'])
			return '-0px';

		return `-${this.activityTableViewport['_renderedContentOffset']}px`;
	}

	// --------------------------------------------------------------------------------------------------
	ngOnChanges(): void {
		this.request?.unsubscribe();
		this.loadingActivities = false;
		this.documentActivity = [];
		this.getDocumentActivity(true);
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}
}
