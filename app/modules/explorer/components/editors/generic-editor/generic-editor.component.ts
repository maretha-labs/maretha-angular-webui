import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { EditorMetadata, EditorSchema } from '../../../helpers/editor-metadata.service';
import { EditorMetadataStatusComponent } from '../editor-metadata-status.component';
import {
	ChangeDetectorRef,
	Component,
	Input,
	OnDestroy,
	OnInit,
	ChangeDetectionStrategy,
	inject,
} from '@angular/core';
import {
	UntypedFormBuilder,
	UntypedFormGroup,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { DocumentAttachmentsService } from 'app/modules/explorer/helpers/document-attachments.service';
import { ToastService } from 'app/helpers/toast.service';
import {
	NatureSubjectsCoverageExpiration,
	NatureSubjectsCoverageExpirationComponent,
} from '../nature-subjects-coverage-expiration/nature-subjects-coverage-expiration.component';
import { animations } from 'app/shared.constants';
import { TagsFormControlValue, TagsComponent } from '../tags/tags.component';
import { BaseEditorComponent } from '../base-editor/base-editor.component';
import { LazyLoadDirective } from '../../../../../directives/lazy-load.directive';
import { NgTemplateOutlet, NgClass } from '@angular/common';
import { AutofocusDirective } from '../../../../../directives/autofocus.directive';
import { AutosizeModule } from 'ngx-autosize';
import {
	BsDropdownDirective,
	BsDropdownToggleDirective,
	BsDropdownMenuDirective,
} from 'ngx-bootstrap/dropdown';

@Component({
	selector: 'nx-generic-editor',
	templateUrl: './generic-editor.component.html',
	styleUrls: ['./generic-editor.component.scss'],
	animations: [animations.verticalInOutAnimation],
	providers: [EditorMetadata],
	imports: [
		EditorMetadataStatusComponent,
		BaseEditorComponent,
		LazyLoadDirective,
		FormsModule,
		ReactiveFormsModule,
		NgTemplateOutlet,
		NgClass,
		AutofocusDirective,
		NatureSubjectsCoverageExpirationComponent,
		TagsComponent,
		AutosizeModule,
		BsDropdownDirective,
		BsDropdownToggleDirective,
		BsDropdownMenuDirective,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenericEditorComponent implements OnInit, OnDestroy {
	private readonly uiGenericEditorComponentMessages = injectUiMessages(RuntimeUiMessages);

	private destroy$ = new Subject();

	@Input() add = true;
	@Input() parentDocument: any;
	@Input() documentType: string | undefined;
	@Input() documentSchemas: EditorSchema[] | undefined;
	readonly metadata = inject(EditorMetadata);
	@Input() documents: any[] = [];
	editorForm?: UntypedFormGroup | undefined;
	commonFieldValues: Record<string, string[]> = {};
	save$ = new Subject();
	showExtraInfo = false;
	get isPictureBook(): boolean {
		return this.documentType?.toLowerCase() === 'picturebook';
	}
	get usesSourceMetadataFields(): boolean {
		return [
			'collection',
			'collections',
			'favorites',
			'folder',
			'orderedfolder',
			'root',
			'section',
			'sectionroot',
			'template',
			'templateroot',
			'userworkspacesroot',
			'workspace',
			'workspaceroot',
		].includes(this.documentType?.toLowerCase() ?? '');
	}

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly bsModalRef: BsModalRef,
		private readonly fb: UntypedFormBuilder,
		private readonly documentAttachmentsService: DocumentAttachmentsService,
		private readonly toastrService: ToastService,
		private readonly cdr: ChangeDetectorRef,
	) {}

	// --------------------------------------------------------------------------------------------------
	close() {
		this.metadata.cancel();
		this.bsModalRef.hide();
	}

	// --------------------------------------------------------------------------------------------------
	saveChanges(documents: any) {
		this.save$.next(documents);
		this.toastrService.success(
			this.add
				? this.uiGenericEditorComponentMessages.text(
						'app.notices.the-file-has-been-successfully-created-618e09',
						'The file has been successfully created.',
					)
				: this.uiGenericEditorComponentMessages.text(
						'app.notices.the-file-has-been-successfully-modified-4128ae',
						'The file has been successfully modified.',
					),
			this.uiGenericEditorComponentMessages.text(
				'app.notices.document-saved-e81dde',
				'Document saved',
			),
			{ enableHtml: false },
		);
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
	private setupForm() {
		const sourceFieldProfile = this.isPictureBook || this.usesSourceMetadataFields;
		const natureSubjectsCoverageExpiration: NatureSubjectsCoverageExpiration =
			{} as NatureSubjectsCoverageExpiration;

		if (this.documents.length === 1 && !this.add) {
			natureSubjectsCoverageExpiration['dc:coverage'] = this.documents[0].properties['dc:coverage'];
			natureSubjectsCoverageExpiration['dc:nature'] = this.documents[0].properties['dc:nature'];
			natureSubjectsCoverageExpiration['dc:subjects'] = this.documents[0].properties['dc:subjects'];
			natureSubjectsCoverageExpiration['dc:expired'] = this.documents[0].properties['dc:expired']
				? new Date(this.documents[0].properties['dc:expired'])
				: null;
		}

		const controls: Record<string, any> = {
			['dc:title']: [this.getCommonValue('dc:title'), Validators.required],
			['dc:description']: [this.getCommonValue('dc:description')],
		};
		if (!this.isPictureBook)
			controls['natureSubjectsCoverageExpiration'] = [natureSubjectsCoverageExpiration];
		if (!sourceFieldProfile) {
			const tags: TagsFormControlValue = {} as TagsFormControlValue;
			tags['nxtag:tags'] = !this.add
				? this.documents[0].properties['nxtag:tags']?.map((x: any) => x.label)
				: [];
			controls['tags'] = [tags];
		}

		this.editorForm = this.fb.group(controls);
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		this.showExtraInfo = this.usesSourceMetadataFields;
		if (this.add && !this.parentDocument)
			throw 'nx-generic-type-editor: You must specify the parent document';

		if (this.add && !this.documentType)
			throw 'nx-generic-type-editor: You must specify the document type';

		if (this.add)
			this.documents = [
				{
					parentRef: this.parentDocument.uid,
					type: this.documentType,
					properties: {},
					ng: {},
				},
			];

		if (this.add) this.loadMetadata();
		else this.setupForm();
	}

	loadMetadata(): void {
		if (this.editorForm) return;
		this.metadata.load(this.documentType, this.documentSchemas, (schemas) => {
			this.documents.forEach((doc) => {
				doc.ng.canUpload = schemas.some(
					(schema) => schema.name === 'file' || schema.name === 'files',
				);
			});
			this.setupForm();
			this.cdr.markForCheck();
		});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.destroy$.next(0);
		this.destroy$.complete();
		this.save$.complete();
	}
}
