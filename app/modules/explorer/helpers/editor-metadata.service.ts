import { localizedText, messageText } from 'app/helpers/localized-message';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Subscription, defer, map, of, take, throwIfEmpty, timeout } from 'rxjs';
import { DocumentsManagerService } from './documents-manager.service';

export interface EditorSchema {
	name: string;
}

@Injectable()
export class EditorMetadata {
	private readonly documents = inject(DocumentsManagerService);
	private request?: Subscription;
	private closed = false;
	readonly loading = signal(false);
	readonly error = localizedText('');
	readonly ready = signal(false);

	constructor() {
		inject(DestroyRef).onDestroy(() => this.cancel());
	}

	load(
		type: string | undefined,
		suppliedSchemas: EditorSchema[] | undefined,
		onReady: (schemas: EditorSchema[]) => void,
	): void {
		if (this.closed || this.loading() || this.ready()) return;
		this.loading.set(true);
		this.error.set('');
		this.request = defer(() => {
			if (suppliedSchemas !== undefined) return of({ schemas: suppliedSchemas });
			if (!type) throw new Error('A document type is required.');
			return this.documents.getDocumentType(type);
		})
			.pipe(
				timeout(30_000),
				take(1),
				throwIfEmpty(),
				map((value: any): EditorSchema[] => {
					if (
						!Array.isArray(value?.schemas) ||
						!value.schemas.every((schema: any) => typeof schema?.name === 'string')
					)
						throw new Error('Invalid document type information.');
					return value.schemas;
				}),
			)
			.subscribe({
				next: (schemas) => {
					this.loading.set(false);
					this.ready.set(true);
					onReady(schemas);
				},
				error: () => {
					this.loading.set(false);
					this.error.set(
						messageText(
							'metadata.typeLoadFailed',
							'Document type information could not be loaded. Retry or close this dialog.',
						),
					);
				},
			});
	}

	/** Starts a new scoped metadata request when an editor host is reused for another type. */
	reset(): void {
		this.request?.unsubscribe();
		this.request = undefined;
		this.closed = false;
		this.loading.set(false);
		this.error.set('');
		this.ready.set(false);
	}

	cancel(): void {
		this.closed = true;
		this.request?.unsubscribe();
		this.loading.set(false);
	}
}
