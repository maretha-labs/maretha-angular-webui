import { TestBed } from '@angular/core/testing';
import {
	PDFScriptLoaderService,
	PdfCspPolicyService,
	pdfDefaultOptions,
} from 'ngx-extended-pdf-viewer';
import {
	PdfRangeBridge,
	PdfRangeTransport,
} from 'app/modules/explorer/components/viewers/pdf-renderer/pdf-range-bridge';
import { PDF_INITIAL_RANGE_BYTES } from 'app/modules/explorer/components/viewers/pdf-renderer/pdf-range-source';

export interface PdfByteRange {
	readonly begin: number;
	readonly end: number;
}

export interface PdfByteSource {
	readonly length: number;
	read(begin: number, end: number): Uint8Array | Promise<Uint8Array>;
}

export interface PdfRangeCost {
	requests: number;
	bytes: number;
	rounds: number;
	ranges: PdfByteRange[];
}

export interface PdfRangeMeasurement {
	readonly pages: number;
	readonly length: number;
	readonly page: number;
	readonly open: PdfRangeCost;
	readonly jump: PdfRangeCost;
}

export interface SyntheticPdfShape {
	readonly pages: number;
	readonly pageBytes: number;
	readonly layout: 'interleaved' | 'clustered';
	readonly fanout?: number;
}

interface MeasuredPage {
	getOperatorList(): Promise<unknown>;
	getTextContent(): Promise<unknown>;
	getAnnotations(): Promise<unknown>;
}

interface MeasuredDocument {
	readonly numPages: number;
	getPage(page: number): Promise<MeasuredPage>;
	getMetadata(): Promise<unknown>;
	getOutline(): Promise<unknown>;
	getPageLabels(): Promise<unknown>;
}

interface MeasuredRuntime {
	GlobalWorkerOptions: { workerSrc: string };
	getDocument(options: {
		range: PdfRangeTransport;
		disableAutoFetch: boolean;
		disableStream: boolean;
		rangeChunkSize: number;
		useSystemFonts: boolean;
		cspPolicyService: PdfCspPolicyService;
	}): { promise: Promise<MeasuredDocument>; destroy(): Promise<void> };
}

/** A string is literal ASCII; a number is that many filler bytes inside a content-stream comment. */
type Part = string | number;

interface Segment {
	readonly begin: number;
	readonly length: number;
	readonly parts: readonly Part[];
}

const FILLER = '-'.charCodeAt(0);
const ASSETS = '/base/node_modules/ngx-extended-pdf-viewer/bleeding-edge';

/**
 * A deterministic PDF generated on demand, so a multi-gigabyte file costs only the requested bytes.
 * Every page has its own dictionary and content stream; the page tree is flat or balanced.
 */
export class SyntheticPdf implements PdfByteSource {
	readonly length: number;
	private readonly segments: Segment[] = [];
	private readonly spans = new Map<number, PdfByteRange>();
	private readonly parents = new Map<number, number>();
	private readonly kids = new Map<number, number[]>();

	constructor(readonly shape: SyntheticPdfShape) {
		const { pages, pageBytes, layout, fanout } = shape;
		const nodes = this.pageTree(pages, fanout);
		let size = 0;
		const add = (number: number, parts: Part[]) => {
			const length = parts.reduce<number>(
				(sum, part) => sum + (typeof part === 'string' ? part.length : part),
				0,
			);
			this.segments.push({ begin: size, length, parts });
			if (number) this.spans.set(number, { begin: size, end: size + length });
			size += length;
		};
		add(0, ['%PDF-1.7\n']);
		add(1, ['1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n']);
		add(3, ['3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n']);
		for (const node of nodes) {
			const parent = this.parents.has(node) ? `/Parent ${this.parents.get(node)} 0 R ` : '';
			const kids = this.kids.get(node)!;
			const count = node === 2 ? pages : this.count(node);
			add(node, [
				`${node} 0 obj\n<< /Type /Pages ${parent}/Kids [${kids.map((kid) => `${kid} 0 R`).join(' ')}] /Count ${count} >>\nendobj\n`,
			]);
		}
		const filler = Math.max(0, pageBytes - 160);
		const dictionary = (page: number) => {
			const number = SyntheticPdf.dictionary(page);
			add(number, [
				`${number} 0 obj\n<< /Type /Page /Parent ${this.parents.get(number)} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${number + 1} 0 R >>\nendobj\n`,
			]);
		};
		const content = (page: number) => {
			const number = SyntheticPdf.dictionary(page) + 1;
			const operators = `BT /F1 24 Tf 72 712 Td (Page ${page}) Tj ET\n%`;
			add(number, [
				`${number} 0 obj\n<< /Length ${operators.length + filler} >>\nstream\n${operators}`,
				filler,
				'\nendstream\nendobj\n',
			]);
		};
		for (let page = 1; page <= pages; page++) {
			dictionary(page);
			if (layout === 'interleaved') content(page);
		}
		if (layout === 'clustered') for (let page = 1; page <= pages; page++) content(page);
		const objects = Math.max(...this.spans.keys()) + 1;
		const entries = ['xref\n', `0 ${objects}\n`, '0000000000 65535 f \n'];
		for (let number = 1; number < objects; number++)
			entries.push(`${String(this.spans.get(number)!.begin).padStart(10, '0')} 00000 n \n`);
		const xref = size;
		add(0, [entries.join('')]);
		add(0, [`trailer\n<< /Size ${objects} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`]);
		this.length = size;
	}

