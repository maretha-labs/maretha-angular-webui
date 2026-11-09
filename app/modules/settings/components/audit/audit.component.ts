import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import { inject as injectI18n } from '@angular/core';
import { WebUiIconComponent, WebUiMessages } from '@maretha/webui-sdk';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';
import {
	provideSuggestionScope,
	suggestionLimits,
	suggestionTerms,
	WebUiDatePipe,
	WebUiMessagePipe,
} from '@maretha/webui-sdk';
import { SuggestionLimitsDirective } from 'app/directives/suggestion-limits.directive';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	OnDestroy,
	OnInit,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
	NgLabelTemplateDirective,
	NgOptionTemplateDirective,
	NgSelectComponent,
} from '@ng-select/ng-select';
import {
	Subject,
	Observable,
	catchError,
	debounceTime,
	distinctUntilChanged,
	of,
	switchMap,
	takeUntil,
} from 'rxjs';
import {
	AuditEntry,
	AuditPage,
	AnalyticsService,
	AuditFilters,
	AuditSortField,
	AuditSortOrder,
} from '../../helpers/analytics.service';
import { DirectoryEntry, DirectoryService } from '../../helpers/directory.service';
import { documentUrl } from 'app/helpers/document-route';

let auditFilterSequence = 0;

@Component({
	selector: 'nx-audit',
	imports: [
		WebUiIconComponent,
		UserTagComponent,
		LocalizedSelectDirective,
		FormsModule,
		WebUiMessagePipe,
		WebUiDatePipe,
		RouterLink,
		TranslateModule,
		NgSelectComponent,
		NgOptionTemplateDirective,
		NgLabelTemplateDirective,
		SuggestionLimitsDirective,
	],
	providers: [provideSuggestionScope('maretha.admin.audit')],
	templateUrl: './audit.component.html',
	styleUrl: './audit.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditComponent implements OnInit, OnDestroy {
	readonly i18n = injectI18n(WebUiMessages);
	readonly filterId = `audit-filter-${++auditFilterSequence}`;
	readonly documentScoped: boolean = false;
	protected readonly auditErrorKey: string =
		'app.settingsShared.audit-records-are-unavailable-your-server-must-e-b42176';
	protected readonly auditErrorMessage: string =
		'Audit records are unavailable. Your server must expose the Audit.QueryWithPageProvider automation endpoint.';
	readonly historyColumns = [
		{ key: 'eventId', label: 'Performed Action', labelKey: 'app.columns.performed-action' },
		{ key: 'eventDate', label: 'Date', labelKey: 'app.columns.date' },
		{ key: 'principalName', label: 'Username', labelKey: 'app.columns.username' },
		{ key: 'category', label: 'Category', labelKey: 'app.columns.category' },
		{ key: 'comment', label: 'Comment', labelKey: 'app.columns.comment' },
		{ key: 'state', label: 'State', labelKey: 'app.columns.state' },
	];
	private readonly hiddenHistoryColumns = new Set<string>();
	private readonly refresh$ = new Subject<void>();
	readonly usernameInput$ = new Subject<string>();
	private readonly filterChanges$ = new Subject<void>();
	private readonly destroy$ = new Subject<void>();
	entries: AuditEntry[] = [];
	resultsCount: number | null = null;
	hasNextPage = false;
	page = 0;
	loading = false;
	private readonly errorMessageState = localizedText();
	get error(): string {
		return this.errorMessageState();
	}
	set error(value: string | MessageText) {
		this.errorMessageState.set(value);
	}
	principalName = '';
	eventCategory = '';
	eventIds: string[] = [];
	startDate = '';
	endDate = '';
	eventTypes: DirectoryEntry[] = [];
	eventCategories: DirectoryEntry[] = [];
	userSuggestions: string[] = [];
	readonly userLimits = suggestionLimits('user', () => 'principalName');
	sortBy: AuditSortField = 'eventDate';
	sortOrder: AuditSortOrder = 'DESC';
	private appliedFilters: AuditFilters = {};

	constructor(
		private readonly analytics: AnalyticsService,
		private readonly directories: DirectoryService,
		private readonly translate: TranslateService,
		private readonly cdr: ChangeDetectorRef,
	) {}

	ngOnInit(): void {
		if (this.documentScoped) {
			try {
				const columns = JSON.parse(
					localStorage.getItem('nuxeo.document.history.hiddenColumns') || '[]',
				);
				if (Array.isArray(columns))
					for (const key of columns)
						if (this.historyColumns.some((column) => column.key === key))
							this.hiddenHistoryColumns.add(key);
			} catch {
				/* Keep defaults when storage is unavailable. */
			}
		}
		this.refresh$
			.pipe(
				switchMap(() => {
					this.loading = true;
					this.error = '';
					this.entries = [];
					this.resultsCount = null;
					this.hasNextPage = false;
					this.cdr.markForCheck();
					return this.requestAudit(
						this.appliedFilters,
						this.page,
						this.sortBy,
						this.sortOrder,
					).pipe(catchError(() => of(null)));
				}),
				takeUntil(this.destroy$),
			)
			.subscribe((page) => {
				this.loading = false;
				if (!page) {
					this.entries = [];
					this.resultsCount = null;
					this.error = messageText(this.auditErrorKey, this.auditErrorMessage);
				} else {
					this.entries = page.entries;
					this.resultsCount = page.resultsCount;
					this.hasNextPage = page.isNextPageAvailable;
				}
				this.cdr.markForCheck();
			});
		this.directories
			.listEntries('eventTypes', 0, 200)
			.pipe(
				catchError(() => of({ entries: [] })),
				takeUntil(this.destroy$),
			)
			.subscribe((page) => {
				this.eventTypes = page.entries;
				this.cdr.markForCheck();
			});
		this.directories
			.listEntries('eventCategories', 0, 200)
			.pipe(
				catchError(() => of({ entries: [] })),
				takeUntil(this.destroy$),
			)
			.subscribe((page) => {
				this.eventCategories = page.entries;
				this.cdr.markForCheck();
			});
		this.usernameInput$
			.pipe(
				suggestionTerms(this.userLimits),
				distinctUntilChanged(),
				switchMap((query) =>
					query === null
						? of([])
						: this.analytics.getUserSuggestions(query.trim()).pipe(catchError(() => of([]))),
				),
				takeUntil(this.destroy$),
			)
			.subscribe((suggestions) => {
				this.userSuggestions = suggestions;
				this.cdr.markForCheck();
			});
		this.filterChanges$
			.pipe(debounceTime(300), takeUntil(this.destroy$))
			.subscribe(() => this.refresh());
		this.refresh();
	}

	protected requestAudit(
		filters: AuditFilters,
		page: number,
		sortBy: AuditSortField,
		sortOrder: AuditSortOrder,
	): Observable<AuditPage> {
		return this.analytics.getAuditEvents(filters, page, 40, sortBy, sortOrder);
	}
	stateLabel(entry: AuditEntry): string {
		const state = (entry as AuditEntry & { docLifeCycle?: string }).docLifeCycle ?? '';
		return this.i18n.text(
			`label.ui.state.${state}`,
			(
				{
					project: 'Project',
					approved: 'Approved',
					obsolete: 'Obsolete',
					deleted: 'Deleted',
				} as Record<string, string>
			)[state] ?? state,
		);
	}
	isColumnVisible(key: string): boolean {
		return !this.documentScoped || !this.hiddenHistoryColumns.has(key);
	}
	setColumnVisible(key: string, visible: boolean): void {
		if (visible) this.hiddenHistoryColumns.delete(key);
		else this.hiddenHistoryColumns.add(key);
		try {
			localStorage.setItem(
				'nuxeo.document.history.hiddenColumns',
				JSON.stringify([...this.hiddenHistoryColumns]),
			);
		} catch {
			/* In-memory preference remains active. */
		}
	}

	refresh(resetPage = true): void {
		if (resetPage) {
			if (!isDateInput(this.startDate) || !isDateInput(this.endDate)) {
				this.error = messageText(
					'app.state.enter-valid-audit-dates-e5ac7d',
					'Enter valid audit dates.',
				);
				this.cdr.markForCheck();
				return;
			}
			if (this.startDate && this.endDate && this.startDate > this.endDate) {
				this.error = messageText(
					'app.state.the-start-date-must-be-before-or-on-the-end-d-53a541',
					'The start date must be before or on the end date.',
				);
				this.cdr.markForCheck();
				return;
			}
			this.page = 0;
			this.appliedFilters = {
				...(this.principalName.trim() ? { principalName: this.principalName.trim() } : {}),
				...(this.eventCategory.trim() ? { eventCategory: this.eventCategory.trim() } : {}),
				...(this.eventIds.length ? { eventIds: this.eventIds } : {}),
				// BasicAuditSearch declares date fields, and the Polymer provider sends the
				// date-picker value unchanged. Sending an ISO timestamp makes the request
				// depend on the server's coercion rules instead of the provider contract.
				...(this.startDate ? { startDate: this.startDate } : {}),
				...(this.endDate ? { endDate: this.endDate } : {}),
			};
		}
		this.refresh$.next();
	}

	onUsernameInput(query: string): void {
		this.usernameInput$.next(query);
		this.scheduleApply();
	}

	scheduleApply(): void {
		this.filterChanges$.next();
	}

	sort(field: AuditSortField): void {
		if (this.sortBy === field) this.sortOrder = this.sortOrder === 'ASC' ? 'DESC' : 'ASC';
		else {
			this.sortBy = field;
			this.sortOrder = field === 'eventDate' ? 'DESC' : 'ASC';
		}
		this.page = 0;
		this.refresh(false);
	}

	sortLabel(field: AuditSortField): string {
		return this.i18n.format(
			'app.settingsShared.field-select-eventid-sort-by-action-eventdate-s-679936',
			{ field, sort: this.sortBy === field ? this.sortOrder : 'none' },
			'{field, select, eventId {Sort by action} eventDate {Sort by date} principalName {Sort by user} other {Sort by category}}{sort, select, ASC {, sorted ascending} DESC {, sorted descending} other {}}',
		);
	}

	eventLabel(eventId: string): string {
		return this.translated(`eventType.${eventId}`, AUDIT_EVENT_LABELS[eventId] ?? eventId);
	}

	categoryLabel(category?: string): string {
		return category
			? this.translated(`eventCategory.${category}`, AUDIT_CATEGORY_LABELS[category] ?? category)
			: '—';
	}

	directoryLabel(entry: DirectoryEntry | undefined, kind: 'eventType' | 'eventCategory'): string {
		if (!entry) return '';
		const label = entry.properties?.['label'];
		return typeof label === 'string' && label.trim()
			? label
			: kind === 'eventType'
				? this.eventLabel(entry.id)
				: this.categoryLabel(entry.id);
	}

	documentLink(entry: AuditEntry): string | null {
		const path =
			typeof entry.docPath === 'string' && entry.docPath.startsWith('/')
				? entry.docPath
				: undefined;
		const rawUid = (entry as AuditEntry & { docUUID?: unknown }).docUUID;
		const uid =
			typeof rawUid === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(rawUid) ? rawUid : undefined;
		// Stock links audit rows by document id; a path can be stale after a move or trash.
		return uid ? documentUrl({ uid }) : path ? documentUrl({ path }) : null;
	}

	private translated(key: string, fallback: string): string {
		return this.i18n.text(key, fallback);
	}

	text(key: string, fallback: string): string {
		return this.translated(key, fallback);
	}

	previous(): void {
		if (this.page > 0) {
			this.page--;
			this.refresh(false);
		}
	}

	next(): void {
		if (this.hasNextPage) {
			this.page++;
			this.refresh(false);
		}
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
		this.refresh$.complete();
		this.usernameInput$.complete();
		this.filterChanges$.complete();
	}
}

function isDateInput(value: string): boolean {
	if (!value) return true;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const [year, month, day] = match.slice(1).map(Number);
	const parsed = new Date(year, month - 1, day);
	return (
		parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
	);
}

const AUDIT_CATEGORY_LABELS: Record<string, string> = {
	eventDocumentCategory: 'Document',
	eventLifeCycleCategory: 'Life cycle',
	eventWorkflowCategory: 'Workflow',
	eventGroupCategory: 'Group',
	eventUserCategory: 'User',
};

const AUDIT_EVENT_LABELS: Record<string, string> = {
	documentCreated: 'Document created',
	documentModified: 'Document modified',
	documentRemoved: 'Document removed',
	documentMoved: 'Document moved',
	documentSecurityUpdated: 'Document security updated',
	documentPublished: 'Document published',
	documentCheckedIn: 'Created a version',
	addedToCollection: 'Document added to collection',
	documentCheckedOut: 'Document checked out',
	loginSuccess: 'Login successful',
	loginFailed: 'Login failed',
};
