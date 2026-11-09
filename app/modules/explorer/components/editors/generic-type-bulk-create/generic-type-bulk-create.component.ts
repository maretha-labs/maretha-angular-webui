import { errorMessage } from 'app/helpers/localized-message';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectorRef,
	Component,
	Input,
	OnInit,
	OnDestroy,
	ChangeDetectionStrategy,
	inject,
	DestroyRef,
} from '@angular/core';
import {
	AbstractControl,
	FormArray,
	UntypedFormBuilder,
	UntypedFormGroup,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BulkDocumentCreation } from '../../../helpers/bulk-document-creation.service';
import { BulkCreationResultsComponent } from '../bulk-creation-results/bulk-creation-results.component';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { AlertComponent } from 'ngx-bootstrap/alert';
import { DocumentAttachmentsComponent } from '../../document-attachments/document-attachments.component';
import { NgClass, LowerCasePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { NgxTranslateCutModule } from 'ngx-translate-cut';
import {
	NatureSubjectsCoverageExpiration,
	NatureSubjectsCoverageExpirationComponent,
} from '../nature-subjects-coverage-expiration/nature-subjects-coverage-expiration.component';

@Component({
	selector: 'nx-generic-type-bulk-create',
	providers: [BulkDocumentCreation],
	templateUrl: './generic-type-bulk-create.component.html',
	styleUrls: ['./generic-type-bulk-create.component.scss'],
	imports: [
		FormsModule,
		ReactiveFormsModule,
		AlertComponent,
		DocumentAttachmentsComponent,
		NgClass,
		BulkCreationResultsComponent,
		LowerCasePipe,
		TranslateModule,
		NgxTranslateCutModule,
		NatureSubjectsCoverageExpirationComponent,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenericTypeBulkCreateComponent implements OnInit, OnDestroy {
	@Input() parentDocument: any;
	@Input() files: File[] = [];
	@Input() documentType: string | undefined;
	editorForm?: UntypedFormGroup | undefined;
	allowedMimeTypes: string[] = [];
	readonly batch = inject(BulkDocumentCreation);
	private readonly destroy = inject(DestroyRef);
	private readonly errorText = localizedText();
	get error(): string {
		return this.errorText();
	}
	set error(value: string | MessageText) {
		this.errorText.set(value);
	}
	loading = false;
	get working(): boolean {
		return this.batch.working();
	}
	save$ = new Subject();
	canUpload = false;
	/** The five built-in import layouts all expose the common Dublin Core profile. */
	get usesDefaultImportProfile(): boolean {
		return ['audio', 'file', 'note', 'picture', 'video'].includes(
			this.documentType?.toLowerCase() ?? '',
		);
	}
	get isNoteImport(): boolean {
		return this.documentType?.toLowerCase() === 'note';
	}

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly bsModalRef: BsModalRef,
		private readonly fb: UntypedFormBuilder,
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly cdr: ChangeDetectorRef,
	) {
		this.batch.watchDeparture(
			() => !this.batch.started() && (this.files.length > 0 || !!this.editorForm?.dirty),
			() => this.bsModalRef.hide(),
		);
	}

	// --------------------------------------------------------------------------------------------------
	async saveChanges(): Promise<void> {
		if (this.working || !this.editorForm || this.editorForm.invalid) return;
		this.error = '';
		try {
			if (!this.batch.started()) {
				const properties = this.importProperties();
				this.batch.configure(
					this.parentDocument,
					this.additionalFiles.controls.map((c) => c.value),
					() => this.documentType!,
					this.isNoteImport
						? (file) => ({ ...properties, 'note:mime_type': this.noteMimeType(file) })
						: properties,
					() =>
						this.isNoteImport
							? { kind: 'utf8-text', property: 'note:note' }
							: { kind: 'upload', property: 'file:content' },
				);
			}
			await this.batch.run();
		} catch (error) {
			this.error =
				error instanceof Error
					? errorMessage(error)
					: messageText(
							'app.state.the-import-could-not-be-started-4aad57',
							'The import could not be started.',
						);
		}
		this.cdr.markForCheck();
	}

	// --------------------------------------------------------------------------------------------------
	close(): void {
		if (
			!this.batch.canLeave(
				!this.batch.started() && (this.files.length > 0 || !!this.editorForm?.dirty),
			)
		)
			return;
		if (this.batch.complete()) {
			this.editorForm?.markAsPristine();
			this.save$.next(this.batch.documents);
		}
		this.bsModalRef.hide();
	}

	// --------------------------------------------------------------------------------------------------
	attachmentsUpdated(files: any) {
		if (this.batch.started()) return;
		this.additionalFiles.clear();

		for (const file of files) this.additionalFiles.push(this.fb.control(file));

		this.additionalFiles.controls.forEach((x) => x.markAsDirty());

		this.additionalFiles.markAsDirty();
	}

	// --------------------------------------------------------------------------------------------------
	get additionalFiles() {
		return this.editorForm!.get('files:files') as FormArray;
	}

	// --------------------------------------------------------------------------------------------------
	getValidationClassName(controlName: string | string[]): string {
		if (this.editorForm!.get(controlName)?.dirty)
			return this.editorForm!.get(controlName)?.valid ? 'is-valid' : 'is-invalid';

		return '';
	}

	// --------------------------------------------------------------------------------------------------
	private setupForm() {
		const commonMetadata: NatureSubjectsCoverageExpiration = {} as NatureSubjectsCoverageExpiration;
		this.editorForm = this.fb.group({
			['files:files']: this.fb.array([], this.minLengthArrayValidator(1)),
			['dc:description']: [],
			...(this.usesDefaultImportProfile
				? { natureSubjectsCoverageExpiration: [commonMetadata] }
				: {}),
			...(this.isNoteImport ? { ['note:mime_type']: [] } : {}),
		});
	}

	private importProperties(): Record<string, unknown> {
		const properties: Record<string, unknown> = {};
		const description = this.editorForm?.get('dc:description');
		if (description?.value != null) properties['dc:description'] = description.value;
		const common = this.editorForm?.get('natureSubjectsCoverageExpiration');
		if (common?.dirty && common.value)
			for (const [name, value] of Object.entries(common.value)) properties[name] = value;
		const mimeType = this.editorForm?.get('note:mime_type');
		if (mimeType?.dirty && mimeType.value) properties['note:mime_type'] = mimeType.value;
		return properties;
	}

	private noteMimeType(file: File): string {
		const selected = this.editorForm?.get('note:mime_type')?.value;
		if (selected) return selected;
		switch (file.type.toLowerCase()) {
			case 'text/html':
				return 'text/html';
			case 'text/xml':
			case 'application/xml':
				return 'text/xml';
			case 'text/markdown':
			case 'text/x-markdown':
			case 'text/x-web-markdown':
				return 'text/x-web-markdown';
			default:
				return 'text/plain';
		}
	}

	// --------------------------------------------------------------------------------------------------
	private minLengthArrayValidator(min: number) {
		return (c: AbstractControl): Record<string, boolean> | null =>
			c.value.length >= min ? null : { minLengthArray: false };
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		if (!this.parentDocument)
			throw 'nx-generic-type-bulk-create: You must specify the parent document';

		this.loadMetadata();
	}
	loadMetadata(): void {
		if (this.loading || this.batch.started()) return;
		this.loading = true;
		this.error = '';
		this.documentsManagerService
			.getDocumentType(this.documentType!)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe({
				next: (type: any) => {
					this.canUpload =
						type.schemas?.some((s: any) => s.name === 'file') === true || this.isNoteImport;
					this.loading = false;
					if (this.canUpload) {
						this.setupForm();
						this.attachmentsUpdated(this.files);
					} else
						this.error = messageText(
							'app.state.this-document-type-does-not-support-a-main-fi-c08948',
							'This document type does not support a main file. Choose another type.',
						);
					this.cdr.markForCheck();
				},
				error: () => {
					this.loading = false;
					this.error = messageText(
						'app.state.document-type-information-could-not-be-loaded-877c5c',
						'Document type information could not be loaded.',
					);
					this.cdr.markForCheck();
				},
			});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.save$.complete();
	}
}