	static dictionary(page: number): number {
		return 2 + 2 * page;
	}

	/** The page's dictionary and content stream. */
	pageSpans(page: number): PdfByteRange[] {
		const dictionary = SyntheticPdf.dictionary(page);
		return [this.spans.get(dictionary)!, this.spans.get(dictionary + 1)!];
	}

	/** The target page plus the dictionaries of earlier pages under the same parent node. */
	leafSpans(page: number): PdfByteRange[] {
		const target = SyntheticPdf.dictionary(page);
		const siblings = this.kids.get(this.parents.get(target)!)!;
		return [
			...siblings.filter((kid) => kid < target).map((kid) => this.spans.get(kid)!),
			...this.pageSpans(page),
		];
	}

	read(begin: number, end: number): Uint8Array {
		const bytes = new Uint8Array(end - begin);
		let low = 0;
		let high = this.segments.length - 1;
		while (low < high) {
			const middle = (low + high + 1) >> 1;
			if (this.segments[middle].begin <= begin) low = middle;
			else high = middle - 1;
		}
		for (let index = low; index < this.segments.length; index++) {
			const segment = this.segments[index];
			if (segment.begin >= end) break;
			let at = segment.begin;
			for (const part of segment.parts) {
				const size = typeof part === 'string' ? part.length : part;
				const from = Math.max(begin, at);
				const to = Math.min(end, at + size);
				if (typeof part === 'number' && from < to) bytes.fill(FILLER, from - begin, to - begin);
				else if (typeof part === 'string')
					for (let offset = from; offset < to; offset++)
						bytes[offset - begin] = part.charCodeAt(offset - at);
				at += size;
			}
		}
		return bytes;
	}

	private pageTree(pages: number, fanout?: number): number[] {
		let level = Array.from({ length: pages }, (_, index) => SyntheticPdf.dictionary(index + 1));
		let next = SyntheticPdf.dictionary(pages) + 2;
		const nodes: number[] = [];
		while (fanout && level.length > fanout) {
			const upper: number[] = [];
			for (let index = 0; index < level.length; index += fanout) {
				const node = next++;
				this.adopt(node, level.slice(index, index + fanout));
				upper.push(node);
			}
			nodes.push(...upper);
			level = upper;
		}
		this.adopt(2, level);
		return [2, ...nodes.reverse()];
	}

	private adopt(node: number, kids: number[]): void {
		this.kids.set(node, kids);
		for (const kid of kids) this.parents.set(kid, node);
	}

	private count(node: number): number {
		const kids = this.kids.get(node);
		return kids ? kids.reduce((sum, kid) => sum + this.count(kid), 0) : 1;
	}
}

