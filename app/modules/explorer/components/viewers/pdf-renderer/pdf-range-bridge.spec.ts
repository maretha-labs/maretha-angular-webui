import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { PDFScriptLoaderService, pdfDefaultOptions } from 'ngx-extended-pdf-viewer';
import { PdfRangeBridge, PdfRangeTransport } from './pdf-range-bridge';

class RuntimeTransport implements PdfRangeTransport {
	readonly delivered: { begin: number; bytes: Uint8Array }[] = [];
	constructor(
		readonly length: number,
		readonly initialData: Uint8Array,
		readonly progressiveDone: boolean,
	) {}
	requestDataRange(_begin: number, _end: number): void {
		return;
	}
	onDataRange(begin: number, bytes: Uint8Array): void {
		this.delivered.push({ begin, bytes });
	}
	onDataProgress(_loaded: number, _total?: number): void {
		return;
	}
	abort(): void {
		return;
	}
}

describe('PdfRangeBridge', () => {
	const runtime = globalThis as typeof globalThis & { pdfjsLib?: unknown };
	let previousRuntime: unknown;
	let defaults: { disableAutoFetch: boolean; disableStream: boolean; disableRange: boolean };
	let loader: jasmine.SpyObj<PDFScriptLoaderService>;
	let bridge: PdfRangeBridge;
	let transports: PdfRangeTransport[];

	beforeEach(() => {
		previousRuntime = runtime.pdfjsLib;
		runtime.pdfjsLib = { PDFDataRangeTransport: RuntimeTransport };
		defaults = {
			disableAutoFetch: pdfDefaultOptions.disableAutoFetch,
			disableStream: pdfDefaultOptions.disableStream,
			disableRange: pdfDefaultOptions.disableRange,
		};
		loader = jasmine.createSpyObj('PDFScriptLoaderService', ['ensurePdfJsHasBeenLoaded']);
		loader.ensurePdfJsHasBeenLoaded.and.returnValue(Promise.resolve(true));
		TestBed.configureTestingModule({
			providers: [{ provide: PDFScriptLoaderService, useValue: loader }],
		});
		bridge = TestBed.inject(PdfRangeBridge);
		transports = [];
	});

	afterEach(() => {
		transports.forEach((transport) => transport.abort());
		runtime.pdfjsLib = previousRuntime;
		Object.assign(pdfDefaultOptions, defaults);
	});

	it('uses the loaded runtime constructor and defers requests until the reader can register', async () => {
		const request = jasmine.createSpy('request');
		const initial = new Uint8Array([1, 2]);
		const transport = await bridge.create(100, initial, request, () => undefined);
		transports.push(transport);
		expect(loader.ensurePdfJsHasBeenLoaded).toHaveBeenCalledOnceWith(true, false, false);
		expect(transport instanceof RuntimeTransport).toBeTrue();
		expect((transport as RuntimeTransport).initialData).toBe(initial);
		expect((transport as RuntimeTransport).progressiveDone).toBeTrue();
		transport.requestDataRange(2, 10);
		expect(request).not.toHaveBeenCalled();
		await Promise.resolve();
		expect(request).toHaveBeenCalledOnceWith(2, 10);
	});

	it('keeps range options until the last overlapping transport aborts and ignores late callbacks', async () => {
		Object.assign(pdfDefaultOptions, {
			disableAutoFetch: false,
			disableStream: false,
			disableRange: true,
		});
		const onAbort = jasmine.createSpy('abort');
		const request = jasmine.createSpy('request');
		const first = await bridge.create(100, new Uint8Array(), request, onAbort);
		const second = await bridge.create(100, new Uint8Array(), request, () => undefined);
		transports.push(first, second);
		first.requestDataRange(0, 10);
		first.abort();
		first.abort();
		first.onDataRange(0, new Uint8Array([1]));
		await Promise.resolve();
		expect(onAbort).toHaveBeenCalledTimes(1);
		expect(request).not.toHaveBeenCalled();
		expect((first as RuntimeTransport).delivered).toEqual([]);
		expect(pdfDefaultOptions.disableAutoFetch).toBeTrue();
		expect(pdfDefaultOptions.disableStream).toBeTrue();
		expect(pdfDefaultOptions.disableRange).toBeFalse();
		second.abort();
		expect(pdfDefaultOptions.disableAutoFetch).toBeFalse();
		expect(pdfDefaultOptions.disableStream).toBeFalse();
		expect(pdfDefaultOptions.disableRange).toBeTrue();
	});

	it('deduplicates concurrent script loading', async () => {
		let finish!: (value: boolean) => void;
		loader.ensurePdfJsHasBeenLoaded.and.returnValue(new Promise((resolve) => (finish = resolve)));
		const first = bridge.create(
			10,
			new Uint8Array(),
			() => undefined,
			() => undefined,
		);
		const second = bridge.create(
			10,
			new Uint8Array(),
			() => undefined,
			() => undefined,
		);
		expect(loader.ensurePdfJsHasBeenLoaded).toHaveBeenCalledTimes(1);
		finish(true);
		transports.push(...(await Promise.all([first, second])));
	});

	it('reports a missing constructor without changing viewer options', async () => {
		runtime.pdfjsLib = undefined;
		await expectAsync(
			bridge.create(
				10,
				new Uint8Array(),
				() => undefined,
				() => undefined,
			),
		).toBeRejectedWithError('PDF viewer range transport is unavailable.');
		expect(pdfDefaultOptions.disableAutoFetch).toBe(defaults.disableAutoFetch);
	});

	it('reports an asset-loading timeout instead of leaving the viewer waiting indefinitely', fakeAsync(() => {
		let finish!: (value: boolean) => void;
		loader.ensurePdfJsHasBeenLoaded.and.returnValue(new Promise((resolve) => (finish = resolve)));
		let message = '';
		bridge
			.create(
				10,
				new Uint8Array(),
				() => undefined,
				() => undefined,
			)
			.catch((error: Error) => (message = error.message));
		tick(15_000);
		expect(message).toBe('PDF viewer scripts did not load.');
		finish(true);
		flushMicrotasks();
	}));
});
