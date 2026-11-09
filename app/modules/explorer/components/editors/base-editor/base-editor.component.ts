import { DOCUMENT_CREATION_WIZARD } from '../../../helpers/document-creation-wizard';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { ViewNavigation } from '@maretha/webui-sdk';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { DocumentCreationError } from '../../../helpers/document-creation-error';
import { DocumentLinkPipe } from 'app/helpers/document-route';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import {
	ChangeDetectorRef,
	Component,
	EventEmitter,
	Input,
	OnInit,
	Output,
	ChangeDetectionStrategy,
	OnDestroy,
	OnChanges,
	inject,
	DestroyRef,
	SimpleChanges,
} from '@angular/core';
import { FormArray, UntypedFormGroup } from '@angular/forms';
import {
	DocumentAttachmentsService,
	FileUploadError,
} from 'app/modules/explorer/helpers/document-attachments.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import {
	EMPTY,
	Observable,
	Subject,
	Subscription,
	catchError,
	defer,
	forkJoin,
	from,
	map,
	mergeMap,
	of,
	switchMap,
	toArray,
	finalize,
	takeUntil,
	tap,
} from 'rxjs';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

@Component({
	selector: 'nx-base-editor',
	imports: [RouterLink, DocumentLinkPipe, WebUiMessagePipe],
	templateUrl: './base-editor.component.html',
	styleUrls: ['./base-editor.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BaseEditorComponent implements OnInit, OnDestroy, OnChanges {
	private readonly uiLabels = injectUiMessages(RuntimeUiMessages);
	private readonly uiBaseEditorComponentConfirmations = injectUiMessages(RuntimeUiMessages);

	private destroy$ = new Subject<void>();
	private formEvents?: Subscription;
	readonly wizard = inject(DOCUMENT_CREATION_WIZARD, { optional: true });
	back(): void {
		void Promise.resolve(this.canLeave()).then((allowed) => {
			if (allowed) this.wizard?.back();
		});
	}
	private readonly confirmDialog = inject(ConfirmDialogService);
	private readonly destroyRef = inject(DestroyRef);
	private readonly navigation = inject(ViewNavigation);
	private readonly router = inject(Router);
	private readonly announcer = inject(LiveAnnouncer);
	private saveSubscription?: Subscription;
	private saveGeneration = 0;
	private destroyed = false;
	private successAnnounced = false;
	ngOnChanges(changes?: SimpleChanges): void {
		if (
			changes &&
			['editorForm', 'documents', 'parentDocument', 'documentType', 'add'].some(
				(name) => changes[name] && !changes[name].firstChange,
			)
		) {
			this.saveGeneration++;
			this.saveSubscription?.unsubscribe();
			this.working = false;
			this.status = undefined;
			this.saveError = '';
			this.saveErrorDetails = '';
			this.creationDocumentId = undefined;
			this.creationUncertain = false;
			this.successAnnounced = false;
		}
		this.formEvents?.unsubscribe();
		this.formEvents = this.editorForm?.events.subscribe(() => {
			if (!this.working && this.editorForm?.dirty) this.status = undefined;
			this.cdr.markForCheck();
		});
	}

	@Output() close = new EventEmitter();
	@Output() save = new EventEmitter();

	@Input() add = true;
	@Input() parentDocument: any;
	@Input() documentType?: string;
	@Input() documents: any[] = [];
	private saveButtonLabelInput: string | undefined;
	@Input() set saveButtonLabel(value: string | undefined) {
		this.saveButtonLabelInput = value;
	}
	get saveButtonLabel(): string {
		return (
			this.saveButtonLabelInput ??
			this.uiLabels.text('app.labels.save-changes-dd0ae7', 'Save changes')
		);
	}
	private cancelButtonLabelInput: string | undefined;
	@Input() set cancelButtonLabel(value: string | undefined) {
		this.cancelButtonLabelInput = value;
	}
	get cancelButtonLabel(): string {
		return (
			this.cancelButtonLabelInput ??
			this.uiLabels.text('app.labels.close-without-saving-bb5e6e', 'Close without saving')
		);
	}
	@Input() editorForm?: UntypedFormGroup;
	/** Opt in only when the enclosing editor does not already announce a success toast. */
	@Input() announceSuccess = false;
	get saveDisabled(): boolean {
		return !!(
			this.working ||
			this.creationUncertain ||
			this.editorForm?.pristine ||
			this.editorForm?.invalid
		);
	}
	get statusText(): string {
		if (!this.working) return this.status ?? '';
		return this.creationDocumentId
			? this.uiLabels.text(
					'app.modules.base-editor.finishing-the-created-document-19ea05',
					'Finishing the created document…',
				)
			: this.status ||
					this.uiLabels.text('app.runtime.base-editor.saving-document-d06e6b', 'Saving document…');
	}
	get statusPoliteness(): 'off' | 'polite' {
		return this.successAnnounced && !this.working ? 'off' : 'polite';
	}

	progress = 0;
	working = false;
	private readonly statusMessageState = localizedText(undefined, true);
	get status(): string | undefined {
		return this.statusMessageState();
	}
	set status(value: string | undefined | MessageText) {
		this.statusMessageState.set(value);
	}
	creationDocumentId?: string;
	creationUncertain = false;
	private readonly saveErrorState = localizedText('');
	saveErrorDetails = '';
	get saveError(): string {
		return this.saveErrorState();
	}
	set saveError(value: string | MessageText) {
		this.saveErrorState.set(value);
	}

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly documentAttachmentsService: DocumentAttachmentsService,
		private readonly cdr: ChangeDetectorRef,
	) {
		this.destroyRef.onDestroy(this.navigation.register(async () => this.canLeave()));
		this.router.events.pipe(takeUntil(this.destroy$)).subscribe((event) => {
			if (event instanceof NavigationEnd && !this.working) this.close.emit();
		});
		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (this.working || this.editorForm?.dirty) {
				event.preventDefault();
				event.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', beforeUnload);
		this.destroyRef.onDestroy(() => window.removeEventListener('beforeunload', beforeUnload));
	}
	/** Resolves synchronously unless the form is dirty, in which case the user is asked. */
	canLeave(): boolean | Promise<boolean> {
		if (this.working) return false;
		if (!this.editorForm?.dirty) return true;
		return this.confirmDialog
			.confirm({
				titleKey: 'dialog.unsavedChanges',
				title: 'Unsaved changes',
				messageKey: 'app.notices.discard-your-unsaved-changes-f117f1',
				message: 'Discard your unsaved changes?',
				confirmKey: 'action.discard',
				confirm: 'Discard',
				destructive: true,
			})
			.then((confirmed) => confirmed && !this.working);
	}

	// --------------------------------------------------------------------------------------------------
	async closeWithoutSaving(): Promise<void> {
		if (await this.canLeave()) this.close.emit();
	}

	// --------------------------------------------------------------------------------------------------
	saveChanges() {
		if (
			this.destroyed ||
			this.working ||
			this.creationUncertain ||
			!this.editorForm ||
			this.editorForm.invalid ||
			this.editorForm.pristine
		)
			return;
		this.working = true;
		const generation = ++this.saveGeneration;
		const current = () => !this.destroyed && generation === this.saveGeneration;
		let succeeded = false;
		this.successAnnounced = false;
		this.progress = 0;
		this.status = undefined;
		this.saveError = '';
		this.saveErrorDetails = '';

		const fileUploadChunkSize = 5 * 1024 * 1024; // 5MB (matches Nuxeo JS client default)

		// The total progress means uploading the files (if that's the case) + creating the document
		const mainAttachment =
			this.mainFile && this.mainFile.dirty && this.mainFile.value
				? 1 + Math.round(this.mainFile.value.size / fileUploadChunkSize)
				: 0;
		const additionalAttachments =
			this.additionalFiles && this.additionalFiles.dirty && this.additionalFiles.controls.length
				? this.additionalFiles.controls.length -
					1 +
					this.additionalFiles.controls.reduce(
						(t, control: any) => t + Math.round(control.value?.size / fileUploadChunkSize) + 1,
						0,
					)
				: 0;
		const totalProgress = 1 + mainAttachment + additionalAttachments;

		// First upload any new files
		const filesToUpload: File[] = [];

		if (this.mainFile && this.mainFile.dirty && this.mainFile.value)
			filesToUpload.push(this.mainFile.value);

		if (this.additionalFiles && this.additionalFiles.dirty)
			filesToUpload.push(...this.additionalFiles.controls.map((x) => x.value));
		if (filesToUpload.length && !this.creationDocumentId)
			this.status = messageText('app.services.attachments.uploading', 'Uploading files…');

		const emptyFileUploadResponse: any = {};

		let progress = 0;
		let uploading = filesToUpload.length > 0 && !this.creationDocumentId;

		this.saveSubscription = (
			this.creationDocumentId
				? this.documentsManagerService
						.getDocumentInfo(this.creationDocumentId)
						.pipe(map((document) => ({ resumedDocuments: [document] }) as any))
				: filesToUpload.length
					? this.documentAttachmentsService.uploadFiles(
							filesToUpload,
							(x: any) => {
								if (!current() || !this.working || !uploading) return;
								this.progress = (progress++ / totalProgress) * 100;
								this.status = messageText(
									'app.state.uploading-file-value-9d01a9',
									'Uploading file "{value0}"',
									{ value0: x.file.name },
								);
								this.cdr.markForCheck();
							},
							fileUploadChunkSize,
							{ notifications: false },
						)
					: of(emptyFileUploadResponse)
		)
			.pipe(
				// Create/update document(s) by specifying the uploaded files
				switchMap((x) => {
					uploading = false;
					this.status = undefined;
					if (x.resumedDocuments) return of({ documents: x.resumedDocuments, batchId: undefined });
					let mainAttachmentUploadIndex: any;

					const mainSelected = !!(this.mainFile?.dirty && this.mainFile.value);
					const fileAttachmentsUploadIndex: number[] = [];
					if (x.entries) {
						if (mainSelected) mainAttachmentUploadIndex = x.entries[0]?.fileIdx;
						if (this.additionalFiles?.dirty)
							fileAttachmentsUploadIndex.push(
								...x.entries
									.slice(mainSelected ? 1 : 0)
									.map((entry: { fileIdx: number }) => entry.fileIdx),
							);
					} else {
						if (mainSelected)
							mainAttachmentUploadIndex = x.uploadedFiles[this.mainFile!.value.name];
						if (this.additionalFiles?.dirty)
							for (const fileName in x.uploadedFiles)
								if (!mainSelected || this.mainFile!.value.name !== fileName)
									fileAttachmentsUploadIndex.push(x.uploadedFiles[fileName]);
					}

					const changes = this.getChanges(
						x.batchId,
						mainAttachmentUploadIndex,
						fileAttachmentsUploadIndex,
					);

					if (this.add)
						return defer(() => {
							this.progress = (progress++ / totalProgress) * 100;
							this.status = messageText(
								'app.state.creating-document-value-e8c827',
								'Creating document "{value0}"',
								{ value0: changes[0].properties.name },
							);
							this.cdr.markForCheck();

							return this.documentsManagerService
								.createDocument(
									this.parentDocument.path,
									this.documentType!,
									changes[0].properties,
									this.parentDocument.uid,
								)
								.pipe(
									toArray(),
									map((y) => ({
										documents: y,
										batchId: x.batchId,
									})),
								);
						});
					else {
						// TODO: Consider using a bulk operation when the number of documents is high

						if (changes.length)
							return from(changes).pipe(
								mergeMap(
									(change) =>
										this.documentsManagerService.updateDocument(
											change.documentUid,
											change.properties,
										),
									30,
								),
								toArray(),
								map((y) => ({
									documents: y,
									batchId: x.batchId,
								})),
							);
						else
							return of(this.documents).pipe(
								map((y) => ({
									documents: y,
									batchId: x.batchId,
								})),
							);
					}
				}),
				// Remember acknowledged creation before any independently failing tag operation.
				tap((x) => {
					if (this.add && x.documents.length === 1) this.creationDocumentId = x.documents[0].uid;
				}),
				// Add/remove tags
				switchMap((x) => {
					if (!this.editorForm?.get('tags')?.dirty) return of(x);
					const tagValue = this.editorForm.get('tags')?.value;
					if (!tagValue || !Object.prototype.hasOwnProperty.call(tagValue, 'nxtag:tags'))
						return of(x);
					const tags = (tagValue['nxtag:tags'] ?? []).map((tag: any) => tag.label ?? tag);

					const observables: Observable<any>[] = [];

					for (const document of x.documents) {
						// Remove the tags that have been deleted
						const removedTags: string[] =
							document.properties['nxtag:tags']
								?.filter((x: any) => tags.indexOf(x.label) < 0)
								.map((x: any) => x.label) || [];
						if (removedTags.length)
							observables.push(
								...removedTags.map((tag: string) =>
									this.documentsManagerService.removeTag(document.uid, tag),
								),
							);

						// Add new tags
						const addedTags: string[] = tags.filter(
							(tag: string) =>
								!document.properties['nxtag:tags']?.find((x: any) => x.label === tag),
						);
						if (addedTags.length)
							observables.push(this.documentsManagerService.addTag(document.uid, addedTags));
					}

					return observables.length ? forkJoin(observables).pipe(mergeMap(() => of(x))) : of(x);
				}),
				// concatMap(x => x.batchId ? this.documentAttachmentsService.removeBatchJob(x.batchId).pipe(map(() => x)) : of(x)),
				finalize(() => {
					if (!current()) return;
					this.working = false;
					if (!succeeded) this.status = undefined;
					this.cdr.markForCheck();
				}),
				takeUntil(this.destroy$),
				catchError((error) => {
					if (!current()) return EMPTY;
					this.status = undefined;
					if (error instanceof DocumentCreationError) {
						this.creationDocumentId = error.documentId;
						this.creationUncertain = !error.documentId;
					}
					const issue = this.creationUncertain
						? messageText(
								'editor.creationUnknown',
								'The server did not confirm whether creation finished. Inspect the destination before creating another document.',
							)
						: this.creationDocumentId
							? messageText(
									'editor.creationIncomplete',
									'Your document was created. Some remaining steps failed; retry finishing this document without creating another copy.',
								)
							: messageText(
									'editor.saveFailed',
									'The document could not be saved. Your changes are still available.',
								);
					this.saveError =
						error instanceof FileUploadError
							? messageText(error.key, error.fallback, error.values)
							: issue;

					if (
						!this.creationDocumentId &&
						!this.creationUncertain &&
						error.error &&
						error.error['entity-type'] === 'validation_report'
					)
						this.saveErrorDetails =
							error.error.violations
								?.map((x: any) => `${x.path.map((y: any) => y.field_name).join(',')}: ${x.message}`)
								.join('\n') || '';

					return EMPTY;
				}),
			)
			.subscribe((x) => {
				if (!current()) return;
				if (!x.documents.length) {
					this.saveError = messageText(
						'editor.saveFailed',
						'The document could not be saved. Your changes are still available.',
					);
					return;
				}
				succeeded = true;
				this.working = false;
				this.editorForm?.markAsPristine();
				this.status = messageText('app.notices.document-saved-e81dde', 'Document saved');
				if (this.announceSuccess) {
					this.successAnnounced = true;
					void this.announcer.announce(this.statusText, 'polite');
				}
				this.cdr.markForCheck();
				this.save.emit(x.documents);
			});
	}

	// --------------------------------------------------------------------------------------------------
	private get additionalFiles() {
		const additionalFiles = this.editorForm!.get('files:files');
		return additionalFiles ? (additionalFiles as FormArray) : undefined;
	}

	// --------------------------------------------------------------------------------------------------
	private get mainFile() {
		return this.editorForm!.get('file:content');
	}

	// --------------------------------------------------------------------------------------------------
	private getChanges(
		batchId?: string,
		mainAttachmentUploadIndex?: number,
		fileAttachmentsUploadIndex?: any[],
	) {
		const changes: any[] = [];
		// A new Note always carries its format; it is defaulted silently so an untouched form stays pristine.
		if (this.add) this.editorForm?.get('note:mime_type')?.markAsDirty();

		for (const document of this.documents) {
			const properties = this.getFormDirtyValues(this.editorForm);

			if (this.add) properties.name = properties['dc:title'] || document.title;
			if (this.mainFile && this.mainFile.dirty) {
				if (!this.mainFile.value)
					// Remove the main file
					properties['file:content'] = null;
				else if (batchId && mainAttachmentUploadIndex != undefined)
					// Add the main attachment
					properties['file:content'] = {
						'upload-batch': batchId,
						'upload-fileId': '0',
					};
			}

			if (this.additionalFiles && this.additionalFiles.dirty) {
				if (!this.additionalFiles.controls.length)
					properties['files:files'] = document.ng.attachments
						.filter((x: any) => !(x instanceof File))
						.map((file: any) => ({ file }));
				else if (batchId && fileAttachmentsUploadIndex?.length)
					properties['files:files'] = [
						...document.ng.attachments
							.filter((x: any) => !(x instanceof File))
							.map((file: any) => ({ file })),
						...fileAttachmentsUploadIndex.map((fileIdx) => ({
							file: {
								'upload-batch': batchId,
								'upload-fileId': `${fileIdx}`,
							},
						})),
					];
			}

			if (Object.keys(properties).length)
				changes.push({
					documentUid: document.uid,
					properties,
				});
		}

		return changes;
	}

	// --------------------------------------------------------------------------------------------------
	private getFormDirtyValues(formControl: any) {
		const result: any = {};

		for (const key of Object.keys(formControl.controls)) {
			// Skip certain form controls
			if (['file:content', 'files:files', 'nxtag:tags'].includes(key)) continue;

			const currentControl = formControl.controls[key];

			if (!currentControl.dirty) continue;

			if (key === 'natureSubjectsCoverageExpiration')
				for (const subKey of Object.keys(currentControl.value))
					result[subKey] = currentControl.value[subKey];
			else if (key !== 'tags')
				result[key] = currentControl.controls
					? this.getFormDirtyValues(currentControl)
					: (result[key] = currentControl.value);
		}

		return result;
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		if (!this.editorForm)
			throw 'nx-document-editor: you must specify the main form group (editorForm)';

		if (this.add && !this.parentDocument)
			throw 'nx-document-editor: you must specify the parent document';

		if (this.add && !this.documentType)
			throw 'nx-document-editor: you must specify the document type';
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.destroyed = true;
		this.saveGeneration++;
		this.saveSubscription?.unsubscribe();
		this.working = false;
		this.status = undefined;
		this.formEvents?.unsubscribe();
		this.destroy$.next();
		this.destroy$.complete();
	}
}