/** Reads a PDF through a same-origin endpoint that answers single HTTP byte ranges. */
export async function httpPdfSource(url: string): Promise<PdfByteSource> {
	const read = async (begin: number, end: number) => {
		const response = await fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` } });
		if (response.status !== 206)
			throw new Error(`Expected 206 from ${url}, got ${response.status}.`);
		return { response, bytes: new Uint8Array(await response.arrayBuffer()) };
	};
	const { response } = await read(0, 1);
	const length = Number(/\/(\d+)$/.exec(response.headers.get('Content-Range') ?? '')?.[1]);
	if (!Number.isSafeInteger(length) || length <= 0)
		throw new Error(`${url} did not report a PDF length.`);
	return { length, read: async (begin, end) => (await read(begin, end)).bytes };
}

/**
 * Answers PDF.js range requests in lockstep waves: requests issued while the previous wave is being
 * delivered wait for the next one. Rounds therefore count dependent network round trips under
 * unlimited concurrency, independent of server latency.
 */
class LockstepNetwork {
	transport?: PdfRangeTransport;
	private pending: PdfByteRange[] = [];
	private lastRequest = 0;

	constructor(
		private readonly source: PdfByteSource,
		private readonly quietMs: number,
		private readonly timeoutMs: number,
	) {}

	readonly request = (begin: number, end: number): void => {
		this.pending.push({ begin, end });
		this.lastRequest = performance.now();
	};

	async measure<T>(operation: () => Promise<T>): Promise<{ value: T; cost: PdfRangeCost }> {
		const cost: PdfRangeCost = { requests: 0, bytes: 0, rounds: 0, ranges: [] };
		let settled = false;
		const result = operation().finally(() => (settled = true));
		result.catch(() => undefined);
		const deadline = performance.now() + this.timeoutMs;
		while (!settled) {
			if (performance.now() > deadline) throw new Error('PDF range measurement timed out.');
			await delay(5);
			if (!settled && this.pending.length && performance.now() - this.lastRequest >= this.quietMs) {
				cost.rounds++;
				await this.deliver(cost);
			}
		}
		const value = await result;
		// Requests still pending after the operation did not delay it; count their traffic only.
		await delay(this.quietMs);
		while (this.pending.length) {
			await this.deliver(cost);
			await delay(this.quietMs);
		}
		return { value, cost };
	}

	private async deliver(cost: PdfRangeCost): Promise<void> {
		const wave = this.pending.splice(0);
		for (let index = 0; index < wave.length; index += 16) {
			const group = wave.slice(index, index + 16);
			const chunks = await Promise.all(group.map(({ begin, end }) => this.source.read(begin, end)));
			group.forEach((range, offset) => {
				cost.requests++;
				cost.bytes += chunks[offset].length;
				cost.ranges.push(range);
				this.transport!.onDataRange(range.begin, chunks[offset]);
			});
		}
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function display(document: MeasuredDocument, page: number): Promise<void> {
	const pdfPage = await document.getPage(page);
	await Promise.all([
		pdfPage.getOperatorList(),
		pdfPage.getTextContent(),
		pdfPage.getAnnotations(),
	]);
}

/**
 * Opens a PDF through the application's 64 KiB first request, PdfRangeBridge and the installed
 * bleeding-edge PDF.js with the viewer's range options, displays page 1, then jumps to `page`.
 * "Display" means the operator list, text layer and annotations a rendered page needs; canvas
 * painting and viewer DOM work are not measured. Requires TestBed and the PDF.js assets served by Karma.
 */
export async function measurePdfRanges(
	source: PdfByteSource,
	page: number,
	{ quietMs = 100, timeoutMs = 30 * 60_000 } = {},
): Promise<PdfRangeMeasurement> {
	const loader = TestBed.inject(PDFScriptLoaderService);
	const bridge = TestBed.inject(PdfRangeBridge);
	const network = new LockstepNetwork(source, quietMs, timeoutMs);
	const previousFolder = pdfDefaultOptions.assetsFolder;
	pdfDefaultOptions.assetsFolder = new URL(ASSETS, location.origin).href;
	let runtime: MeasuredRuntime | undefined;
	let previousWorker: string | undefined;
	let transport: PdfRangeTransport | undefined;
	let task: ReturnType<MeasuredRuntime['getDocument']> | undefined;
	try {
		await loader.ensurePdfJsHasBeenLoaded(true, false, true);
		const first = { begin: 0, end: Math.min(PDF_INITIAL_RANGE_BYTES, source.length) };
		const initial = await source.read(first.begin, first.end);
		transport = await bridge.create(source.length, initial, network.request, () => undefined);
		network.transport = transport;
		runtime = (globalThis as typeof globalThis & { pdfjsLib: MeasuredRuntime }).pdfjsLib;
		previousWorker = runtime.GlobalWorkerOptions.workerSrc;
		const workerSrc = pdfDefaultOptions.workerSrc;
		runtime.GlobalWorkerOptions.workerSrc =
			typeof workerSrc === 'function' ? workerSrc() : workerSrc;
		const loading = runtime.getDocument({
			range: transport,
			disableAutoFetch: true,
			disableStream: true,
			rangeChunkSize: pdfDefaultOptions.rangeChunkSize,
			useSystemFonts: true,
			cspPolicyService: TestBed.inject(PdfCspPolicyService),
		});
		task = loading;
		const opened = await network.measure(async () => {
			const document = await loading.promise;
			await Promise.all([document.getMetadata(), document.getOutline(), document.getPageLabels()]);
			await display(document, 1);
			return document;
		});
		const target = Math.min(page, opened.value.numPages);
		const jumped = await network.measure(() => display(opened.value, target));
		return {
			pages: opened.value.numPages,
			length: source.length,
			page: target,
			open: {
				requests: opened.cost.requests + 1,
				bytes: opened.cost.bytes + first.end,
				rounds: opened.cost.rounds + 1,
				ranges: [first, ...opened.cost.ranges],
			},
			jump: jumped.cost,
		};
	} finally {
		await task?.destroy();
		transport?.abort();
		if (runtime && previousWorker !== undefined)
			runtime.GlobalWorkerOptions.workerSrc = previousWorker;
		pdfDefaultOptions.assetsFolder = previousFolder;
		loader.ngOnDestroy();
	}
}
