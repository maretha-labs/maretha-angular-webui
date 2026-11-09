import { LocalizedUiError } from '@maretha/webui-sdk';
import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, fromEvent, Observable, takeUntil, timer } from 'rxjs';
import {
	BlobDeliveryGrant,
	BlobDeliveryService,
	BulkZipJob,
} from 'app/helpers/blob-delivery.service';
import { environment } from 'environments/environment';
import { ResultsQueryScope } from '@maretha/webui-sdk';
export interface CsvExportOptions {
	readonly schemas: readonly string[];
	readonly sortBy?: string;
	readonly sortOrder?: 'asc' | 'desc';
}
/**
 * Stock nuxeo-csv-export-button `_resolveSchemas`: the schemas of the document types on the current
 * page, from the `config/types` document types the application already loaded.
 */
export function pageTypeSchemas(
	items: readonly Readonly<Record<string, unknown>>[] | undefined,
	doctypes: Readonly<Record<string, { readonly schemas?: unknown }>> | undefined,
): string[] {
	const schemas = new Set<string>();
	for (const item of items ?? []) {
		const type = item?.['type'];
		if (
			typeof type !== 'string' ||
			!doctypes ||
			!Object.prototype.hasOwnProperty.call(doctypes, type)
		)
			continue;
		const typeSchemas = doctypes[type]?.schemas;
		if (Array.isArray(typeSchemas))
			for (const schema of typeSchemas) if (typeof schema === 'string') schemas.add(schema);
	}
	return [...schemas];
}
@Injectable({ providedIn: 'root' })
export class SelectionDownloadService {
	private readonly http = inject(HttpClient);
	private readonly dom = inject(DOCUMENT);
	private readonly delivery = inject(BlobDeliveryService);
	readonly sessionEnded$ = this.delivery.sessionEnded$;

	async download(
		ids: readonly string[],
		repository: string,
		signal: AbortSignal,
		progress: (job: BulkZipJob) => void = () => undefined,
		filename = 'selection.zip',
	): Promise<BlobDeliveryGrant> {
		if (
			!ids.length ||
			ids.length > 1000 ||
			ids.some((id) => !id || /[,\r\n]/.test(id)) ||
			!repository
		)
			throw new LocalizedUiError(
				'app.errors.select-up-to-1-000-valid-documents-from--fe7e4f',
				'Select up to 1,000 valid documents from one repository.',
			);
		if (signal.aborted) throw new DOMException('Archive preparation cancelled.', 'AbortError');
		// Keep the short creation response observable so cancellation can delete an accepted job.
		const job = await firstValueFrom(
			this.delivery.createBulkJob({ repository, documentIds: [...ids], filename }, signal),
		);
		return this.waitForArchive(job, signal, progress);
	}

	async retryDownload(
		job: BulkZipJob,
		signal: AbortSignal,
		progress: (job: BulkZipJob) => void,
	): Promise<BlobDeliveryGrant> {
		return this.waitForArchive(job, signal, progress, true);
	}

	async regenerateDownload(
		id: string,
		signal: AbortSignal,
		progress: (job: BulkZipJob) => void,
	): Promise<BlobDeliveryGrant> {
		if (signal.aborted) throw new DOMException('Archive preparation cancelled.', 'AbortError');
		const job = await firstValueFrom(this.delivery.regenerateBulkJob(id, signal));
		return this.waitForArchive(job, signal, progress);
	}

	cancelDownload(id: string): Observable<void> {
		return this.delivery.cancelBulkJob(id);
	}

