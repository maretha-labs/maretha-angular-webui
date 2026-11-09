import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { DOCUMENT, NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, forwardRef, inject } from '@angular/core';
import { NG_VALIDATORS, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { BsDatepickerDirective, BsDatepickerInputDirective } from 'ngx-bootstrap/datepicker';
import { NatureSubjectsCoverageExpirationComponent } from './nature-subjects-coverage-expiration/nature-subjects-coverage-expiration.component';
import { VocabularyComponent } from './vocabulary/vocabulary.component';

/** Source field order for explicitly opted-in layouts; shares only the existing CVA logic. */
@Component({
	selector: 'nx-standard-content-fields',
	standalone: true,
	imports: [
		ReactiveFormsModule,
		VocabularyComponent,
		BsDatepickerDirective,
		BsDatepickerInputDirective,
		NgClass,
		WebUiMessagePipe,
	],
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => StandardContentFieldsComponent),
			multi: true,
		},
		{
			provide: NG_VALIDATORS,
			useExisting: forwardRef(() => StandardContentFieldsComponent),
			multi: true,
		},
	],
	templateUrl: './standard-content-fields.component.html',
	styles: [
		`
			.date-control {
				position: relative;
			}
			.date-control input {
				padding-inline-end: 32px;
			}
			.calendar-toggle {
				position: absolute;
				inset-inline-end: 2px;
				inset-block: 0;
				width: 28px;
				padding: 5px;
				border: 0;
				background: transparent;
				color: var(--nuxeo-text-default, #3a3a54);
			}
			.calendar-toggle svg {
				display: block;
				width: 16px;
				height: 16px;
			}
			:host-context(.nx-document-edit-dialog) {
				.row {
					margin: 0;
					--bs-gutter-x: 0;
				}
				.col-12 {
					padding: 0 0 8px;
					margin-bottom: 16px !important;
				}
				.expiration-field {
					margin-bottom: 0 !important;
				}
				.field-label {
					font-size: 13px;
					line-height: 1.54;
					margin: 0;
				}
				.date-control {
					width: 158px;
					max-width: 100%;
					height: 34px;
					border: 1px solid var(--nuxeo-text-secondary, #6b7280);
				}
				.date-control input {
					height: 32px;
					min-height: 0;
					padding: 6px 32px 6px 8px;
					font-size: 13px;
					line-height: normal;
					border: 0;
					border-radius: 0;
					box-shadow: none;
					color: var(--nuxeo-text-default, #3a3a54);
				}
				.date-control:focus-within {
					outline: 2px solid var(--nuxeo-primary-color, #06f);
					outline-offset: 1px;
				}
				.date-control input:focus {
					outline: none;
				}
			}
			:host-context(.nx-document-edit-dialog) ::ng-deep nx-vocabulary {
				> .form-control {
					border: 0;
					padding: 0;
				}
				label {
					display: block;
					margin: 0;
					font-size: 13px;
					line-height: 1.54;
					font-weight: 400;
				}
				.ng-select {
					margin: 0;
				}
				.ng-select .ng-select-container {
					min-height: 31px;
					border: 0;
					border-bottom: 1px solid var(--nuxeo-text-default, #3a3a54);
					border-radius: 0;
					background: transparent;
					box-shadow: none;
					font-size: 13px;
					line-height: 20px;
				}
				.ng-select .ng-select-container .ng-value-container {
					padding: 0;
				}
				.ng-select .ng-select-container .ng-value-container .ng-input {
					padding: 0;
					inset-inline-start: 0;
				}
				.ng-select .ng-placeholder {
					color: var(--nuxeo-text-secondary, #666);
					padding: 0;
				}
				.ng-select.ng-select-discreet .ng-select-container .ng-arrow-wrapper {
					display: block;
					width: 24px;
					padding-inline-end: 7px;
				}
				.ng-select .ng-arrow {
					border-top-color: var(--nuxeo-text-default, #3a3a54);
				}
				.ng-select.ng-select-focused .ng-select-container {
					border-bottom: 2px solid var(--nuxeo-primary-color, #06f);
				}
			}
			.field-label,
			[role='alert'] {
				color: var(--nuxeo-text-default, var(--bs-body-color, #3a3a54));
			}
			[role='alert'] {
				border-inline-start: 3px solid var(--bs-danger);
				padding-inline-start: 0.5rem;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandardContentFieldsComponent extends NatureSubjectsCoverageExpirationComponent {
	private static nextId = 0;
	private readonly document = inject(DOCUMENT);
	private removeCalendarEscapeListener?: () => void;
	readonly fieldIdPrefix = `nx-standard-fields-${StandardContentFieldsComponent.nextId++}`;

	onCalendarShown(picker: BsDatepickerDirective, toggle: HTMLButtonElement): void {
		this.onCalendarHidden();
		const view = this.document.defaultView;
		if (!view) return;
		// The calendar is portalled to body. Consume its Escape before the enclosing
		// modal's window listener, including when focus is inside that portal.
		const closeCalendar = (event: KeyboardEvent) => {
			if (event.key !== 'Escape' || !picker.isOpen) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			picker.hide();
			toggle.focus();
		};
		view.addEventListener('keydown', closeCalendar, true);
		this.removeCalendarEscapeListener = () =>
			view.removeEventListener('keydown', closeCalendar, true);
	}

	onCalendarHidden(): void {
		this.removeCalendarEscapeListener?.();
		this.removeCalendarEscapeListener = undefined;
	}

	override ngOnDestroy(): void {
		this.onCalendarHidden();
		super.ngOnDestroy();
	}

	get expirationInvalid(): boolean {
		const expiration = this.formGroup.controls['dc:expired'];
		return expiration.touched && expiration.invalid;
	}
}
