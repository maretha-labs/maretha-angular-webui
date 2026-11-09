import { LocalizedUiError } from '@maretha/webui-sdk';
import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from 'environments/environment';
import { Observable, Subject, Subscription, defer, map, of, takeUntil, timeout } from 'rxjs';
import { DocumentBlobTarget } from './document-blob-target';

export interface BlobDeliveryGrant {
	readonly id: string;
	readonly url: string;
	readonly expiresAt: number;
}

export interface BulkZipRequest {
	readonly repository: string;
	readonly documentIds: readonly string[];
	readonly filename: string;
}

/** One bounded basename is used for both the server request and the native download hint. */
export function bulkZipFilename(value: string): string {
	const base = Array.from(value)
		.filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
		.join('')
		.replace(/[\\/:*?"<>|]+/g, '-')
		.trim()
		.replace(/\.zip$/i, '')
		.replace(/^[.\s-]+|[.\s]+$/g, '')
		.slice(0, 176)
		.replace(/[\ud800-\udbff]$/, '')
		.replace(/[.\s]+$/g, '');
	return `${base || 'selection'}.zip`;
}

export interface BulkZipJob {
	readonly id: string;
	readonly state:
		| 'queued'
		| 'preparing'
		| 'ready'
		| 'consumed'
		| 'failed'
		| 'cancelled'
		| 'expired';
	readonly completed: number;
	readonly total: number;
	readonly bytesProcessed: number;
	readonly totalBytes: number;
	readonly expiresAt: number;
	readonly error: string | null;
}

@Injectable({ providedIn: 'root' })
export class BlobDeliveryService {
	private readonly http = inject(HttpClient);
	private readonly dom = inject(DOCUMENT);
	private readonly ended = new Subject<void>();
	readonly sessionEnded$ = this.ended.asObservable();
	private mintQueue: Promise<void> = Promise.resolve();
	private sessionClosed = false;

	createGrant(
		target: DocumentBlobTarget,
		disposition: 'inline' | 'attachment',
	): Observable<BlobDeliveryGrant> {
		return this.serializedPost('grants', { version: 1, target, disposition }, (value, base) =>
			this.checkedGrant(value, base),
		);
	}

	createBulkJob(request: BulkZipRequest, signal?: AbortSignal): Observable<BulkZipJob> {
		return this.serializedPost(
			'bulk-jobs',
			{ version: 1, ...request, filename: bulkZipFilename(request.filename) },
			(value) => this.checkedJob(value),
			signal,
		);
	}

	getBulkJob(id: string): Observable<BulkZipJob> {
		return defer(() =>
			this.http.get<unknown>(this.bulkPath(id), { withCredentials: true }).pipe(
				timeout(30_000),
				map((value) => this.checkedJob(value, id)),
			),
		).pipe(takeUntil(this.sessionEnded$));
	}

	cancelBulkJob(id: string): Observable<void> {
		return defer(() =>
			this.http.delete<void>(this.bulkPath(id), { withCredentials: true }).pipe(timeout(15_000)),
		);
	}

	regenerateBulkJob(id: string, signal?: AbortSignal): Observable<BulkZipJob> {
		return defer(() => {
			this.bulkPath(id);
			return this.serializedPost(
				`bulk-jobs/${id}/regenerate`,
				{ version: 1 },
				(value) => this.checkedJob(value),
				signal,
			);
		});
	}

	createBulkGrant(id: string): Observable<BlobDeliveryGrant> {
		return defer(() => {
			this.bulkPath(id);
			return this.serializedPost(`bulk-jobs/${id}/grant`, { version: 1 }, (value, base) =>
				this.checkedGrant(value, base),
			);
		});
	}

	private bulkPath(id: string): string {
		if (this.sessionClosed)
			throw new LocalizedUiError(
				'app.errors.the-streaming-session-has-ended-sign-in--b8ce91',
				'The streaming session has ended. Sign in again.',
			);
		if (!/^[a-zA-Z0-9_-]+$/.test(id))
			throw new LocalizedUiError(
				'app.errors.invalid-archive-preparation-identifier--05b584',
				'Invalid archive preparation identifier.',
			);
		return `${this.base().href}/bulk-jobs/${id}`;
	}

	private checkedJob(value: unknown, expectedId?: string): BulkZipJob {
		const job = value as BulkZipJob | null;
		if (
			!job ||
			typeof job.id !== 'string' ||
			!/^[a-zA-Z0-9_-]+$/.test(job.id) ||
			(expectedId && job.id !== expectedId) ||
			!['queued', 'preparing', 'ready', 'consumed', 'failed', 'cancelled', 'expired'].includes(
				job.state,
			) ||
			![job.completed, job.total, job.bytesProcessed, job.totalBytes, job.expiresAt].every(
				(item) => Number.isSafeInteger(item) && item >= 0,
			) ||
			(job.error !== null && typeof job.error !== 'string')
		)
			throw new LocalizedUiError(
				'app.errors.the-server-returned-an-invalid-archive-p-ed80c0',
				'The server returned an invalid archive preparation status.',
			);
		return {
			id: job.id,
			state: job.state,
			completed: job.completed,
			total: job.total,
			bytesProcessed: job.bytesProcessed,
			totalBytes: job.totalBytes,
			expiresAt: job.expiresAt,
			error: job.error,
		};
	}

	private serializedPost<T>(
		path: string,
		body: unknown,
		decode: (value: unknown, base: URL) => T,
		cancelBeforeSend?: AbortSignal,
	): Observable<T> {
		return new Observable<T>((observer) => {
			if (this.sessionClosed) {
				observer.error(
					new LocalizedUiError(
						'app.errors.the-streaming-session-has-ended-sign-in--b8ce91',
						'The streaming session has ended. Sign in again.',
					),
				);
				return;
			}
			let sent = false;
			const abortQueued = () => {
				if (!sent) observer.error(new DOMException('Archive preparation cancelled.', 'AbortError'));
			};
			if (cancelBeforeSend?.aborted) {
				abortQueued();
				return;
			}
			cancelBeforeSend?.addEventListener('abort', abortQueued, { once: true });
			let cancelled = false;
			let request: Subscription | undefined;
			let finish: (() => void) | undefined;
			const run = () =>
				new Promise<void>((resolve) => {
					finish = resolve;
					if (cancelled) return resolve();
					let base: URL;
					try {
						base = this.base();
					} catch (error) {
						observer.error(error);
						resolve();
						return;
					}
					sent = true;
					request = this.http
						.post<unknown>(`${base.href}/${path}`, body, { withCredentials: true })
						.pipe(
							timeout(15_000),
							map((value) => decode(value, base)),
						)
						.subscribe({
							next: (grant) => observer.next(grant),
							error: (error) => {
								observer.error(error);
								resolve();
							},
							complete: () => {
								observer.complete();
								resolve();
							},
						});
				});
			this.mintQueue = this.mintQueue
				.then(async () => {
					if (cancelled) return;
					// The cookie is HttpOnly: serialize minting so concurrent callers reuse its first session.
					const locks = this.dom.defaultView?.navigator.locks;
					if (locks) await locks.request(`maretha-delivery:${environment.applicationId}`, run);
					else await run();
				})
				.catch((error) => {
					observer.error(error);
				});
			return () => {
				cancelBeforeSend?.removeEventListener('abort', abortQueued);
				cancelled = true;
				request?.unsubscribe();
				finish?.();
			};
		}).pipe(takeUntil(this.sessionEnded$));
	}

	renewGrant(grant: BlobDeliveryGrant): Observable<BlobDeliveryGrant> {
		return defer(() => {
			if (this.sessionClosed)
				throw new LocalizedUiError(
					'app.errors.the-streaming-session-has-ended-sign-in--b8ce91',
					'The streaming session has ended. Sign in again.',
				);
			const base = this.base();
			this.checkedGrant(grant, base, false);
			return this.http
				.post<unknown>(
					`${base.href}/grants/${grant.id}/renew`,
					{ version: 1 },
					{ withCredentials: true },
				)
				.pipe(
					timeout(Math.max(1, Math.min(15_000, grant.expiresAt - Date.now()))),
					map((value) => {
						const renewed = this.checkedGrant(value, base);
						if (renewed.id !== grant.id || renewed.url !== grant.url)
							throw new LocalizedUiError(
								'app.errors.the-streaming-grant-changed-identity--a45585',
								'The streaming grant changed identity.',
							);
						return renewed;
					}),
				);
		}).pipe(takeUntil(this.sessionEnded$));
	}

	revokeGrant(grant: BlobDeliveryGrant): Observable<void> {
		return defer(() => {
			const base = this.base();
			this.checkedGrant(grant, base, false);
			return this.http
				.delete<void>(`${base.href}/grants/${grant.id}`, { withCredentials: true })
				.pipe(timeout(5_000));
		});
	}

	revokeSession(): Observable<void> {
		return defer(() => {
			this.sessionClosed = true;
			this.ended.next();
			let base: URL;
			try {
				base = this.base();
			} catch {
				return of(undefined);
			}
			return this.http
				.delete<void>(`${base.href}/session`, { withCredentials: true })
				.pipe(timeout(5_000));
		});
	}

	private base(): URL {
		const page = new URL(this.dom.location?.href ?? this.dom.baseURI);
		const nuxeo = new URL(environment.nuxeoUrl, this.dom.baseURI);
		const id = environment.applicationId;
		if (
			page.protocol !== 'https:' ||
			nuxeo.protocol !== 'https:' ||
			page.origin !== nuxeo.origin ||
			nuxeo.username ||
			nuxeo.password ||
			nuxeo.search ||
			nuxeo.hash ||
			!id ||
			!/^[a-zA-Z0-9_-]+$/.test(id)
		)
			throw new LocalizedUiError(
				'app.errors.streaming-requires-this-application-and--eb55ea',
				'Streaming requires this application and Nuxeo on the same HTTPS origin.',
			);
		return new URL(`${nuxeo.href.replace(/\/+$/, '')}/maretha-ui-${id}-delivery/v1`);
	}

	private checkedGrant(value: unknown, base: URL, requireFuture = true): BlobDeliveryGrant {
		const grant = value as Partial<BlobDeliveryGrant> | null;
		if (
			!grant ||
			typeof grant.id !== 'string' ||
			!/^[a-zA-Z0-9_-]+$/.test(grant.id) ||
			typeof grant.url !== 'string' ||
			typeof grant.expiresAt !== 'number' ||
			!Number.isSafeInteger(grant.expiresAt) ||
			(requireFuture && grant.expiresAt <= Date.now())
		)
			throw new LocalizedUiError(
				'app.errors.the-server-returned-an-invalid-streaming-e61825',
				'The server returned an invalid streaming grant.',
			);
		const url = new URL(grant.url, base);
		if (url.href !== `${base.href}/content/${grant.id}`)
			throw new LocalizedUiError(
				'app.errors.the-server-returned-an-invalid-streaming-4129b2',
				'The server returned an invalid streaming URL.',
			);
		return { id: grant.id, url: url.href, expiresAt: grant.expiresAt };
	}
}
