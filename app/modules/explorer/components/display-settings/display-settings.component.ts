import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import {
	FormArray,
	UntypedFormBuilder,
	UntypedFormGroup,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import {
	DocumentManagerMode,
	DocumentsManagerService,
} from 'app/modules/explorer/helpers/documents-manager.service';
import {
	LayoutService,
	LayoutDisplayMode,
	ILayoutSortField,
} from 'app/modules/explorer/helpers/layout.service';
import { Subject } from 'rxjs';
import {
	BsDropdownDirective,
	BsDropdownToggleDirective,
	BsDropdownMenuDirective,
} from 'ngx-bootstrap/dropdown';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { AutofocusDirective } from '../../../../directives/autofocus.directive';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { ButtonRadioGroupDirective, ButtonRadioDirective } from 'ngx-bootstrap/buttons';
import { KeyValuePipe } from '@angular/common';

@Component({
	selector: 'nx-display-settings',
	templateUrl: './display-settings.component.html',
	styleUrls: ['./display-settings.component.scss'],
	imports: [
		WebUiNumberPipe,
		FormsModule,
		ReactiveFormsModule,
		BsDropdownDirective,
		BsDropdownToggleDirective,
		TooltipDirective,
		AutofocusDirective,
		BsDropdownMenuDirective,
		FontAwesomeModule,
		ButtonRadioGroupDirective,
		ButtonRadioDirective,
		KeyValuePipe,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisplaySettingsComponent implements OnInit, OnDestroy {
	displaySettingsForm?: UntypedFormGroup | undefined;
	availableSortFields: Record<string, { label: string; disabled: boolean }> | undefined;
	canAddSortField = false;
	sortFields: ILayoutSortField[] = [];
	itemsPerPage = [5, 10, 20, 30, 40, 50];
	documentManagerMode: DocumentManagerMode = DocumentManagerMode.Unknown;

	private destroy$ = new Subject();

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly fb: UntypedFormBuilder,
		readonly layoutService: LayoutService,
		private readonly documentsManagerService: DocumentsManagerService,
	) {
		this.documentManagerMode = documentsManagerService.mode;
	}

	get orderedFolder(): boolean {
		return (
			this.documentsManagerService.mode === DocumentManagerMode.BrowseDocuments &&
			!!this.documentsManagerService.documentInfo?.facets?.includes('Orderable')
		);
	}

	// --------------------------------------------------------------------------------------------------
	applyDisplaySettings() {
		this.layoutService.displayMode = LayoutDisplayMode.Table;
		this.layoutService.pageSize = this.displaySettingsForm?.get('pageSize')?.value | 0;
		this.layoutService.sortFields = this.sortFieldsFormArray.value.map((x: any) => x.fieldName);
		this.layoutService.sortAscending = !!this.displaySettingsForm?.get('sortFieldAscending')?.value;
		this.layoutService.showInfoPanel = !!this.displaySettingsForm?.get('showInfoPanel')?.value;

		this.layoutService.emitUpdateEvents();

		this.displaySettingsForm?.markAsPristine();
	}

	// --------------------------------------------------------------------------------------------------
	addSortField(index: number) {
		const control = this.fb.group({
			fieldName: [null, Validators.required],
			fieldLabel: [],
		});

		this.sortFieldsFormArray.insert(index, control);
	}

	// --------------------------------------------------------------------------------------------------
	updateSortField(index: number, fieldName: string) {
		// Must use setTimeout because otherwise the UI gets updated too fast,
		// by removing certain UI elements that the popover needs to evaluate
		// its visibility.
		setTimeout(() => {
			const currentFieldName = this.sortFieldsFormArray.at(index).get('fieldName')?.value;

			// If there's another sort filter with the same field name, switch between them
			const existingSortField = this.sortFieldsFormArray.controls.find(
				(x) => x.value.fieldName === fieldName,
			);
			if (existingSortField) {
				existingSortField.get('fieldName')?.setValue(currentFieldName);
				existingSortField
					.get('fieldLabel')
					?.setValue(this.layoutService.availableSortFields[currentFieldName]);
			}

			this.sortFieldsFormArray.at(index).get('fieldName')?.setValue(fieldName);
			this.sortFieldsFormArray
				.at(index)
				.get('fieldLabel')
				?.setValue(this.layoutService.availableSortFields[fieldName]);

			this.computeAvailableSortFields();

			this.displaySettingsForm?.markAsDirty();
		});
	}

	// --------------------------------------------------------------------------------------------------
	removeSortField(index: number) {
		this.sortFieldsFormArray.removeAt(index);

		this.computeAvailableSortFields();

		this.displaySettingsForm?.markAsDirty();
	}

	// --------------------------------------------------------------------------------------------------
	private computeAvailableSortFields() {
		const availableSortFields = Object.keys(this.layoutService.availableSortFields)
			.sort((a, b) => a.localeCompare(b))
			.reduce((agg: any, key) => {
				agg[key] = {
					label: this.layoutService.availableSortFields[key],
					disabled: this.sortFieldsFormArray.controls.some((x) => x.value.fieldName === key),
				};

				return agg;
			}, {});

		this.availableSortFields = availableSortFields;
		this.canAddSortField =
			Object.keys(availableSortFields).length > 0 &&
			this.sortFieldsFormArray.controls.length < Object.keys(availableSortFields).length;
	}

	// --------------------------------------------------------------------------------------------------
	get sortFieldsFormArray(): FormArray {
		return this.displaySettingsForm?.get('sortFields') as FormArray;
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		// TODO: Depending on the current document type, add more sort fields if necessary
		const sortFields = this.layoutService.sortFields.map((x) =>
			this.fb.group({
				fieldName: [x],
				fieldLabel: [this.layoutService.availableSortFields[x]],
			}),
		);

		this.displaySettingsForm = this.fb.group({
			sortFields: this.fb.array(sortFields),
			sortFieldAscending: [this.layoutService.sortAscending ? 'true' : ''],
			showInfoPanel: [this.layoutService.showInfoPanel ? 'true' : ''],
			pageSize: [this.layoutService.pageSize.toString()],
		});

		this.computeAvailableSortFields();
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy() {
		this.destroy$.next(0);
	}
}
