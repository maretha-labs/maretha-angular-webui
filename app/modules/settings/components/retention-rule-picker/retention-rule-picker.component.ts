import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';
import {
	provideSuggestionScope,
	suggestionLimits,
	suggestionTerms,
	WebUiMessagePipe,
} from '@maretha/webui-sdk';
import { SuggestionLimitsDirective } from 'app/directives/suggestion-limits.directive';
import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import {
	FormBuilder,
	FormGroup,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { BsModalRef } from 'ngx-bootstrap/modal';
import {
	catchError,
	concat,
	distinctUntilChanged,
	Observable,
	of,
	Subject,
	switchMap,
	tap,
} from 'rxjs';
import { RetentionService } from '../../helpers/retention.service';
import { RetentionRule } from '../../models/retention-rule';
import { NgSelectComponent, NgOptionTemplateDirective } from '@ng-select/ng-select';
import { AutofocusDirective } from '../../../../directives/autofocus.directive';
import { AsyncPipe } from '@angular/common';

@Component({
	selector: 'nx-retention-rule-picker',
	templateUrl: './retention-rule-picker.component.html',
	styleUrls: ['./retention-rule-picker.component.scss'],
	imports: [
		LocalizedSelectDirective,
		FormsModule,
		ReactiveFormsModule,
		NgSelectComponent,
		AutofocusDirective,
		NgOptionTemplateDirective,
		AsyncPipe,
		WebUiMessagePipe,
		SuggestionLimitsDirective,
	],
	// Stock nuxeo-attach-rule-button: nuxeo-document-suggestion min-chars="0".
	providers: [provideSuggestionScope('maretha.retention.attach-rule')],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RetentionRulePickerComponent implements OnInit {
	@Input() documentUid?: string;
	@Input() documentType?: string;
	save$ = new Subject<RetentionRule>();
	retentionRules$: Observable<any[]> | undefined;
	retentionRulesSearch$: Subject<string> = new Subject<string>();
	loadingRetentionRules = false;
	readonly limits = suggestionLimits('document');
	editorForm?: FormGroup;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly bsModalRef: BsModalRef,
		private retentionService: RetentionService,
		private readonly fb: FormBuilder,
	) {
		this.configureSearch();
	}

	// --------------------------------------------------------------------------------------------------
	close() {
		this.bsModalRef.hide();
	}

	// --------------------------------------------------------------------------------------------------
	saveChanges() {
		const payload = this.editorForm?.getRawValue();

		this.retentionService
			.attachRetentionRule(this.documentUid!, payload.retentionRule)
			.subscribe((_document) => {
				this.save$.next(payload);
				this.bsModalRef.hide();
			});
	}

	// --------------------------------------------------------------------------------------------------
	private configureSearch() {
		this.retentionRules$ = concat(
			of([]), // default items
			this.retentionRulesSearch$.pipe(
				distinctUntilChanged(),
				suggestionTerms(this.limits),
				tap((term) => (this.loadingRetentionRules = term !== null)),
				switchMap((term) =>
					term === null
						? of([])
						: this.retentionService.find(term, this.documentType).pipe(
								catchError(() => of([])), // empty list on error
								tap(() => (this.loadingRetentionRules = false)),
							),
				),
			),
		);
	}

	// --------------------------------------------------------------------------------------------------
	setupForm() {
		this.editorForm = this.fb.group({
			retentionRule: [null, Validators.required],
		});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		if (!this.documentUid) throw 'You must specify the document id';

		this.setupForm();
	}
}
