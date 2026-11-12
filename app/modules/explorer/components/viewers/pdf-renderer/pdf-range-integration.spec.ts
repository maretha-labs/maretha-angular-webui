import { TestBed } from '@angular/core/testing';
import {
	PDFScriptLoaderService,
	PdfCspPolicyService,
	pdfDefaultOptions,
} from 'ngx-extended-pdf-viewer';
import { PdfRangeBridge, PdfRangeTransport } from './pdf-range-bridge';

interface PdfTestDocument {
	readonly numPages: number;
	getPage(page: number): Promise<{
		getTextContent(): Promise<{ items: { str?: string }[] }>;
	}>;
}

interface PdfTestRuntime {
	version: string;
	PDFDataRangeTransport: new (
		length: number,
		initialData: Uint8Array,
		progressiveDone: boolean,
	) => PdfRangeTransport;
	GlobalWorkerOptions: { workerSrc: string };
	getDocument(options: {
		range: PdfRangeTransport;
		disableAutoFetch: boolean;
		disableStream: boolean;
		rangeChunkSize: number;
		useSystemFonts: boolean;
		cspPolicyService: PdfCspPolicyService;
	}): { promise: Promise<PdfTestDocument>; destroy(): Promise<void> };
}

function multiChunkPdf(contentPadding = 0): Uint8Array {
	const content =
		'BT /F1 12 Tf 20 50 Td (Authenticated range fixture) Tj ET' +
		(contentPadding ? `\n%${' '.repeat(contentPadding)}\n` : '');
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
		`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
	];
	let pdf = '%PDF-1.7\n';
	const offsets = [0];
	objects.forEach((object, index) => {
		offsets.push(pdf.length);
		pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
	});
	// Put the cross-reference table beyond the initial prefix and multiple range chunks.
	pdf += `%${'padding'.repeat(30_000)}\n`;
	const xref = pdf.length;
	pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
	for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
	pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return new TextEncoder().encode(pdf);
}

describe('Installed PDF.js range integration', () => {
	for (const [folder, version] of [
		['assets', '6.5.1524'],
		['bleeding-edge', '6.5.1524'],
	]) {
		it(`extracts PDF.js ${version} through the real transport and aborts it when the loading task is destroyed`, async () => {
			TestBed.configureTestingModule({});
			const previousFolder = pdfDefaultOptions.assetsFolder;
			pdfDefaultOptions.assetsFolder = new URL(
				`/base/node_modules/ngx-extended-pdf-viewer/${folder}`,
				location.origin,
			).href;
			const bridge = TestBed.inject(PdfRangeBridge);
			const loader = TestBed.inject(PDFScriptLoaderService);
			const bytes = multiChunkPdf();
			const requested: { begin: number; end: number }[] = [];
			const aborted = jasmine.createSpy('transport aborted');
			let transport: PdfRangeTransport | undefined;
			let task: ReturnType<PdfTestRuntime['getDocument']> | undefined;
			let runtime: PdfTestRuntime | undefined;
			let previousWorker: string | undefined;
			try {
				// TestBed can recreate the loader after a prior test removed its module script.
				await loader.ensurePdfJsHasBeenLoaded(true, false, true);
				transport = await bridge.create(
					bytes.length,
					bytes.slice(0, 64 * 1024),
					(begin, end) => {
						requested.push({ begin, end });
						transport!.onDataRange(begin, bytes.slice(begin, end));
					},
					aborted,
				);
				runtime = (globalThis as typeof globalThis & { pdfjsLib: PdfTestRuntime }).pdfjsLib;
				expect(runtime.version).toBe(version);
				expect(loader.pdfjsVersion).toBe(version);
				expect(transport instanceof runtime.PDFDataRangeTransport).toBeTrue();
				expect(requested).toEqual([]);
				previousWorker = runtime.GlobalWorkerOptions.workerSrc;
				const workerSrc = pdfDefaultOptions.workerSrc;
				runtime.GlobalWorkerOptions.workerSrc =
					typeof workerSrc === 'function' ? workerSrc() : workerSrc;
				task = runtime.getDocument({
					range: transport,
					disableAutoFetch: pdfDefaultOptions.disableAutoFetch,
					disableStream: pdfDefaultOptions.disableStream,
					rangeChunkSize: 64 * 1024,
					useSystemFonts: true,
					cspPolicyService: TestBed.inject(PdfCspPolicyService),
				});
				const document = await task.promise;
				expect(document.numPages).toBe(1);
				const text = await (await document.getPage(1)).getTextContent();
				expect(text.items.map((item) => item.str ?? '').join(' ')).toContain(
					'Authenticated range fixture',
				);
				expect(requested.some((range) => range.begin >= 64 * 1024)).toBeTrue();
				expect(requested.every((range) => range.end - range.begin <= 64 * 1024)).toBeTrue();
				expect(
					requested.reduce((total, range) => total + range.end - range.begin, 64 * 1024),
				).toBeLessThanOrEqual(bytes.length);
				await task.destroy();
				expect(aborted).toHaveBeenCalledTimes(1);

				const largeBytes = multiChunkPdf(9 * 1024 * 1024);
				requested.length = 0;
				transport = await bridge.create(
					largeBytes.length,
					largeBytes.slice(0, 64 * 1024),
					(begin, end) => {
						requested.push({ begin, end });
						transport!.onDataRange(begin, largeBytes.slice(begin, end));
					},
					aborted,
				);
				task = runtime.getDocument({
					range: transport,
					disableAutoFetch: true,
					disableStream: true,
					rangeChunkSize: 64 * 1024,
					useSystemFonts: true,
					cspPolicyService: TestBed.inject(PdfCspPolicyService),
				});
				const largeDocument = await task.promise;
				expect(largeDocument.numPages).toBe(1);
				const largeText = await (await largeDocument.getPage(1)).getTextContent();
				expect(largeText.items.map((item) => item.str ?? '').join(' ')).toContain(
					'Authenticated range fixture',
				);
				expect(requested.some((range) => range.end - range.begin > 8 * 1024 * 1024)).toBeTrue();
				await task.destroy();
				expect(aborted).toHaveBeenCalledTimes(2);
			} finally {
				await task?.destroy();
				transport?.abort();
				if (runtime && previousWorker !== undefined)
					runtime.GlobalWorkerOptions.workerSrc = previousWorker;
				pdfDefaultOptions.assetsFolder = previousFolder;
				loader.releaseViewer();
			}
		}, 30_000);
	}
});
