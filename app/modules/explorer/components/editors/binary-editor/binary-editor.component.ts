import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import {
	DocumentFieldExtensionRegistry,
	DocumentLayoutContext,
	WebUiMessagePipe,
	documentLayoutContext,
} from '@maretha/webui-sdk';
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
	FormArray,
	UntypedFormBuilder,
	UntypedFormGroup,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { DocumentAttachmentsService } from 'app/modules/explorer/helpers/document-attachments.service';
import { ToastrService } from 'ngx-toastr';
import {
	NatureSubjectsCoverageExpiration,
	NatureSubjectsCoverageExpirationComponent,
} from '../nature-subjects-coverage-expiration/nature-subjects-coverage-expiration.component';
import { animations } from 'app/shared.constants';
import { TagsFormControlValue, TagsComponent } from '../tags/tags.component';
import { BaseEditorComponent } from '../base-editor/base-editor.component';
import { SupplementalDocumentFieldsComponent } from '../supplemental-document-fields.component';
import { LazyLoadDirective } from '../../../../../directives/lazy-load.directive';
import { NgTemplateOutlet, NgClass } from '@angular/common';
import { AutofocusDirective } from '../../../../../directives/autofocus.directive';
import { DocumentAttachmentsComponent } from '../../document-attachments/document-attachments.component';
import { AutosizeModule } from 'ngx-autosize';
import {
	BsDropdownDirective,
	BsDropdownToggleDirective,
	BsDropdownMenuDirective,
} from 'ngx-bootstrap/dropdown';

@Component({
	selector: 'nx-binary-editor',
	templateUrl: './binary-editor.component.html',
	styleUrls: ['./binary-editor.component.scss'],
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
		DocumentAttachmentsComponent,
		NatureSubjectsCoverageExpirationComponent,
		TagsComponent,
		AutosizeModule,
		BsDropdownDirective,
		BsDropdownToggleDirective,
		BsDropdownMenuDirective,
		WebUiMessagePipe,
		SupplementalDocumentFieldsComponent,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BinaryEditorComponent implements OnInit, OnDestroy {
	private readonly uiBinaryEditorComponentMessages = injectUiMessages(RuntimeUiMessages);

	private destroy$ = new Subject();

	@Input() add = true;
	@Input() parentDocument: any;
	@Input() documentType: string | undefined;
	@Input() documentSchemas: EditorSchema[] | undefined;
	readonly metadata = inject(EditorMetadata);
	@Input() documents: any[] = [];
	@Input() files: File[] | undefined;
	editorForm?: UntypedFormGroup | undefined;
	supplementalContext?: DocumentLayoutContext;
	private readonly fieldExtensions = inject(DocumentFieldExtensionRegistry);
	get hasSupplementalFields(): boolean {
		// Native binary bulk editing can contain mixed schemas. The single-document
		// layout extension must not add fields based on only one member of a bulk edit.
		return (
			this.documents.length === 1 &&
			!!this.supplementalContext &&
			this.fieldExtensions.candidates(this.supplementalContext).length > 0
		);
	}
	commonFieldValues: Record<string, string[]> = {};
	allowedMimeTypes: string[] = [];
	progress = 0;
	working = false;
	status?: string;
	save$ = new Subject();
	showExtraInfo = true;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly bsModalRef: BsModalRef,
		private readonly fb: UntypedFormBuilder,
		private readonly documentAttachmentsService: DocumentAttachmentsService,
		private readonly toastrService: ToastrService,
		private readonly cdr: ChangeDetectorRef,
	) {}

	// --------------------------------------------------------------------------------------------------
	mainAttachmentUpdated(files: any) {
		this.editorForm!.get('file:content')!.setValue(files[0]);
		this.editorForm!.get('file:content')?.markAsDirty();
	}

	// --------------------------------------------------------------------------------------------------
	additionalAttachmentsUpdated(files: any) {
		this.additionalFiles.clear();

		for (const file of files) this.additionalFiles.push(this.fb.control(file));

		this.additionalFiles.controls.forEach((x) => x.markAsDirty());

		this.additionalFiles.markAsDirty();
	}

	// --------------------------------------------------------------------------------------------------
	private get additionalFiles() {
		return this.editorForm!.get('files:files') as FormArray;
	}

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
				? this.uiBinaryEditorComponentMessages.text(
						'app.notices.the-file-has-been-successfully-created-618e09',
						'The file has been successfully created.',
					)
				: this.uiBinaryEditorComponentMessages.text(
						'app.notices.the-file-has-been-successfully-modified-4128ae',
						'The file has been successfully modified.',
					),
			this.uiBinaryEditorComponentMessages.text(
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
		const mainAttachment = this.documents.length === 1 ? this.documents[0].ng.attachment : null;
		const additionalAttachments =
			this.documents.length === 1 && this.documents[0].ng.attachments
				? this.fb.array(this.documents[0].ng.attachments.map((x: File) => this.fb.control(x)))
				: this.fb.array([]);

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

		const tags: TagsFormControlValue = {} as TagsFormControlValue;
		tags['nxtag:tags'] = !this.add
			? this.documents[0].properties['nxtag:tags']?.map((x: any) => x.label)
			: [];

		this.editorForm = this.fb.group({
			['dc:title']: [this.getCommonValue('dc:title'), Validators.required],
			['file:content']: [mainAttachment],
			['files:files']: additionalAttachments,
			['dc:description']: [this.getCommonValue('dc:description')],
			natureSubjectsCoverageExpiration: [natureSubjectsCoverageExpiration],
			tags: [tags],
		});

		if (this.add && (mainAttachment || additionalAttachments.length)) this.editorForm.markAsDirty();
		this.supplementalContext = documentLayoutContext({
			documentType: this.documentType || this.documents[0]?.type,
			mode: this.add ? 'create' : 'edit',
			document: this.documents[0],
			parentDocument: this.parentDocument,
		});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		if (this.add && !this.parentDocument)
			throw 'nx-binary-editor: You must specify the parent document';

		if (this.add && !this.documentType)
			throw 'nx-binary-editor: You must specify the document type';

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
