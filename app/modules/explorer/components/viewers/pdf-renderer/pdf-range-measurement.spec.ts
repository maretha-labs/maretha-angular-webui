import { TestBed } from '@angular/core/testing';
import { measurePdfRanges, PdfByteRange, SyntheticPdf } from 'app/testing/pdf-range-measurement';

const PAGES = 300;
const TARGET = 237;
// Scanned pages span several 64 KiB PDF.js chunks, so each page dictionary has its own chunk.
const SCAN_PAGE_BYTES = 200_000;

function within(ranges: readonly PdfByteRange[], spans: readonly PdfByteRange[]): boolean {
	return ranges.every((range) =>
		spans.some((span) => range.begin < span.end && range.end > span.begin),
	);
}

describe('PDF range locality with the installed PDF.js', () => {
	beforeEach(() => TestBed.configureTestingModule({}));

	it('jumps within a flat page tree by fetching only the requested page', async () => {
		const pdf = new SyntheticPdf({
			pages: PAGES,
			pageBytes: SCAN_PAGE_BYTES,
			layout: 'interleaved',
		});
		const result = await measurePdfRanges(pdf, TARGET, { quietMs: 20 });
		expect(result.pages).toBe(PAGES);
		expect(result.page).toBe(TARGET);
		expect(result.jump.requests).toBeGreaterThan(0);
		expect(within(result.jump.ranges, pdf.pageSpans(TARGET))).toBeTrue();
		// PDF.js prefetches every child of the root /Pages node while opening.
		expect(result.open.requests).toBeGreaterThan(PAGES * 0.9);
	}, 120_000);

	it('jumps within a balanced page tree by walking only the target leaf node', async () => {
		const pdf = new SyntheticPdf({
			pages: PAGES,
			pageBytes: SCAN_PAGE_BYTES,
			layout: 'interleaved',
			fanout: 10,
		});
		const result = await measurePdfRanges(pdf, TARGET, { quietMs: 20 });
		expect(within(result.jump.ranges, pdf.leafSpans(TARGET))).toBeTrue();
		expect(result.jump.requests).toBeLessThanOrEqual(10);
		// Pages 231-237 share a leaf node; PDF.js reads those dictionaries one after another.
		expect(result.jump.rounds).toBeGreaterThanOrEqual(7);
		expect(result.open.requests).toBeLessThan(PAGES / 10);
	}, 120_000);
});
