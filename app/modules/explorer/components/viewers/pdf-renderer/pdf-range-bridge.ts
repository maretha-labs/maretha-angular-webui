import { inject, Injectable } from '@angular/core';
import { PDFScriptLoaderService, pdfDefaultOptions } from 'ngx-extended-pdf-viewer';

export interface PdfRangeTransport {
	requestDataRange(begin: number, end: number): void;
	onDataRange(begin: number, bytes: Uint8Array): void;
	onDataProgress(loaded: number, total?: number): void;
	abort(): void;
}

type RangeConstructor = new (
	length: number,
	initialData: Uint8Array,
	progressiveDone: boolean,
) => PdfRangeTransport;

const rangeOptions = { disableAutoFetch: true, disableStream: true, disableRange: false };
let optionLeases = 0;
let previousOptions: typeof rangeOptions | undefined;

function leaseRangeOptions(): () => void {
	if (optionLeases++ === 0) {
		previousOptions = {
			disableAutoFetch: pdfDefaultOptions.disableAutoFetch,
			disableStream: pdfDefaultOptions.disableStream,
			disableRange: pdfDefaultOptions.disableRange,
		};
		Object.assign(pdfDefaultOptions, rangeOptions);
	}
	return () => {
		if (--optionLeases === 0) {
			Object.assign(pdfDefaultOptions, previousOptions);
			previousOptions = undefined;
		}
	};
}

@Injectable({ providedIn: 'root' })
export class PdfRangeBridge {
	private readonly loader = inject(PDFScriptLoaderService);
	private loading?: Promise<boolean>;

	async create(
		length: number,
		initialData: Uint8Array,
		requestRange: (begin: number, end: number) => void,
		onAbort: () => void,
	): Promise<PdfRangeTransport> {
		if (!Number.isSafeInteger(length) || length <= 0 || initialData.length > length)
			throw new Error('Invalid PDF range length.');
		const Constructor = await this.loadConstructor();
		// ngx forwards only src.range; its fetch flags come from these shared defaults.
		// Keep the lease through replacement: aborting an old PDF must not reset a new PDF's options.
		const releaseOptions = leaseRangeOptions();
		let transport: PdfRangeTransport;
		try {
			// The prefix is complete; all remaining bytes arrive through explicit range requests.
			transport = new Constructor(length, initialData, true);
		} catch (error) {
			releaseOptions();
			throw error;
		}
		let aborted = false;
		const deliver = transport.onDataRange.bind(transport);
		const abort = transport.abort.bind(transport);
		transport.requestDataRange = (begin, end) => {
			// PDF.js registers its range reader after this call returns, including for cache hits.
			queueMicrotask(() => {
				if (!aborted) requestRange(begin, end);
			});
		};
		transport.onDataRange = (begin, bytes) => {
			if (!aborted) deliver(begin, bytes);
		};
		transport.abort = () => {
			if (aborted) return;
			aborted = true;
			try {
				abort();
			} finally {
				releaseOptions();
				onAbort();
			}
		};
		return transport;
	}

	private async loadConstructor(): Promise<RangeConstructor> {
		// The public loader has no in-flight deduplication and no script-error rejection.
		this.loading ??= this.loader
			.ensurePdfJsHasBeenLoaded(true, false, false)
			.finally(() => (this.loading = undefined));
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const loaded = await Promise.race([
				this.loading,
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(new Error('PDF viewer scripts did not load.')), 15_000);
				}),
			]);
			const Constructor = (
				globalThis as typeof globalThis & {
					pdfjsLib?: { PDFDataRangeTransport?: RangeConstructor };
				}
			).pdfjsLib?.PDFDataRangeTransport;
			// getDocument uses instanceof: a separate pdfjs-dist import would fail this contract.
			if (!loaded || typeof Constructor !== 'function')
				throw new Error('PDF viewer range transport is unavailable.');
			return Constructor;
		} finally {
			clearTimeout(timer);
		}
	}
}
