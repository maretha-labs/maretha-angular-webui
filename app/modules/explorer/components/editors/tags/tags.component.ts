import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';
import { suggestionLimits, suggestionTerms, WebUiMessagePipe } from '@maretha/webui-sdk';
import { SuggestionLimitsDirective } from 'app/directives/suggestion-limits.directive';
import { Component, OnDestroy, OnInit, forwardRef, ChangeDetectionStrategy } from '@angular/core';
import {
	AbstractControl,
	ControlValueAccessor,
	FormControl,
	FormGroup,
	NG_VALIDATORS,
	NG_VALUE_ACCESSOR,
	ValidationErrors,
	Validator,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import {
	Observable,
	Subject,
	catchError,
	distinctUntilChanged,
	map,
	of,
	switchMap,
	takeUntil,
	tap,
} from 'rxjs';
import {
	NgSelectComponent,
	NgMultiLabelTemplateDirective,
	NgTagTemplateDirective,
} from '@ng-select/ng-select';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AsyncPipe } from '@angular/common';

@Component({
	selector: 'nx-tags',
	templateUrl: './tags.component.html',
	styleUrls: ['./tags.component.scss'],
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => TagsComponent),
			multi: true,
		},
		{
			provide: NG_VALIDATORS,
			useExisting: forwardRef(() => TagsComponent),
			multi: true,
		},
	],
	imports: [
		LocalizedSelectDirective,
		FormsModule,
		ReactiveFormsModule,
		NgSelectComponent,
		NgMultiLabelTemplateDirective,
		TooltipDirective,
		FontAwesomeModule,
		NgTagTemplateDirective,
		AsyncPipe,
		WebUiMessagePipe,
		SuggestionLimitsDirective,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagsComponent implements ControlValueAccessor, Validator, OnInit, OnDestroy {
	private destroy$ = new Subject<void>();

	formGroup = new FormGroup<TagsFormControl>({
		['nxtag:tags']: new FormControl<string | null>(null),
	});

	tags$: Observable<any> | undefined;
	tagsLoading = false;
	readonly limits = suggestionLimits('tag', () => 'nxtag:tags');
	tagsInput$ = new Subject<string>();

	// --------------------------------------------------------------------------------------------------
	constructor(private readonly documentManagerService: DocumentsManagerService) {}

	// --------------------------------------------------------------------------------------------------
	// propagates value changes to parent form control when nested form changes
	registerOnChange(fn: any): void {
		this.formGroup.valueChanges
			.pipe(
				takeUntil(this.destroy$),
				map(() => {
					const result: any = {};

					for (const key in this.formGroup.controls) {
						if (Object.prototype.hasOwnProperty.call(this.formGroup.controls, key)) {
							const control = this.formGroup.get(key);

							if (control?.dirty) result[key] = control.value;
						}
					}

					// Return only the dirty form controls
					return result;
				}),
			)
			.subscribe(fn);
	}

	// --------------------------------------------------------------------------------------------------
	// marks parent form control as touched when nested form changes
	registerOnTouched(fn: any): void {
		this.formGroup.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(fn);
	}

	// --------------------------------------------------------------------------------------------------
	// disabled nested form when parent form control is disabled
	setDisabledState(isDisabled: boolean): void {
		if (isDisabled) this.formGroup.disable();
		else this.formGroup.enable();
	}

	// --------------------------------------------------------------------------------------------------
	// writes value to nested form when value is set to parent form control
	writeValue(value: TagsFormControlValue): void {
		this.formGroup.patchValue(value, { emitEvent: false });
	}

	// --------------------------------------------------------------------------------------------------
	// propagates validation errors from nested form to parent form control
	validate(_control: AbstractControl): ValidationErrors | null {
		return this.formGroup.valid ? null : { tags: true };
	}

	// --------------------------------------------------------------------------------------------------
	getValidationClassName(controlName: string | string[]): string {
		if (this.formGroup.get(controlName)?.dirty)
			return this.formGroup.get(controlName)?.valid ? 'is-valid' : 'is-invalid';

		return '';
	}

	// --------------------------------------------------------------------------------------------------
	private configureTagsLookup() {
		this.tags$ = this.tagsInput$.pipe(
			suggestionTerms(this.limits),
			map((emittedValue) => (emittedValue ? emittedValue.trim() : emittedValue)),
			distinctUntilChanged(),
			takeUntil(this.destroy$),
			tap((term) => (this.tagsLoading = term !== null)),
			switchMap((term) =>
				term === null
					? of([])
					: this.documentManagerService.suggestTag(term).pipe(
							catchError(() => of([])), // empty list on error
							tap(() => (this.tagsLoading = false)),
							map((response: any) => {
								const result = [];
								const existingTags: string[] = this.formGroup.get('nxtag:tags')!.value as any;

								for (const tag of response)
									if (existingTags.indexOf(tag.id) < 0)
										result.push({ id: tag.id, label: tag.displayLabel });

								return result;
							}),
						),
			),
		);
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit() {
		this.configureTagsLookup();
	}

	// --------------------------------------------------------------------------------------------------
	// needed to unsubscribe from observables when component is destroyed
	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}
}

export interface TagsFormControlValue {
	['nxtag:tags']: string | null;
}

export interface TagsFormControl {
	['nxtag:tags']: FormControl<string | null>;
}
