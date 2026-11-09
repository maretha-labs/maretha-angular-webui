import { WebUiMessages } from '@maretha/webui-sdk';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';
import {
	provideSuggestionScope,
	suggestionLimits,
	suggestionTerms,
	WebUiMessagePipe,
} from '@maretha/webui-sdk';
import { SuggestionLimitsDirective } from 'app/directives/suggestion-limits.directive';
import {
	Component,
	Inject,
	OnInit,
	OnDestroy,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Output,
	EventEmitter,
	InjectionToken,
	inject,
} from '@angular/core';
import {
	UntypedFormBuilder,
	UntypedFormGroup,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { AutomationsService } from 'app/modules/explorer/helpers/automations.service';
import {
	Observable,
	finalize,
	takeUntil,
	Subject,
	catchError,
	concat,
	distinctUntilChanged,
	map,
	of,
	switchMap,
	tap,
} from 'rxjs';
import { NgSelectComponent, NgOptionTemplateDirective } from '@ng-select/ng-select';
import { AutofocusDirective } from '../../../../../directives/autofocus.directive';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AsyncPipe } from '@angular/common';

/** Provided only by the exact standard-header publish dialog. Legacy editors keep their defaults. */
export const STANDARD_PUBLISH_REPOSITORY = new InjectionToken<string | null>(
	'standardPublishRepository',
);

@Component({
	selector: 'nx-internal-publication',
	templateUrl: './internal-publication.component.html',
	styleUrls: ['./internal-publication.component.scss'],
	imports: [
		LocalizedSelectDirective,
		FormsModule,
		ReactiveFormsModule,
		NgSelectComponent,
		AutofocusDirective,
		NgOptionTemplateDirective,
		FontAwesomeModule,
		AsyncPipe,
		WebUiMessagePipe,
		SuggestionLimitsDirective,
	],
	// Stock nuxeo-internal-publish location: nuxeo-document-suggestion min-chars="0".
	providers: [provideSuggestionScope('maretha.publish.section')],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InternalPublicationComponent implements OnInit, OnDestroy {
	private readonly scopedRepository = inject(STANDARD_PUBLISH_REPOSITORY, { optional: true });
	private destroy$ = new Subject<void>();
	private initialLoad = false;
	readonly limits = suggestionLimits('document');

	private readonly messages = inject(WebUiMessages);
	get renditions() {
		return [
			{
				key: 'none',
				label: this.messages.text('publication.none', 'None'),
				disabled: false,
			},
			{
				key: 'default',
				label: this.messages.text('publication.defaultRendition', 'Default rendition'),
			},
		];
	}
	readonly locations$: Observable<any>;
	loading = false;
	working = false;
	private readonly errorText = localizedText();
	get error(): string {
		return this.errorText();
	}
	set error(value: string | MessageText) {
		this.errorText.set(value);
	}
	@Output() published = new EventEmitter<void>();
	searchTerm$ = new Subject<string>();
	editorForm?: UntypedFormGroup | undefined;

	// --------------------------------------------------------------------------------------------------
	constructor(
		@Inject('document') public document: any,
		private readonly fb: UntypedFormBuilder,
		private readonly automationsService: AutomationsService,
		private readonly translateService: TranslateService,
		private readonly cdr: ChangeDetectorRef,
	) {
		this.locations$ = concat(
			of([]), // default items
			this.searchTerm$.pipe(
				distinctUntilChanged(),
				suggestionTerms(this.limits),
				tap((term) => (this.loading = term !== null)),
				switchMap((term) =>
					term === null
						? of([])
						: automationsService
								.getPageProviderDocuments(
									'publish_space_suggestion',
									term,
									['*'],
									20,
									this.scopedRepository ?? undefined,
								)
								.pipe(
									catchError(() => of(this.scopedRepository === null ? [] : { entries: [] })), // empty list on error
									tap(() => (this.loading = false)),
									map((x: any) => this.mapEntries(x.entries)),
								),
				),
			),
		);
	}

	// --------------------------------------------------------------------------------------------------
	fetchEntries(_event: any) {
		if (this.initialLoad) return;

		this.searchTerm$.next('');
		this.initialLoad = true;
	}

	// --------------------------------------------------------------------------------------------------
	private mapEntries(entries: any) {
		const result = entries.map((entry: any) => {
			return {
				uid: entry.uid,
				path: entry.path,
				title: entry.title,
			};
		});

		return ([] as any[]).concat(...result);
	}

	// --------------------------------------------------------------------------------------------------
	saveChanges() {
		if (!this.editorForm?.valid || this.working) return;
		this.working = true;
		this.error = '';
		this.automationsService
			.publishToSection(
				this.document.uid,
				this.editorForm.get('location')!.value,
				this.editorForm.get('overrideExistingPublications')!.value,
				this.editorForm.get('rendition')!.value === 'none'
					? undefined
					: this.editorForm.get('rendition')!.value,
				this.scopedRepository ?? undefined,
			)
			.pipe(
				takeUntil(this.destroy$),
				finalize(() => {
					this.working = false;
					this.cdr.markForCheck();
				}),
			)
			.subscribe({
				next: () => {
					this.editorForm?.markAsPristine();
					this.published.emit();
				},
				error: () => {
					this.error = messageText(
						'app.state.publication-failed-verify-the-target-permissi-84fc63',
						'Publication failed. Verify the target permissions and try again.',
					);
				},
			});
	}

	// --------------------------------------------------------------------------------------------------
	isControlInvalid(controlName: string | string[]): boolean {
		return (
			(this.editorForm!.get(controlName)?.touched && this.editorForm!.get(controlName)?.invalid) ||
			false
		);
	}

	// --------------------------------------------------------------------------------------------------
	private setupForm() {
		this.editorForm = this.fb.group({
			location: [null, Validators.required],
			rendition: ['none'],
			overrideExistingPublications: [false],
		});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		this.setupForm();
	}

	// --------------------------------------------------------------------------------------------------
	// needed to unsubscribe from observables when component is destroyed
	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}
}
