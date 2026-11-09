import { updateToastText } from 'app/helpers/update-toast-text';
import { WebUiMessages } from '@maretha/webui-sdk';
import { LocalizedUiError } from '@maretha/webui-sdk';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { environment } from 'environments/environment';
import { ActiveToast, ToastrService } from 'ngx-toastr';
import {
	forkJoin,
	catchError,
	of,
	tap,
	Observable,
	switchMap,
	map,
	from,
	mergeMap,
	ignoreElements,
	endWith,
	finalize,
	defaultIfEmpty,
	timeout,
	throwError,
	defer,
	EMPTY,
} from 'rxjs';
import { DocumentsManagerService } from './documents-manager.service';
import { BlobDeliveryService } from 'app/helpers/blob-delivery.service';
import { resolveDocumentBlobTarget } from 'app/helpers/document-blob-target';

export interface UploadedBatch {
	batchId: string;
	uploadedFiles: Record<string, number>;
	entries?: readonly { file: File; fileIdx: number }[];
}

export interface UploadFilesOptions {
	/** False when the calling editor owns persistent status/error announcements. */
	notifications?: boolean;
}

export class FileUploadError extends LocalizedUiError {
	cleanupFailed = false;
	constructor(
		message: string,
		readonly originalError: unknown,
		key = '',
	) {
		super(key, message);
		this.name = 'FileUploadError';
	}
}

type UploadProgressFn = (progress: {
	file: File;
	fileIdx: number;
	chunkIndex?: number;
	chunkCount?: number;
}) => void;

