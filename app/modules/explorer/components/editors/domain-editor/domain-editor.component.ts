import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, Input, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import {
	UntypedFormBuilder,
	UntypedFormGroup,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { BaseEditorComponent } from '../base-editor/base-editor.component';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { NgTemplateOutlet, NgClass } from '@angular/common';
import { AutofocusDirective } from '../../../../../directives/autofocus.directive';
import {
	BsDropdownDirective,
	BsDropdownToggleDirective,
	BsDropdownMenuDirective,
} from 'ngx-bootstrap/dropdown';
import {
	NatureSubjectsCoverageExpiration,
	NatureSubjectsCoverageExpirationComponent,
} from '../nature-subjects-coverage-expiration/nature-subjects-coverage-expiration.component';

@Component({
	selector: 'nx-domain-editor',
	templateUrl: './domain-editor.component.html',
	styleUrls: ['./domain-editor.component.scss'],
	imports: [
		BaseEditorComponent,
		FormsModule,
		ReactiveFormsModule,
		NgTemplateOutlet,
		NgClass,
		AutofocusDirective,
		BsDropdownDirective,
		BsDropdownToggleDirective,
		BsDropdownMenuDirective,
		NatureSubjectsCoverageExpirationComponent,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DomainEditorComponent implements OnInit, OnDestroy {
	@Input()
	add = true;

	@Input()
	parentDocument: any;

	@Input()
	documentType: string | undefined;

	@Input()
	documents: any[] = [];

	editorForm?: UntypedFormGroup | undefined;
	commonFieldValues: Record<string, string[]> = {};

	readonly save$ = new Subject<any[]>();

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly bsModalRef: BsModalRef,
		private readonly fb: UntypedFormBuilder,
	) {}

	// --------------------------------------------------------------------------------------------------
	close() {
		this.bsModalRef.hide();
	}

	// --------------------------------------------------------------------------------------------------
	saveChanges(documents: any[]): void {
		this.save$.next(documents);
		this.bsModalRef.hide();
	}

	// --------------------------------------------------------------------------------------------------
	useExistingValue = (controlName: string, value: any) => {
		const control = this.editorForm!.get(controlName);

		if (!control) return;

		control.setValue(value);
		control.markAsDirty();
	};

	// --------------------------------------------------------------------------------------------------
	resetFieldValue(controlName: string) {
		const control = this.editorForm!.get(controlName);

		if (!control) return;

		control.clearValidators();
		control.clearAsyncValidators();

		if (this.commonFieldValues[controlName]?.length === 1)
			control.setValue(this.getCommonValue(controlName));
		else control.setValue(null);

		control.markAsPristine();
	}

	// --------------------------------------------------------------------------------------------------
	getValidationClassName(controlName: string | string[]): string {
		if (this.editorForm!.get(controlName)?.dirty)
			return this.editorForm!.get(controlName)?.valid ? 'is-valid' : 'is-invalid';

		return '';
	}

	// --------------------------------------------------------------------------------------------------
	getCommonValue(fieldName: string) {
		if (this.commonFieldValues[fieldName])
			return this.commonFieldValues[fieldName].length === 1
				? this.commonFieldValues[fieldName][0]
				: null;

		if (this.documents.length === 1) {
			this.commonFieldValues[fieldName] = [this.documents[0]?.properties[fieldName]];

			return this.documents[0]?.properties[fieldName];
		}

		const uniqueValues: string[] = this.documents
			.map((x) => x.properties[fieldName])
			.filter((value, index, self) => self.indexOf(value) === index);

		this.commonFieldValues[fieldName] = uniqueValues;

		return uniqueValues.length === 1 ? uniqueValues[0] : null;
	}

	// --------------------------------------------------------------------------------------------------

	// --------------------------------------------------------------------------------------------------
	private setupForm() {
		const common: NatureSubjectsCoverageExpiration = {} as NatureSubjectsCoverageExpiration;
		if (this.documents.length === 1 && !this.add) {
			common['dc:nature'] = this.documents[0].properties['dc:nature'];
			common['dc:subjects'] = this.documents[0].properties['dc:subjects'];
			common['dc:coverage'] = this.documents[0].properties['dc:coverage'];
			common['dc:expired'] = this.documents[0].properties['dc:expired']
				? new Date(this.documents[0].properties['dc:expired'])
				: null;
		}
		this.editorForm = this.fb.group({
			['dc:title']: [this.getCommonValue('dc:title'), Validators.required],
			['dc:description']: [this.getCommonValue('dc:description')],
			natureSubjectsCoverageExpiration: [common],
		});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		if (this.add && !this.parentDocument)
			throw 'nx-domain-editor: You must specify the parent document';

		if (this.add && !this.documentType)
			throw 'nx-domain-editor: You must specify the document type';

		if (this.add)
			this.documents = [
				{
					parentRef: this.parentDocument.uid,
					type: this.documentType,
					properties: {},
				},
			];

		this.setupForm();
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.save$.complete();
	}
}
