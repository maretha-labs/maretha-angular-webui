import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, OnDestroy, forwardRef, ChangeDetectionStrategy } from '@angular/core';
import {
	AbstractControl,
	ControlValueAccessor,
	FormControl,
	FormGroup,
	NG_VALIDATORS,
	NG_VALUE_ACCESSOR,
	ValidationErrors,
	Validator,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { Subject, map, takeUntil } from 'rxjs';
import { AutosizeModule } from 'ngx-autosize';
import { NgClass } from '@angular/common';
import { AutofocusDirective } from '../../../../../../directives/autofocus.directive';

@Component({
	selector: 'nx-parallel-wf-give-opinion-task',
	templateUrl: './parallel-wf-give-opinion-task.component.html',
	styleUrls: ['./parallel-wf-give-opinion-task.component.scss'],
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => ParallelWfGiveOpinionTaskComponent),
			multi: true,
		},
		{
			provide: NG_VALIDATORS,
			useExisting: forwardRef(() => ParallelWfGiveOpinionTaskComponent),
			multi: true,
		},
	],
	imports: [
		FormsModule,
		ReactiveFormsModule,
		AutosizeModule,
		NgClass,
		AutofocusDirective,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParallelWfGiveOpinionTaskComponent
	implements ControlValueAccessor, Validator, OnDestroy
{
	private destroy$ = new Subject<void>();

	formGroup = new FormGroup<any>({
		['initiatorComment']: new FormControl<string | null>(null, Validators.required),
		['comment']: new FormControl<string | null>(null),
		['assignees']: new FormControl<any[] | null>(null),
	});

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
	writeValue(value: any): void {
		this.formGroup.patchValue(value, { emitEvent: false });
	}

	// --------------------------------------------------------------------------------------------------
	// propagates validation errors from nested form to parent form control
	validate(_control: AbstractControl): ValidationErrors | null {
		return this.formGroup.valid ? null : { chooseParticipants: true };
	}

	// --------------------------------------------------------------------------------------------------
	getValidationClassName(controlName: string | string[]): string {
		if (this.formGroup.get(controlName)?.dirty)
			return this.formGroup.get(controlName)?.valid ? 'is-valid' : 'is-invalid';

		return '';
	}

	// --------------------------------------------------------------------------------------------------
	// needed to unsubscribe from observables when component is destroyed
	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}
}
