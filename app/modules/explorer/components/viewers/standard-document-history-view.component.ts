import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import { WebUiIconComponent } from '@maretha/webui-sdk';
import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	effect,
	inject,
	input,
} from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
	NgSelectComponent,
	NgOptionTemplateDirective,
	NgLabelTemplateDirective,
} from '@ng-select/ng-select';
import { Observable, Subject, map, of, takeUntil } from 'rxjs';
import { DocumentViewContext, provideSuggestionScope } from '@maretha/webui-sdk';
import { SuggestionLimitsDirective } from 'app/directives/suggestion-limits.directive';
import { environment } from 'environments/environment';
import { AuditComponent } from '../../../settings/components/audit/audit.component';
import {
	AnalyticsService,
	AuditFilters,
	AuditPage,
	AuditSortField,
	AuditSortOrder,
} from '../../../settings/helpers/analytics.service';
import { DirectoryService } from '../../../settings/helpers/directory.service';

/** The standard audit surface is enabled only outside the three protected document types. */
@Component({
	selector: 'nx-standard-document-history-view',
	imports: [
		LocalizedSelectDirective,
		UserTagComponent,
		WebUiIconComponent,
		FormsModule,
		WebUiDatePipe,
		RouterLink,
		TranslateModule,
		NgSelectComponent,
		NgOptionTemplateDirective,
		NgLabelTemplateDirective,
		WebUiMessagePipe,
		SuggestionLimitsDirective,
	],
	providers: [provideSuggestionScope('maretha.document.standard-history')],
	templateUrl: '../../../settings/components/audit/audit.component.html',
	styleUrl: '../../../settings/components/audit/audit.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandardDocumentHistoryViewComponent extends AuditComponent {
	readonly context = input.required<DocumentViewContext>();
	override readonly documentScoped = true;
	protected override readonly auditErrorKey = 'history.loadFailed';
	protected override readonly auditErrorMessage =
		'Document history could not be loaded. Check your connection and permissions, then retry.';
	private readonly http = inject(HttpClient);
	private ready = false;
	private identity = '';
	private readonly documentChanged$ = new Subject<void>();
	constructor() {
		super(
			inject(AnalyticsService),
			inject(DirectoryService),
			inject(TranslateService),
			inject(ChangeDetectorRef),
		);
		effect(() => {
			const identity = this.documentIdentity();
			if (this.identity === identity) return;
			this.identity = identity;
			if (this.ready) {
				// A rejected date draft must not keep the previous document's request or rows alive.
				this.documentChanged$.next();
				this.entries = [];
				this.resultsCount = null;
				this.hasNextPage = false;
				this.loading = false;
				this.page = 0;
				this.refresh();
			}
		});
	}
	override ngOnInit(): void {
		this.identity = this.documentIdentity();
		super.ngOnInit();
		this.ready = true;
	}
	private documentIdentity(): string {
		const document = this.context().document;
		return `${document?.['repository'] ?? 'default'}/${document?.['uid'] ?? ''}`;
	}
	override refresh(resetPage = true): void {
		// The suggestion controls clear to null, while the shared administrator adapter expects strings.
		this.principalName = typeof this.principalName === 'string' ? this.principalName : '';
		this.eventCategory = typeof this.eventCategory === 'string' ? this.eventCategory : '';
		this.eventIds = Array.isArray(this.eventIds)
			? this.eventIds.filter((event) => typeof event === 'string' && event.length > 0)
			: [];
		this.startDate = typeof this.startDate === 'string' ? this.startDate : '';
		this.endDate = typeof this.endDate === 'string' ? this.endDate : '';
		// nuxeo-audit-search._observeDates moves an inverted From date one week before To.
		if (
			resetPage &&
			validDate(this.startDate) &&
			validDate(this.endDate) &&
			this.startDate > this.endDate
		) {
			const end = new Date(`${this.endDate}T00:00:00Z`);
			end.setUTCDate(end.getUTCDate() - 7);
			this.startDate = end.toISOString().slice(0, 10);
		}
		super.refresh(resetPage);
	}
	override ngOnDestroy(): void {
		this.documentChanged$.next();
		this.documentChanged$.complete();
		super.ngOnDestroy();
	}
	protected override requestAudit(
		filters: AuditFilters,
		page: number,
		sortBy: AuditSortField,
		sortOrder: AuditSortOrder,
	): Observable<AuditPage> {
		const document = this.context().document;
		if (!document?.['uid']) return of({ entries: [], resultsCount: 0, isNextPageAvailable: false });
		const repository = encodeURIComponent(String(document?.['repository'] ?? 'default'));
		const uid = encodeURIComponent(String(document?.['uid'] ?? ''));
		let params = new HttpParams()
			.set('currentPageIndex', page)
			.set('pageSize', 40)
			.set('sortBy', sortBy)
			.set('sortOrder', sortOrder.toLowerCase());
		if (filters.principalName) params = params.set('principalName', filters.principalName);
		if (filters.eventCategory) params = params.set('category', filters.eventCategory);
		if (filters.startDate) params = params.set('startEventDate', filters.startDate);
		if (filters.endDate) params = params.set('endEventDate', filters.endDate);
		for (const event of filters.eventIds ?? []) params = params.append('eventId', event);
		return this.http
			.get<AuditPage>(`${environment.nuxeoUrl}/api/v1/repo/${repository}/id/${uid}/@audit`, {
				params,
			})
			.pipe(
				takeUntil(this.documentChanged$),
				map((result) => ({
					entries: result.entries ?? [],
					resultsCount:
						typeof result.resultsCount === 'number' && result.resultsCount >= 0
							? result.resultsCount
							: null,
					isNextPageAvailable: result.isNextPageAvailable === true,
				})),
			);
	}
}

function validDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
