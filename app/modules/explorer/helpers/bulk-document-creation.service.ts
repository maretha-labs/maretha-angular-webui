import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { ViewNavigation } from '@maretha/webui-sdk';
import { Observable, firstValueFrom } from 'rxjs';
import { CreationParentService, allowsCreateType } from './creation-parent.service';
import { DocumentAttachmentsService } from './document-attachments.service';
import { DocumentCreationError } from './document-creation-error';
import { DocumentsManagerService } from './documents-manager.service';
import { StagedUploadBatch } from './staged-import-uploads';
import { WebUiMessages } from '@maretha/webui-sdk';
import { LocalizedUiError } from '@maretha/webui-sdk';

export type ImportState =
	| 'pending'
	| 'checking'
	| 'reading'
	| 'uploading'
	| 'creating'
	| 'created'
	| 'failed'
	| 'unknown';
export type ImportContent =
	| { readonly kind: 'upload'; readonly property: string }
	| { readonly kind: 'utf8-text'; readonly property: string };
export type ImportProperties =
	| Readonly<Record<string, unknown>>
	| ((file: File) => Readonly<Record<string, unknown>>);
export interface ImportItem {
	readonly key: number;
	readonly file: File;
	readonly title: string;
	readonly type: string;
	readonly properties: Readonly<Record<string, unknown>>;
	readonly content: ImportContent;
	state: ImportState;
	message?: string;
	messageDescriptor?: LocalizedUiError;
	documentId?: string;
	document?: any;
	upload?: { batchId: string; fileId: string };
}
/** One instance per dialog: outcomes survive retry, but never leak into another import. */
@Injectable()
export class BulkDocumentCreation {
	private readonly messages = inject(WebUiMessages);
	/** A Note body is text, so keep accidental binary imports bounded in the browser. */
	static readonly MAX_TEXT_IMPORT_BYTES = 5 * 1024 * 1024;
	private readonly parents = inject(CreationParentService);
	private readonly manager = inject(DocumentsManagerService);
	private readonly attachments = inject(DocumentAttachmentsService);
	private readonly destroy = inject(DestroyRef);
	private readonly navigation = inject(ViewNavigation);
	private readonly router = inject(Router);
	readonly items = signal<readonly ImportItem[]>([]);
	readonly working = signal(false);
	readonly stopping = signal(false);
	readonly started = computed(() => this.items().length > 0);
	readonly createdCount = computed(() => this.items().filter((i) => !!i.documentId).length);
	readonly unknownCount = computed(() => this.items().filter((i) => i.state === 'unknown').length);
	readonly complete = computed(
		() => this.started() && this.items().every((i) => i.state === 'created'),
	);
	readonly retryable = computed(() =>
		this.items().some((i) => i.state === 'pending' || i.state === 'failed'),
	);
	private parent?: { uid: string; path: string };
	private mode: 'documents' | 'file-manager' = 'documents';
	/**
	 * A batch holding several files: one FileManager.Import batch, or the batch the dialog uploaded
	 * when the files were chosen. Like stock, it is kept for a retry and removed once nothing needs it.
	 */
	private sharedBatch?: string;
	constructor() {
		this.destroy.onDestroy(() => void this.dropSharedBatch());
	}
	/** Stock's default import: the server's importers choose each type, so none is inferred here. */
	configureImport(parent: { uid: string; path: string }, files: readonly File[]): void {
		if (this.started() || this.working()) return;
		this.configure(parent, files, () => '');
		this.mode = 'file-manager';
	}
	/** Uses files the dialog already uploaded, as stock does; this creation now owns their batch. */
	adoptUploads(uploads: StagedUploadBatch | undefined): void {
		if (!uploads || this.working() || this.sharedBatch) return;
		this.sharedBatch = uploads.batchId;
		for (const item of this.items()) {
			const index = uploads.indexOf(item.file);
			if (index !== undefined) item.upload = { batchId: uploads.batchId, fileId: String(index) };
		}
	}
	configure(
		parent: { uid: string; path: string },
		files: readonly File[],
		typeFor: (file: File) => string,
		properties: ImportProperties = {},
		contentFor: (file: File) => ImportContent = () => ({
			kind: 'upload',
			property: 'file:content',
		}),
		titleFor: (file: File) => string = (file) => file.name,
	): void {
		if (this.started() || this.working()) return;
		if (!parent?.uid || !parent.path || files.some((file) => !(file instanceof File)))
			throw new LocalizedUiError(
				'app.services.import.invalid-input',
				'Choose a destination and valid files.',
			);
		this.parent = { uid: parent.uid, path: parent.path };
		this.items.set(
			files.map((file, key) => ({
				key,
				file,
				title: titleFor(file),
				type: typeFor(file),
				properties: structuredClone(
					typeof properties === 'function' ? properties(file) : properties,
				),
				content: contentFor(file),
				state: 'pending',
			})),
		);
	}
	get destinationId(): string | undefined {
		return this.parent?.uid;
	}
	messageFor(item: ImportItem): string | undefined {
		const descriptor = item.messageDescriptor;
		return descriptor
			? this.messages.format(descriptor.key, descriptor.values, descriptor.fallback)
			: item.message;
	}
	get documents(): any[] {
		return this.items()
			.filter((i) => i.state === 'created')
			.map((i) => i.document);
	}
	stop(): void {
		if (this.working()) this.stopping.set(true);
	}
	canLeave(hasDraft = false): boolean {
		return (
			!this.working() &&
			(!(hasDraft || (this.started() && !this.complete())) ||
				window.confirm(
					this.messages.format(
						'app.services.import.leave',
						{},
						'Leave this import? Created documents will remain; unfinished files and recovery details will be discarded.',
					),
				))
		);
	}
	watchDeparture(hasDraft: () => boolean, close: () => void): void {
		this.destroy.onDestroy(this.navigation.register(async () => this.canLeave(hasDraft())));
		this.router.events.pipe(takeUntilDestroyed(this.destroy)).subscribe((event) => {
			if (event instanceof NavigationEnd && !this.working()) close();
		});
		const unload = (event: BeforeUnloadEvent) => {
			if (this.working() || hasDraft() || (this.started() && !this.complete())) {
				event.preventDefault();
				event.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', unload);
		this.destroy.onDestroy(() => window.removeEventListener('beforeunload', unload));
	}
	private read<T>(source: Observable<T>): Promise<T> {
		return firstValueFrom(source.pipe(takeUntilDestroyed(this.destroy)));
	}
	private update(item: ImportItem, patch: Partial<ImportItem>): void {
		Object.assign(item, patch);
		this.items.update((items) => [...items]);
	}
	async run(): Promise<void> {
		if (this.working() || !this.parent || !this.retryable() || this.destroy.destroyed) return;
		if (this.mode === 'file-manager') return this.runImport();
		this.working.set(true);
		this.stopping.set(false);
		// One fresh destination read per Create action, made only when a write needs it; a failed
		// read fails every remaining file with the same error.
		let destination: Promise<any> | undefined;
		try {
			for (const item of this.items()) {
				if (this.stopping() || this.destroy.destroyed) break;
				if (item.state !== 'pending' && item.state !== 'failed') continue;
				this.update(item, { state: 'checking', message: undefined, messageDescriptor: undefined });
				let writing = false;
				try {
					if (item.documentId) {
						// The create was acknowledged. Only reload it; never upload/create again.
						const document = await this.read(this.manager.getDocumentInfo(item.documentId));
						this.update(item, { state: 'created', document });
						continue;
					}
					const fresh = await (destination ??= this.read(this.parents.readId(this.parent.uid)));
					if (fresh.uid !== this.parent.uid || !allowsCreateType(fresh, item.type))
						throw new LocalizedUiError(
							'app.services.import.not-allowed',
							'Creation is no longer allowed for this destination and document type.',
						);
					let content: unknown;
					const textContent = item.content.kind === 'utf8-text';
					if (textContent) content = await this.readTextContent(item);
					else {
						if (!item.upload) {
							this.update(item, { state: 'uploading' });
							// Separate batches keep equal filenames from overwriting each other's upload index.
							const upload = await this.read(this.attachments.uploadFiles([item.file]));
							const fileId = upload.uploadedFiles[item.file.name];
							if (!upload.batchId || fileId == null)
								throw new LocalizedUiError(
									'app.services.import.missing-upload-reference',
									'The upload did not return a file reference.',
								);
							this.update(item, { upload: { batchId: upload.batchId, fileId: String(fileId) } });
						}
						content = {
							'upload-batch': item.upload!.batchId,
							'upload-fileId': item.upload!.fileId,
						};
					}
					// Reading a Note is an await boundary. Do not turn an interrupted read into an
					// uncertain write: no create request has been made yet, so this remains retryable.
					if (textContent && (this.stopping() || this.destroy.destroyed)) {
						this.update(item, { state: 'pending', message: undefined });
						break;
					}
					this.update(item, { state: 'creating' });
					writing = true;
					const document = await this.read(
						this.manager.createDocument(
							this.parent.path,
							item.type,
							{
								...item.properties,
								'dc:title': item.title,
								[item.content.property]: content,
							},
							this.parent.uid,
							{
								parent: fresh,
								keepBatch: !!this.sharedBatch && item.upload?.batchId === this.sharedBatch,
							},
						),
					);
					this.update(item, { state: 'created', documentId: document.uid, document });
				} catch (error) {
					const failure = this.destroy.destroyed && writing ? new DocumentCreationError() : error;
					if (failure instanceof DocumentCreationError) {
						this.update(item, {
							documentId: failure.documentId,
							state: failure.documentId ? 'failed' : 'unknown',
							message: failure.message,
							messageDescriptor: failure,
						});
					} else {
						this.fail(item, failure);
						// A rejected create can consume/expire its uploaded blob. Retry its upload safely.
						if (!item.documentId) item.upload = undefined;
					}
				}
			}
			const waiting = this.items().some(
				(item) =>
					(item.state === 'pending' || item.state === 'failed') &&
					item.upload?.batchId === this.sharedBatch,
			);
			if (this.sharedBatch && !waiting) await this.dropSharedBatch();
		} finally {
			this.working.set(false);
		}
	}
	/** One FileManager.Import for every unfinished file, as stock sends it; its outcome is shared. */
	private async runImport(): Promise<void> {
		this.working.set(true);
		this.stopping.set(false);
		const items = this.items().filter((i) => i.state === 'pending' || i.state === 'failed');
		let importing = false;
		try {
			for (const item of items)
				this.update(item, { state: 'uploading', message: undefined, messageDescriptor: undefined });
			if (!this.sharedBatch) {
				const upload = await this.read(this.attachments.uploadFiles(items.map((i) => i.file)));
				if (!upload.batchId)
					throw new LocalizedUiError(
						'app.services.import.missing-upload-reference',
						'The upload did not return a file reference.',
					);
				this.sharedBatch = upload.batchId;
			}
			if (this.stopping() || this.destroy.destroyed) {
				for (const item of items) this.update(item, { state: 'pending' });
				return;
			}
			for (const item of items) this.update(item, { state: 'creating' });
			importing = true;
			const documents = await this.read(
				this.manager.importFiles(this.parent!.path, this.sharedBatch),
			);
			items.forEach((item, index) => {
				const document = documents[index];
				if (typeof document?.uid === 'string')
					this.update(item, {
						state: 'created',
						type: document.type,
						documentId: document.uid,
						document,
					});
				else {
					const uncertain = new DocumentCreationError();
					this.update(item, {
						state: 'unknown',
						message: uncertain.message,
						messageDescriptor: uncertain,
					});
				}
			});
			await this.dropSharedBatch();
		} catch (error) {
			const failure = this.destroy.destroyed && importing ? new DocumentCreationError() : error;
			if (failure instanceof DocumentCreationError) {
				for (const item of items)
					this.update(item, {
						state: 'unknown',
						message: failure.message,
						messageDescriptor: failure,
					});
				await this.dropSharedBatch();
			} else {
				for (const item of items) this.fail(item, failure);
				// The server no longer has the batch: a retry uploads the files again.
				if ((failure as { status?: number } | null)?.status === 404) this.sharedBatch = undefined;
			}
		} finally {
			this.working.set(false);
		}
	}
	private async dropSharedBatch(): Promise<void> {
		const batchId = this.sharedBatch;
		this.sharedBatch = undefined;
		if (batchId)
			await firstValueFrom(this.attachments.removeBatchJob(batchId)).catch(() => undefined);
	}
	private fail(item: ImportItem, failure: unknown): void {
		const descriptor = item.documentId
			? new LocalizedUiError(
					'app.services.import.created-details-failed',
					'Created; details could not be loaded. Retry to reload this document.',
				)
			: failure instanceof LocalizedUiError
				? failure
				: failure instanceof Error
					? undefined
					: new LocalizedUiError(
							'app.services.import.failed',
							'This file could not be created. Retry when the problem is resolved.',
						);
		this.update(item, {
			state: 'failed',
			message: descriptor?.message ?? (failure as Error).message,
			messageDescriptor: descriptor,
		});
	}
	private async readTextContent(item: ImportItem): Promise<string> {
		if (item.file.size > BulkDocumentCreation.MAX_TEXT_IMPORT_BYTES)
			throw new LocalizedUiError(
				'app.services.import.too-large',
				'“{name}” is too large to import as a Note. Maximum size is {limit, number} MB.',
				{ name: item.file.name, limit: BulkDocumentCreation.MAX_TEXT_IMPORT_BYTES / 1024 / 1024 },
			);
		this.update(item, { state: 'reading' });
		try {
			return new TextDecoder('utf-8', { fatal: true }).decode(await item.file.arrayBuffer());
		} catch {
			throw new LocalizedUiError(
				'app.services.import.invalid-text',
				'“{name}” could not be read as UTF-8 text.',
				{ name: item.file.name },
			);
		}
	}
}
