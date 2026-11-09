import { WebUiMessages } from './webui-messages';
import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BulkFieldChange, BulkLayoutContext, BulkUpdateMode } from './bulk-layout';
import { NuxeoBulkWidgetComponent } from './primitives/projection-primitives';

@Component({
	selector: 'nx-default-bulk-layout',
	standalone: true,
	imports: [FormsModule, NuxeoBulkWidgetComponent],
	template: `@for (field of fields; track field.property) {
		<nx-bulk-widget
			[label]="fieldLabel(field)"
			[multivalued]="field.multiple"
			[mode]="field.mode"
			[message]="fieldError(field)"
			[error]="!!fieldError(field)"
			(modeChanged)="mode(field, $event)"
			><ng-template #content>
				@if (field.date) {
					<input
						type="date"
						[attr.aria-label]="fieldLabel(field)"
						[disabled]="field.mode === 'keep' || field.mode === 'remove'"
						[ngModel]="field.value"
						(ngModelChange)="value(field, $event)"
						[attr.name]="field.property"
					/>
				} @else if (field.multiple) {
					<select
						multiple
						[attr.aria-label]="fieldLabel(field)"
						[disabled]="field.mode === 'keep' || field.mode === 'remove'"
						[ngModel]="field.value"
						(ngModelChange)="value(field, $event)"
						[attr.name]="field.property"
					>
						@for (option of options[field.property] || []; track option.id) {
							<option [ngValue]="option.id">{{ option.label }}</option>
						}
					</select>
				} @else {
					<select
						[attr.aria-label]="fieldLabel(field)"
						[disabled]="field.mode === 'keep' || field.mode === 'remove'"
						[ngModel]="field.value"
						(ngModelChange)="value(field, $event)"
						[attr.name]="field.property"
					>
						<option value=""></option>
						@for (option of options[field.property] || []; track option.id) {
							<option [ngValue]="option.id">{{ option.label }}</option>
						}
					</select>
				}
			</ng-template></nx-bulk-widget
		>
	}`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefaultBulkLayoutComponent {
	private readonly messages = inject(WebUiMessages);
	@Input({ required: true }) context!: BulkLayoutContext;
	/** Directory values are supplied by the application gateway; ids are never free-form text. */
	@Input() options: Record<string, readonly { id: string; label: string }[]> = {};
	fields: {
		property: string;
		label: string;
		labelKey?: string;
		multiple: boolean;
		date: boolean;
		mode: BulkUpdateMode;
		value: string | string[];
	}[] = [
		{
			property: 'dc:nature',
			label: 'Nature',
			labelKey: 'sdk.bulk.nature',
			multiple: false,
			date: false,
			mode: 'keep' as BulkUpdateMode,
			value: '',
		},
		{
			property: 'dc:subjects',
			label: 'Subjects',
			labelKey: 'sdk.bulk.subjects',
			multiple: true,
			date: false,
			mode: 'keep' as BulkUpdateMode,
			value: [] as string[],
		},
		{
			property: 'dc:coverage',
			label: 'Coverage',
			labelKey: 'sdk.bulk.coverage',
			multiple: false,
			date: false,
			mode: 'keep' as BulkUpdateMode,
			value: '',
		},
		{
			property: 'dc:expired',
			label: 'Expiration date',
			labelKey: 'sdk.bulk.expiration',
			multiple: false,
			date: true,
			mode: 'keep' as BulkUpdateMode,
			value: '',
		},
	];
	mode(field: (typeof this.fields)[number], mode: BulkUpdateMode) {
		field.mode = mode;
		this.emit();
	}
	value(field: (typeof this.fields)[number], value: string | string[]) {
		field.value = field.multiple ? (Array.isArray(value) ? value : value ? [value] : []) : value;
		this.emit();
	}
	fieldError(field: (typeof this.fields)[number]): string {
		if (field.mode === 'keep' || field.mode === 'remove') return '';
		const empty = field.multiple
			? !Array.isArray(field.value) || !field.value.length
			: field.value === undefined || field.value === null || field.value === '';
		return empty
			? this.messages.format(
					'sdk.bulk.chooseValue',
					{},
					'Choose a value before applying this change.',
				)
			: '';
	}
	fieldLabel(field: (typeof this.fields)[number]): string {
		return field.labelKey ? this.messages.text(field.labelKey, field.label) : field.label;
	}
	private emit() {
		this.context.commit(
			this.fields.map(
				({ property, mode, value }) => ({ property, mode, value }) as BulkFieldChange,
			),
		);
	}
}
