import {
	suggestionLimits,
	suggestionMinCharsText,
	suggestionTerms,
	WebUiIconComponent,
	WebUiMessagePipe,
	WebUiMessages,
} from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	inject,
	Input,
	OnChanges,
	OnDestroy,
	SimpleChanges,
} from '@angular/core';
import { AsyncPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsersAndGroupsFinderService } from 'app/helpers/users-and-groups-finder.service';
import { WorkflowLayoutContext } from '@maretha/webui-sdk';
import {
	PrincipalTags,
	UserTagComponent,
} from 'app/modules/shared/components/user-tag/user-tag.component';
import { catchError, map, Observable, of, Subject, switchMap, takeUntil } from 'rxjs';

const none: readonly ParticipantSuggestion[] = [];

/** Never resolvable through /user (stock nuxeo-task6d8-layout INTERNAL_PRINCIPALS). */
const INTERNAL_PRINCIPALS = new Set(['system']);

@Component({
	selector: 'nx-default-workflow-layout',
	standalone: true,
	imports: [
		FormsModule,
		WebUiMessagePipe,
		WebUiIconComponent,
		NgTemplateOutlet,
		AsyncPipe,
		UserTagComponent,
	],
	templateUrl: './default-workflow-layout.component.html',
	styleUrl: './default-workflow-layout.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefaultWorkflowLayoutComponent implements OnChanges, OnDestroy {
	@Input({ required: true }) context!: WorkflowLayoutContext;
	participantQuery = '';
	suggestions: readonly ParticipantSuggestion[] = [];
	private readonly destroyed$ = new Subject<void>();
	private readonly searchCancelled$ = new Subject<void>();
	private searchScope = 0;
	private readonly principals = inject(PrincipalTags);
	private readonly messages = inject(WebUiMessages);
	/** Stock nuxeo-user-suggestion: `minChars` and the nuxeo-selectivity pause. */
	readonly participantLimits = suggestionLimits('user', () => 'participants');
	private readonly participantTerms$ = new Subject<string>();
	private readonly principalEntities = new Map<string, Observable<unknown>>();
	/** Labels of the participants picked from suggestions; others show their name. */
	private readonly participantLabels = new Map<string, string>();

	constructor(
		private readonly usersAndGroupsFinder: UsersAndGroupsFinderService,
		private readonly cdr: ChangeDetectorRef,
	) {
		this.participantTerms$
			.pipe(
				suggestionTerms(this.participantLimits),
				switchMap((term) => {
					const scope = this.searchScope;
					if (term === null || !term.trim()) return of({ scope, term, results: none });
					return this.usersAndGroupsFinder.find(term).pipe(
						map((results) => ({
							scope,
							term,
							results: (results ?? [])
								.map(participantSuggestion)
								.filter(Boolean) as ParticipantSuggestion[],
						})),
						catchError(() => of({ scope, term, results: none })),
						takeUntil(this.searchCancelled$),
					);
				}),
				takeUntil(this.destroyed$),
			)
			.subscribe(({ scope, term, results }) => {
				if (scope !== this.searchScope || (term !== null && term !== this.participantQuery)) return;
				this.suggestions = results;
				this.cdr.markForCheck();
			});
	}

	ngOnDestroy() {
		this.searchCancelled$.next();
		this.searchCancelled$.complete();
		this.destroyed$.next();
		this.destroyed$.complete();
	}

	ngOnChanges(changes: SimpleChanges) {
		if (changes['context']) {
			this.searchScope++;
			this.searchCancelled$.next();
			this.participantTerms$.next('');
			this.suggestions = [];
		}
	}

	update(name: string, value: unknown) {
		if (this.context.readOnly || this.context.busy) return;
		this.context.commit({ ...this.context.variables, [name]: value });
	}
	participants(): string[] {
		const value = this.context.variables['participants'];
		return Array.isArray(value) ? value.map(String) : [];
	}
	setParticipants(value: string) {
		this.update(
			'participants',
			value
				.split(',')
				.map((part) => part.trim())
				.filter(Boolean),
		);
	}
	/** Stock nuxeo-selectivity: no search under `minChars`, one search once typing pauses. */
	searchParticipants(value: string) {
		this.participantQuery = value;
		this.participantTerms$.next(value);
	}
	/** Stock "Please enter {0} or more characters" while the query is too short to search. */
	participantHint(): string {
		const { minChars } = this.participantLimits();
		const length = this.participantQuery.trim().length;
		return length > 0 && length < minChars ? suggestionMinCharsText(this.messages, minChars) : '';
	}
	addParticipant(id: string, label?: string) {
		if (this.context.readOnly || this.context.busy || this.participants().includes(id)) return;
		if (label) this.participantLabels.set(id, label);
		this.update('participants', [...this.participants(), id]);
		this.participantQuery = '';
		this.participantTerms$.next('');
		this.suggestions = [];
	}
	participantLabel(id: string): string {
		return this.participantLabels.get(id) ?? this.principalName(id);
	}
	/** A prefixed principal's name, as stock user and group tags show a string principal. */
	principalName(id: string): string {
		return id.replace(/^(user|group):/, '');
	}
	/** Stock nuxeo-task6d8-layout: prefixed participants of one type, without duplicates. */
	participantsOfType(type: 'user' | 'group'): string[] {
		return [...new Set(this.participants().filter((id) => id.startsWith(`${type}:`)))];
	}
	/**
	 * Stock nuxeo-task6d8-layout resolves each user participant through /user/<name>; the shared
	 * principal cache owns that request, so a principal is read once per signed-in user.
	 */
	principal(id: string): Observable<unknown> {
		let entity = this.principalEntities.get(id);
		if (!entity) {
			entity = INTERNAL_PRINCIPALS.has(this.principalName(id))
				? of(id)
				: this.principals.resolve(id);
			this.principalEntities.set(id, entity);
		}
		return entity;
	}
	removeParticipant(id: string) {
		this.update(
			'participants',
			this.participants().filter((participant) => participant !== id),
		);
	}
	dateValue(): string {
		const value = this.context.variables['end_date'];
		return typeof value === 'string' ? value.slice(0, 10) : '';
	}
	setDate(value: string) {
		this.update('end_date', value ? `${value}T00:00:00.000Z` : '');
	}
	reviewResult(): string {
		const value = this.context.variables['review_result'];
		return typeof value === 'string' ? value : '';
	}
}

interface ParticipantSuggestion {
	id: string;
	label: string;
}

function participantSuggestion(result: any): ParticipantSuggestion | undefined {
	const rawId = result?.prefixed_id;
	if (typeof rawId !== 'string' || !rawId) return undefined;
	return { id: rawId, label: result?.displayLabel ?? rawId };
}