@Injectable({
	providedIn: 'root',
})
export class DocumentAttachmentsService {
	private readonly messages = inject(WebUiMessages);
	private readonly uploadToasts = signal<readonly ActiveToast<unknown>[]>([]);
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;
	private readonly delivery = inject(BlobDeliveryService);

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly httpClient: HttpClient,
		private readonly toastrService: ToastrService,
		private readonly documentsManagerService: DocumentsManagerService,
	) {
		effect(() => {
			for (const toast of this.uploadToasts())
				updateToastText(
					toast,
					this.messages.format('app.services.attachments.uploading', {}, 'Uploading files…'),
					this.messages.format('app.services.attachments.upload-title', {}, 'File upload'),
				);
		});
	}

	// --------------------------------------------------------------------------------------------------
	exportAsXml = (documents: any[]) => this.exportAs(documents, 'Xml');

	// --------------------------------------------------------------------------------------------------
	exportAsPdf = (documents: any[]) => this.exportAs(documents, 'Pdf');

	// --------------------------------------------------------------------------------------------------
	exportAsZip = (documents: any[]) => this.exportAs(documents, 'Zip');

	downloadDocumentBlob(documentModel: unknown, blob: unknown): Observable<void> {
		return defer(() =>
			this.delivery.createGrant(resolveDocumentBlobTarget(documentModel, blob), 'attachment'),
		).pipe(
			switchMap((grant) =>
				defer(() => {
					const link = document.createElement('a');
					link.href = grant.url;
					link.download =
						blob && typeof blob === 'object' && 'name' in blob && typeof blob.name === 'string'
							? blob.name
							: 'download';
					link.rel = 'noopener';
					document.body.appendChild(link);
					try {
						link.click();
					} finally {
						link.remove();
					}
					// Native downloads have no completion event. Keep the grant until server expiry.
					this.toastrService.info(
						this.messages.format(
							'app.services.attachments.download-starting',
							{},
							'Your download is starting.',
						),
						this.messages.format('app.services.attachments.download-title', {}, 'File download'),
						{ enableHtml: false },
					);
					return of(undefined);
				}).pipe(
					catchError((error: unknown) =>
						this.delivery.revokeGrant(grant).pipe(
							catchError(() => of(undefined)),
							switchMap(() => throwError(() => error)),
						),
					),
				),
			),
			catchError(() => {
				this.toastrService.error(
					this.messages.format(
						'app.services.attachments.download-start-failed',
						{},
						'The download could not be started. Check your connection and permissions, then retry.',
					),
					this.messages.format('app.services.attachments.download-error', {}, 'Download error'),
					{ enableHtml: false },
				);
				return EMPTY;
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	private exportAs(documents: any[], as: 'Xml' | 'Pdf' | 'Zip') {
		const observables = documents.reduce((result: any, document: any) => {
			if (document?.ng && document.ng[`exportUrlFor${as}`])
				result[document.uid] = this.httpClient.get(document.ng[`exportUrlFor${as}`], {
					responseType: 'blob',
				});

			return result;
		}, {});

		return forkJoin(observables).pipe(
			catchError((_error) => {
				this.toastrService.error(
					this.messages.format(
						'app.services.attachments.export-failed',
						{},
						'There was an error exporting the specified document.',
					),
					this.messages.format('app.services.attachments.export-error', {}, 'Export error'),
					{ enableHtml: false },
				);

				return of(null);
			}),
			tap((results: any) => {
				if (!results) return;

				const a = document.createElement('a');

				for (const key in results) {
					if (Object.prototype.hasOwnProperty.call(results, key)) {
						a.href = URL.createObjectURL(results[key]);
						a.download = documents.find((x) => x.uid === key)?.title || key;
						// Start the download
						a.click();
					}
				}

				this.toastrService.info(
					this.messages.format(
						'app.services.attachments.exported',
						{ format: as.toUpperCase() },
						'The document was exported as a {format} file.',
					),
					this.messages.format('app.services.attachments.exported-title', {}, 'Document exported'),
					{ enableHtml: false },
				);
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	downloadAttachment(url: string, fileName: string) {
		this.toastrService.info(
			this.messages.format(
				'app.services.attachments.downloading',
				{ name: fileName },
				'Downloading file \u201c{name}\u201d\u2026',
			),
			this.messages.format('app.services.attachments.download-title', {}, 'File download'),
			{ enableHtml: false },
		);

		return this.httpClient.get(url, { responseType: 'blob' }).pipe(
			catchError((_error) => {
				this.toastrService.error(
					this.messages.format(
						'app.services.attachments.download-failed',
						{},
						'There was an error downloading the specified document.',
					),
					this.messages.format('app.services.attachments.download-error', {}, 'Download error'),
					{ enableHtml: false },
				);

				return of(null);
			}),
			tap((result) => {
				if (!result) return;

				const a = document.createElement('a');
				const objectUrl = URL.createObjectURL(result);
				a.href = objectUrl;
				a.download = fileName;
				try {
					a.click();
				} finally {
					// Give the browser time to consume the download before releasing its backing blob.
					setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
				}
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	clearAttachments(documentUid: string, mainAttachment: boolean) {
		const payload = {
			context: {},
			params: {
				save: true,
				xpath: mainAttachment ? 'content' : 'files',
			},
			input: documentUid,
		};

		return this.httpClient.post(
			`${environment.nuxeoUrl}/site/automation/Blob.RemoveFromDocument`,
			payload,
		);
	}

	// --------------------------------------------------------------------------------------------------
	uploadFiles(
		files: File[],
		callbackFn?: UploadProgressFn,
		fileChunkSize = 5 * 1024 * 1024,
		options: UploadFilesOptions = {},
	) {
		return this.uploadFilesInBatches(
			files,
			callbackFn,
			fileChunkSize,
			options.notifications !== false,
		);
	}

	// --------------------------------------------------------------------------------------------------
	private uploadFilesInBatches(
		files: File[],
		callbackFn?: UploadProgressFn,
		fileChunkSize = 5 * 1024 * 1024,
		notifications = true,
	): Observable<UploadedBatch> {
		const selected = [...files];
		return defer(() => {
			if (!Number.isSafeInteger(fileChunkSize) || fileChunkSize < 1)
				return throwError(
					() =>
						new LocalizedUiError(
							'app.services.attachments.invalid-chunk-size',
							'Upload chunk size must be a positive integer.',
						),
				);
			if (!selected.length) return of({ batchId: '', uploadedFiles: {}, entries: [] });
			const toast = notifications
				? this.toastrService.info(
						this.messages.format('app.services.attachments.uploading', {}, 'Uploading files\u2026'),
						this.messages.format('app.services.attachments.upload-title', {}, 'File upload'),
						{ enableHtml: false, disableTimeOut: true, tapToDismiss: false },
					)
				: undefined;
			if (toast) this.uploadToasts.update((toasts) => [...toasts, toast]);
			let batchId: string | undefined;
			let uploaded = false;
			let cleanupStarted = false;
			const cleanup = () => {
				cleanupStarted = true;
				return this.removeBatchJob(batchId).pipe(timeout(10_000), defaultIfEmpty(null));
			};
			const jobs = function* () {
				for (let fileIdx = 0; fileIdx < selected.length; fileIdx++) {
					const file = selected[fileIdx];
					const chunkCount = Math.max(1, Math.ceil(file.size / fileChunkSize));
					for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++)
						yield { file, fileIdx, chunkIndex, chunkCount };
				}
			};
			return this.httpClient
				.post(`${this.apiUrl}/upload`, null, {
					headers: new HttpHeaders({ properties: '*', 'X-NXRepository': 'default' }),
				})
				.pipe(
					switchMap((batch: any) => {
						if (typeof batch?.batchId !== 'string' || !batch.batchId)
							throw new Error('The server did not return an upload batch.');
						batchId = batch.batchId;
						const entries = selected.map((file, fileIdx) => ({ file, fileIdx }));
						const receipt: UploadedBatch = {
							batchId: batchId!,
							entries,
							uploadedFiles: Object.fromEntries(
								entries.map(({ file, fileIdx }) => [file.name, fileIdx]),
							),
						};
						return from(jobs()).pipe(
							mergeMap(
								({ file, fileIdx, chunkIndex, chunkCount }) =>
									defer(() =>
										chunkCount === 1
											? this.uploadFileToBatchJob(batchId!, file, fileIdx, callbackFn)
											: this.uploadFileChunkToBatchJob(
													batchId!,
													file,
													fileIdx,
													file.slice(chunkIndex * fileChunkSize, (chunkIndex + 1) * fileChunkSize),
													chunkIndex,
													chunkCount,
													callbackFn,
												),
									),
								4,
							),
							ignoreElements(),
							endWith(receipt),
						);
					}),
					catchError((original: unknown) => {
						const failure = new FileUploadError(
							batchId
								? 'The files could not be uploaded. Check your connection and permissions, then retry.'
								: 'The upload could not be started. Check your connection and permissions, then retry.',
							original,
							batchId
								? 'app.services.attachments.upload-failed'
								: 'app.services.attachments.upload-start-failed',
						);
						if (notifications)
							this.toastrService.error(
								this.messages.format(failure.key, failure.values, failure.fallback),
								this.messages.format(
									'app.services.attachments.upload-error',
									{},
									'File upload error',
								),
								{ enableHtml: false },
							);
						if (!batchId) return throwError(() => failure);
						return cleanup().pipe(
							catchError(() => {
								failure.cleanupFailed = true;
								return of(null);
							}),
							mergeMap(() => throwError(() => failure)),
						);
					}),
					tap(() => {
						uploaded = true;
						if (notifications)
							this.toastrService.success(
								this.messages.format(
									'app.services.attachments.uploaded',
									{},
									'The files have been successfully uploaded.',
								),
								this.messages.format('app.services.attachments.upload-title', {}, 'File upload'),
								{ enableHtml: false },
							);
					}),
					finalize(() => {
						if (toast) {
							this.uploadToasts.update((toasts) => toasts.filter((active) => active !== toast));
							this.toastrService.remove(toast.toastId);
						}
						if (batchId && !uploaded && !cleanupStarted)
							cleanup()
								.pipe(catchError(() => EMPTY))
								.subscribe();
					}),
				);
		});
	}

	// --------------------------------------------------------------------------------------------------
	private uploadFileToBatchJob(
		batchId: string,
		file: File,
		fileIdx: number,
		callbackFn?: UploadProgressFn,
	) {
		return defer(() => {
			if (callbackFn) callbackFn({ file, fileIdx });

			return this.getFileType(file);
		}).pipe(
			switchMap((fileType) => {
				const headers = new HttpHeaders({
					'X-File-Name': encodeURIComponent(file.name),
					'X-File-Size': `${file.size}`,
					'Content-Type': 'application/octet-stream',
					'X-File-Type': fileType,
					'X-NXRepository': 'default',
				});

				return this.httpClient
					.post(
						`${environment.nuxeoUrl}/api/v1/upload/${encodeURIComponent(batchId)}/${fileIdx}`,
						file,
						{ headers },
					)
					.pipe(map(() => ({ file, fileIdx })));
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	private getFileType(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			if (file.type) resolve(file.type);
			else {
				const fr = new FileReader();
				fr.onload = () =>
					fr.result ? resolve(fr.result.toString()?.split(';base64')[0].substring(5)) : reject();
				fr.onerror = () => reject();
				fr.readAsDataURL(file.slice(0, 8));
			}
		});
	}

	// --------------------------------------------------------------------------------------------------
	private uploadFileChunkToBatchJob(
		batchId: string,
		file: File,
		fileIdx: number,
		chunk: Blob,
		chunkIndex: number,
		chunkCount: number,
		callbackFn?: UploadProgressFn,
	) {
		if (callbackFn) callbackFn({ file, fileIdx, chunkIndex, chunkCount });

		const headers = new HttpHeaders({
			'X-File-Name': encodeURIComponent(file.name),
			'X-File-Size': `${file.size}`,
			'Content-Type': 'application/octet-stream',
			'X-File-Type': file.type || 'application/octet-stream',
			'X-NXRepository': 'default',
			'X-Upload-Type': 'chunked',
			'X-Upload-Chunk-Index': `${chunkIndex}`,
			'X-Upload-Chunk-Count': `${chunkCount}`,
		});

		return this.httpClient
			.post(`${this.apiUrl}/upload/${encodeURIComponent(batchId)}/${fileIdx}`, chunk, { headers })
			.pipe(map(() => ({ file, fileIdx, chunkIndex, chunkCount })));
	}

	// --------------------------------------------------------------------------------------------------
	/** An empty batch that stock's import fills as files are chosen. */
	createUploadBatch(): Observable<string> {
		return this.httpClient
			.post<any>(`${this.apiUrl}/upload`, null, {
				headers: new HttpHeaders({ properties: '*', 'X-NXRepository': 'default' }),
			})
			.pipe(
				map((batch) => {
					if (typeof batch?.batchId !== 'string' || !batch.batchId)
						throw new Error('The server did not return an upload batch.');
					return batch.batchId as string;
				}),
			);
	}

	/** Uploads one file into an existing batch at its index, in chunks when it is large. */
	uploadToBatch(
		batchId: string,
		file: File,
		fileIdx: number,
		fileChunkSize = 5 * 1024 * 1024,
	): Observable<void> {
		const chunkCount = Math.max(1, Math.ceil(file.size / fileChunkSize));
		const chunks: Observable<unknown> =
			chunkCount === 1
				? this.uploadFileToBatchJob(batchId, file, fileIdx)
				: from(Array.from({ length: chunkCount }, (_, index) => index)).pipe(
						mergeMap(
							(index) =>
								this.uploadFileChunkToBatchJob(
									batchId,
									file,
									fileIdx,
									file.slice(index * fileChunkSize, (index + 1) * fileChunkSize),
									index,
									chunkCount,
								),
							4,
						),
					);
		return chunks.pipe(ignoreElements(), endWith(undefined));
	}

	/** Removes one file from a batch, as stock does when a chosen file is removed. */
	removeBatchFile(batchId: string, fileIdx: number): Observable<unknown> {
		return this.httpClient.delete(
			`${this.apiUrl}/upload/${encodeURIComponent(batchId)}/${fileIdx}`,
		);
	}

	// --------------------------------------------------------------------------------------------------
	removeBatchJob(batchId: string | undefined): Observable<unknown> {
		if (!batchId) return of(null);

		return this.httpClient.delete(`${this.apiUrl}/upload/${encodeURIComponent(batchId)}`);
	}

	// --------------------------------------------------------------------------------------------------
	attachUploadedFilesToDocument(
		documentUid: string,
		xpath = 'file:content',
		uploadBatchId: string /*, uploadedFilesId: number[]*/,
	): Observable<any> {
		// const request: any = {
		// 	'entity-type': 'document',
		// 	uid: documentUid,
		// 	properties: {}
		// };

		// if (xpath === 'file:content')
		// 	request.properties[xpath] = {
		// 		'upload-batch': uploadBatchId,
		// 		'upload-fileId': '0'
		// 	};
		// else
		// 	request.properties[xpath] = uploadedFilesId.map(fileIdx => ({
		// 		'upload-batch': uploadBatchId,
		// 		'upload-fileId': `${fileIdx}`
		// 	}));

		const headers = new HttpHeaders({
			properties: '*',
		});

		// return this.httpClient.put(`${this.apiUrl}/id/${documentUid}`, request, { headers });

		return this.httpClient.post(
			`${environment.nuxeoUrl}/site/automation/batch/execute`,
			{
				context: {},
				params: {
					document: documentUid,
					operationId: 'Blob.AttachOnDocument',
					batchId: uploadBatchId,
					xpath,
					save: true,
				},
			},
			{ headers },
		);
	}

	// --------------------------------------------------------------------------------------------------
	private uploadSingleFile(
		file: File,
		documentUid: string,
		xpath = 'file:content',
		fileChunkSize = 5 * 1024 * 1024,
	) {
		const toastr = this.toastrService.info(
			this.messages.format(
				'app.services.attachments.uploading-file',
				{ name: file.name },
				'Uploading \u201c{name}\u201d\u2026',
			),
			this.messages.format('app.services.attachments.upload-title', {}, 'File upload'),
			{ enableHtml: false, disableTimeOut: true, tapToDismiss: false },
		);

		const request = new Blob(
			[
				JSON.stringify({
					context: {},
					params: {
						document: documentUid,
						save: 'true',
						xpath,
					},
				}),
			],
			{ type: 'application/json+nxrequest' },
		);

		const formData = new FormData();

		formData.append('request', request);
		formData.append(file.name, file);

		const headers = new HttpHeaders({
			Accept: '*/*',
			'Nuxeo-Transaction-Timeout': '3',
			'X-NXproperties': '*',
			'X-NXRepository': 'default',
			'X-NXVoidOperation': 'false',
		});

		return this.httpClient
			.post(`${environment.nuxeoUrl}/site/automation/Blob.AttachOnDocument`, formData, {
				headers,
				reportProgress: false, // progress event are expensive (change detection for each event)
				responseType: 'text',
			})
			.pipe(
				catchError((_err) => {
					this.toastrService.remove(toastr.toastId);

					const message =
						file.size > fileChunkSize
							? this.messages.format(
									'app.services.attachments.file-too-large',
									{ name: file.name },
									'The file \u201c{name}\u201d could not be uploaded in time because it is too large.',
								)
							: this.messages.format(
									'app.services.attachments.file-failed',
									{ name: file.name },
									'The file \u201c{name}\u201d could not be uploaded.',
								);

					this.toastrService.error(
						message,
						this.messages.format('app.services.attachments.upload-title', {}, 'File upload'),
						{ enableHtml: false },
					);

					return of();
				}),
				switchMap((_response) => {
					this.toastrService.remove(toastr.toastId);

					this.toastrService.success(
						this.messages.format(
							'app.services.attachments.file-uploaded',
							{ name: file.name },
							'The file \u201c{name}\u201d has been successfully uploaded.',
						),
						this.messages.format('app.services.attachments.upload-title', {}, 'File upload'),
						{ enableHtml: false },
					);

					// Reload this document
					return this.documentsManagerService.reloadDocument(documentUid);
				}),
			);
	}
}