	private async waitForArchive(
		initial: BulkZipJob,
		signal: AbortSignal,
		progress: (job: BulkZipJob) => void,
		refresh = false,
	): Promise<BlobDeliveryGrant> {
		let job = initial;
		const cancelled = fromEvent(signal, 'abort');
		const read = <T>(request: Observable<T>) =>
			firstValueFrom(request.pipe(takeUntil(cancelled), takeUntil(this.sessionEnded$)));
		const check = () => {
			if (signal.aborted) throw new DOMException('Archive preparation cancelled.', 'AbortError');
		};
		try {
			progress(job);
			check();
			if (refresh) job = await read(this.delivery.getBulkJob(job.id));
			while (true) {
				check();
				progress(job);
				if (job.state === 'ready') {
					const grant = await read(this.delivery.createBulkGrant(job.id));
					check();
					return grant;
				}
				if (!['queued', 'preparing'].includes(job.state))
					throw job.error
						? new Error(job.error)
						: new LocalizedUiError(
								'download.preparationStopped',
								'{state, select, consumed {This archive download was already started.} cancelled {Archive preparation was cancelled.} expired {Archive preparation expired.} other {Archive preparation failed.}} Regenerate the ZIP to try again.',
								{ state: job.state },
							);
				await read(timer(1000));
				check();
				job = await read(this.delivery.getBulkJob(job.id));
			}
		} catch (error) {
			if (signal.aborted) {
				try {
					await firstValueFrom(this.delivery.cancelBulkJob(job.id));
				} catch {
					throw new LocalizedUiError(
						'app.errors.cancellation-could-not-be-confirmed-retr-e54119',
						'Cancellation could not be confirmed. Retry cancellation.',
					);
				}
				throw new DOMException('Archive preparation cancelled.', 'AbortError');
			}
			throw error;
		}
	}
	/** `typeSchemas` join the export's schemas, as stock adds the page's document type schemas. */
	async exportCsv(
		scope: ResultsQueryScope,
		signal: AbortSignal,
		options?: CsvExportOptions,
		typeSchemas: readonly string[] = [],
	): Promise<Blob> {
		if (!scope.providerName || !scope.repository)
			throw new LocalizedUiError(
				'app.errors.a-complete-query-scope-is-required--5d108b',
				'A complete query scope is required.',
			);
		const namedParameters = { ...scope.namedParameters };
		const quickFilters = options ? namedParameters['quickFilters'] : undefined;
		if (options) delete namedParameters['quickFilters'];
		return this.execute(
			'Bulk.RunAction',
			{
				params: {
					action: 'csvExport',
					providerName: scope.providerName,
					repositoryName: scope.repository,
					queryParams: [...scope.queryParams],
					namedParameters,
					...(quickFilters ? { quickFilters } : {}),
					...(options?.sortBy ? { sortBy: options.sortBy, sortOrder: options.sortOrder } : {}),
					parameters: JSON.stringify({
						schemas: [...new Set([...(options?.schemas ?? ['dublincore']), ...typeSchemas])],
					}),
				},
			},
			scope.repository,
			signal,
			true,
		);
	}
	private async execute(
		operation: string,
		body: unknown,
		repository: string,
		signal: AbortSignal,
		csv = false,
	): Promise<Blob> {
		const cancel = fromEvent(signal, 'abort');
		const check = () => {
			if (signal.aborted)
				throw new LocalizedUiError('app.errors.download-cancelled--79310f', 'Download cancelled.');
		};
		check();
		const endpoint = environment.nuxeoUrl + '/api/v1/automation/' + operation + '/@async';
		let response: HttpResponse<Blob> = await firstValueFrom(
			this.http
				.post(endpoint, body, {
					headers: { 'X-NXRepository': repository },
					observe: 'response',
					responseType: 'blob',
				})
				.pipe(takeUntil(cancel)),
		);
		let statusUrl = '';
		let csvResult = false;
		if (response.status === 202) {
			const location = response.headers.get('Location');
			if (!location)
				throw new LocalizedUiError(
					'app.errors.the-server-did-not-expose-the-download-s-0012f8',
					'The server did not expose the download status URL. Allow the Location response header in the Nuxeo CORS configuration.',
				);
			statusUrl = this.localUrl(location);
		}
		while (true) {
			check();
			if (csvResult) {
				const result = await firstValueFrom(
					this.http
						.get(statusUrl, { observe: 'response', responseType: 'arraybuffer' })
						.pipe(takeUntil(cancel)),
				);
				check();
				if (!result.body)
					throw new LocalizedUiError(
						'app.errors.no-csv-export-was-returned--e3fe3f',
						'No CSV export was returned.',
					);
				// Use transport headers instead of XHR's inferred Blob type (which can be XML
				// when Nuxeo's CSV transient-store response omits Content-Type).
				response = result.clone({
					body: new Blob([result.body], { type: result.headers.get('Content-Type') || 'text/csv' }),
				});
			} else if (statusUrl)
				response = await firstValueFrom(
					this.http
						.get(statusUrl, { observe: 'response', responseType: 'blob' })
						.pipe(takeUntil(cancel)),
				);
			check();
			const blob = response.body;
			if (!blob)
				throw new LocalizedUiError(
					'app.errors.no-downloadable-content-was-returned--65d092',
					'No downloadable content was returned.',
				);
			const mime = blob.type.split(';')[0];
			if (!['application/json', 'application/json+nxentity'].includes(mime)) {
				if (
					mime !== 'application/zip' &&
					mime !== 'application/octet-stream' &&
					mime !== 'application/x-zip-compressed' &&
					!(csv && ['text/csv', 'text/plain', 'application/gzip'].includes(mime))
				)
					throw csv
						? new LocalizedUiError(
								'download.unsupportedFormat',
								'The server returned an unsupported export format ({format, select, unknown {unknown} other {{format}}}).',
								{ format: mime || 'unknown' },
							)
						: new LocalizedUiError('download.noZip', 'The server did not return a ZIP download.');
				return blob;
			}
			const state: unknown = JSON.parse(await blob.text());
			check();
			if (csv && state && typeof state === 'object') {
				const result = state as {
					url?: string;
					'entity-type'?: string;
					value?: unknown;
					state?: string;
					error?: boolean;
					errorCount?: number;
				};
				if (typeof result.url === 'string') {
					if (csvResult)
						throw new LocalizedUiError(
							'app.errors.unexpected-nested-csv-result-url--5767cf',
							'Unexpected nested CSV result URL.',
						);
					statusUrl = this.localUrl(result.url);
					csvResult = true;
					continue;
				}
				if (result['entity-type'] === 'bulkStatus') {
					const status = (result.value ?? result) as typeof result;
					if (status.error || status.errorCount || status.state === 'ABORTED')
						throw new LocalizedUiError(
							'app.errors.the-csv-export-stopped-or-completed-with-8f40bd',
							'The CSV export stopped or completed with errors.',
						);
					if (!statusUrl)
						throw new LocalizedUiError(
							'app.errors.missing-export-status-url--3dd5ac',
							'Missing export status URL.',
						);
					await firstValueFrom(timer(1000).pipe(takeUntil(cancel)));
					continue;
				}
			}
			if (
				state === 'RUNNING' ||
				(state && typeof state === 'object' && (state as { state?: string }).state === 'RUNNING')
			) {
				if (!statusUrl)
					throw new LocalizedUiError(
						'app.errors.missing-download-status-url--6d57df',
						'Missing download status URL.',
					);
				await firstValueFrom(timer(1000).pipe(takeUntil(cancel)));
				continue;
			}
			throw new LocalizedUiError(
				'app.errors.the-server-could-not-prepare-the-selecte-6673f4',
				'The server could not prepare the selected files.',
			);
		}
	}
	private localUrl(value: string): string {
		const base = new URL(environment.nuxeoUrl, this.dom.baseURI);
		const url = new URL(value, base.href + '/');
		if (
			!['http:', 'https:'].includes(url.protocol) ||
			url.origin !== base.origin ||
			url.username ||
			url.password ||
			!url.pathname.startsWith(base.pathname.replace(/\/+$/, '') + '/')
		)
			throw new LocalizedUiError(
				'app.errors.invalid-download-status-url--e4b0a6',
				'Invalid download status URL.',
			);
		return url.href;
	}
}
