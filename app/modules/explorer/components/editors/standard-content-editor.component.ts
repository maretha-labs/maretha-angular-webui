import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import {
	ChangeDetectionStrategy,
	Component,
	Input,
	OnChanges,
	OnDestroy,
	OnInit,
	SimpleChanges,
	ViewChild,
	inject,
} from '@angular/core';
import {
	ReactiveFormsModule,
	UntypedFormBuilder,
	UntypedFormGroup,
	Validators,
} from '@angular/forms';
import {
	DocumentFieldExtensionRegistry,
	DocumentLayoutContext,
	documentLayoutContext,
} from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { BaseEditorComponent } from './base-editor/base-editor.component';
import { StandardContentFieldsComponent } from './standard-content-fields.component';
import { SupplementalDocumentFieldsComponent } from './supplemental-document-fields.component';

/** Exact create/edit fields for explicitly registered standard source layouts. */
@Component({
	selector: 'nx-standard-content-editor',
	standalone: true,
	imports: [
		BaseEditorComponent,
		ReactiveFormsModule,
		StandardContentFieldsComponent,
		SupplementalDocumentFieldsComponent,
		WebUiMessagePipe,
		CdkTextareaAutosize,
	],
	template: `
		@if (editorForm) {
			<nx-base-editor
				[announceSuccess]="true"
				[add]="add"
				[parentDocument]="parentDocument"
				[documentType]="documentType"
				[documents]="documents"
				[editorForm]="editorForm"
				[saveButtonLabel]="
					add
						? ('app.runtime.standard-content-editor.create-049116' | webuiMessage: 'Create')
						: ('app.runtime.standard-content-editor.save-d06564' | webuiMessage: 'Save')
				"
				[cancelButtonLabel]="
					'app.runtime.standard-content-editor.cancel-da79c8' | webuiMessage: 'Cancel'
				"
				(close)="close()"
				(save)="saved($event)"
			>
				<div modalTitle>
					{{ 'editor.typeHeading' | webuiMessage:'{action, select, create {Create {type}} other
					{Edit {type}}}': {action: (add ? 'create' : 'edit'), type: documentType} }}
				</div>
				<form modalBody [formGroup]="editorForm" novalidate>
					<div class="field">
						<label [for]="fieldIdPrefix + '-title'">
							{{ 'label.dublincore.title' | webuiMessage: 'Title' }}
							<span class="required-marker" aria-hidden="true">*</span>
						</label>
						<input
							[id]="fieldIdPrefix + '-title'"
							class="form-control"
							formControlName="dc:title"
							required
							[attr.aria-invalid]="titleInvalid ? 'true' : null"
							[attr.aria-describedby]="titleInvalid ? fieldIdPrefix + '-title-error' : null"
						/>
						@if (titleInvalid) {
							<p [id]="fieldIdPrefix + '-title-error'" role="alert">
								{{
									'app.modules.standard-content-editor.please-specify-a-title-92e0dc'
										| webuiMessage: 'Please specify a title.'
								}}
							</p>
						}
					</div>
					<div class="field">
						<label [for]="fieldIdPrefix + '-description'">{{
							'app.modules.standard-content-editor.description-e65128' | webuiMessage: 'Description'
						}}</label>
						@if (documentType === 'PictureBook') {
							<input
								[id]="fieldIdPrefix + '-description'"
								class="form-control"
								formControlName="dc:description"
							/>
						} @else {
							<textarea
								[id]="fieldIdPrefix + '-description'"
								class="form-control"
								formControlName="dc:description"
								[rows]="add ? 3 : 1"
								[cdkTextareaAutosize]="!add"
								[cdkAutosizeMinRows]="1"
							></textarea>
						}
					</div>
					@if (documentType === 'Note') {
						<div class="field">
							<label [for]="fieldIdPrefix + '-format'">{{
								'app.modules.standard-content-editor.format-0c0c5d' | webuiMessage: 'Format'
							}}</label>
							<select
								[id]="fieldIdPrefix + '-format'"
								class="form-select"
								formControlName="note:mime_type"
							>
								<option value="text/html">{{ 'mimetype.text/html' | webuiMessage: 'HTML' }}</option>
								<option value="text/plain">
									{{ 'mimetype.text/plain' | webuiMessage: 'Text' }}
								</option>
								<option value="text/xml">{{ 'mimetype.text/xml' | webuiMessage: 'XML' }}</option>
								<option value="text/x-web-markdown">
									{{ 'mimetype.text/x-web-markdown' | webuiMessage: 'Markdown' }}
								</option>
							</select>
						</div>
					} @else if (add && ['Audio', 'Video', 'File'].includes(documentType)) {
						<div class="field">
							<label [for]="fieldIdPrefix + '-file'">{{
								'app.modules.standard-content-editor.file-d0c84e' | webuiMessage: 'File'
							}}</label>
							<input
								[id]="fieldIdPrefix + '-file'"
								type="file"
								class="form-control"
								(change)="selectFile($event)"
							/>
							@if (editorForm.get('file:content')?.value) {
								<span>{{ editorForm.get('file:content')?.value.name }}</span>
								<button type="button" class="btn btn-link" (click)="clearFile()">
									{{
										'app.modules.standard-content-editor.remove-file-73be3e'
											| webuiMessage: 'Remove file'
									}}
								</button>
							}
						</div>
					}
					@if (documentType !== 'PictureBook') {
						<nx-standard-content-fields formControlName="natureSubjectsCoverageExpiration" />
					}
					@if (supplementalContext && hasSupplementalFields) {
						<nx-supplemental-document-fields
							[context]="supplementalContext"
							[editorForm]="editorForm"
						/>
					}
				</form>
			</nx-base-editor>
		}
	`,
	styles: [
		`
			.field {
				margin-bottom: 1rem;
			}
			.form-control,
			.form-select,
			:host ::ng-deep nx-standard-content-fields .form-control,
			:host ::ng-deep nx-standard-content-fields .ng-select .ng-select-container {
				border: 0;
				border-bottom: 1px solid var(--nuxeo-border);
				border-radius: 0;
				background: transparent;
				padding-inline: 0;
			}
			:host ::ng-deep nx-standard-content-fields nx-vocabulary > .form-control {
				border-bottom: 0;
				padding: 0;
			}
			label {
				display: block;
				margin-bottom: 0.35rem;
			}
			.required-marker {
				color: var(--nuxeo-error-text, #d22a15);
			}
			:host-context(.nx-document-edit-dialog) {
				.field {
					padding-bottom: 8px;
					margin-bottom: 16px;
				}
				label {
					font-size: 13px;
					line-height: 1.54;
					font-weight: 400;
					margin: 0;
				}
				.form-control,
				.form-select {
					font-size: 16px;
					line-height: 24px;
					color: var(--nuxeo-text-default, #3a3a54);
					padding: 0;
					min-height: 26px;
					border-bottom: 1px solid var(--nuxeo-text-default, #3a3a54);
					box-shadow: none;
				}
				textarea {
					resize: none;
				}
				.form-control:focus,
				.form-select:focus {
					outline: none;
					border-bottom: 2px solid var(--nuxeo-primary-color, #06f);
					box-shadow: none;
				}
			}
			[role='alert'] {
				color: var(--nuxeo-text-default, var(--bs-body-color, #3a3a54));
				border-inline-start: 3px solid var(--bs-danger);
				padding-inline-start: 0.5rem;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandardContentEditorComponent implements OnInit, OnChanges, OnDestroy {
	private static nextId = 0;
	readonly fieldIdPrefix = `nx-standard-editor-${StandardContentEditorComponent.nextId++}`;
	get titleInvalid(): boolean {
		const title = this.editorForm?.get('dc:title');
		return !!title?.touched && title.invalid;
	}
	@Input() layoutContext?: DocumentLayoutContext;
	@Input() add = true;
	@Input() parentDocument: any;
	@Input() documentType = '';
	@Input() documents: any[] = [];
	readonly save$ = new Subject<any>();
	editorForm?: UntypedFormGroup;
	@ViewChild(BaseEditorComponent) private base?: BaseEditorComponent;
	canDeactivate(): boolean | Promise<boolean> {
		return this.base?.canLeave() ?? true;
	}
	supplementalContext?: DocumentLayoutContext;
	private readonly fieldExtensions = inject(DocumentFieldExtensionRegistry);
	get hasSupplementalFields(): boolean {
		return (
			!!this.supplementalContext &&
			this.fieldExtensions.candidates(this.supplementalContext).length > 0
		);
	}
	private readonly fb = inject(UntypedFormBuilder);
	private readonly modal = inject(BsModalRef);

	ngOnInit(): void {
		if (this.add) {
			this.documents = [
				{ parentRef: this.parentDocument?.uid, type: this.documentType, properties: {}, ng: {} },
			];
		}
		const properties = this.documents[0]?.properties ?? {};
		const common = Object.fromEntries(
			['dc:nature', 'dc:subjects', 'dc:coverage', 'dc:expired'].map((property) => [
				property,
				property === 'dc:expired' && properties[property]
					? new Date(properties[property])
					: (properties[property] ?? null),
			]),
		);
		this.editorForm = this.fb.group({
			'dc:title': [properties['dc:title'] ?? '', Validators.required],
			'dc:description': [properties['dc:description'] ?? ''],
			...(this.documentType === 'PictureBook'
				? {}
				: { natureSubjectsCoverageExpiration: [common] }),
			...(this.documentType === 'Note'
				? { 'note:mime_type': [properties['note:mime_type'] ?? 'text/html'] }
				: this.add && ['Audio', 'Video', 'File'].includes(this.documentType)
					? { 'file:content': [null] }
					: {}),
		});
		if (this.layoutContext?.noEdit) this.editorForm.disable();
		this.updateSupplementalContext();
	}
	ngOnChanges(changes: SimpleChanges): void {
		if (
			this.editorForm &&
			['layoutContext', 'documents', 'documentType', 'parentDocument', 'add'].some(
				(key) => changes[key],
			)
		)
			this.updateSupplementalContext();
	}
	private updateSupplementalContext(): void {
		this.supplementalContext = documentLayoutContext({
			documentType: this.documentType,
			mode: this.layoutContext?.mode || (this.add ? 'create' : 'edit'),
			document: this.documents[0],
			parentDocument: this.parentDocument,
			noEdit: this.layoutContext?.noEdit,
		});
	}
	selectFile(event: Event): void {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const control = this.editorForm?.get('file:content');
		control?.setValue(file);
		control?.markAsDirty();
		input.value = '';
	}
	clearFile(): void {
		this.editorForm?.get('file:content')?.setValue(null);
		this.editorForm?.get('file:content')?.markAsDirty();
	}
	close(): void {
		this.modal.hide();
	}
	saved(documents: any): void {
		this.save$.next(documents);
		this.modal.hide();
	}
	ngOnDestroy(): void {
		this.save$.complete();
	}
}
