import { justifiedRowSizes } from './justified-results.directive';

/** Groups consecutive tiles of equal height into rows. */
function rowsOf(sizes: { width: number; height: number }[]) {
	const rows: { width: number; height: number }[][] = [];
	for (const size of sizes) {
		const row = rows[rows.length - 1];
		if (row && Math.abs(row[0].height - size.height) < 1e-9) row.push(size);
		else rows.push([size]);
	}
	return rows;
}

describe('Assets justified rows', () => {
	it('fills each row like stock nuxeo-justified-grid: tiles at 196px until the next no longer fits, then the row grows to the full width', () => {
		const ratios = [0.5, 2, 1, 1.5, 0.75, 1.8],
			width = 980;
		const sizes = justifiedRowSizes(ratios, width);
		expect(sizes.length).toBe(ratios.length);
		const rows = rowsOf(sizes);
		// 98 + 392 + 196 + 294 = 980 fits at the target height; the 0.75 tile starts the next row.
		expect(rows.map((row) => row.length)).toEqual([4, 2]);
		expect(rows[0][0].height).toBeCloseTo(196 + 4, 6);
		for (const row of rows) {
			expect(row.reduce((sum, size) => sum + size.width, 0)).toBeCloseTo(width, 6);
			expect(row[0].height - 4).toBeGreaterThanOrEqual(196);
		}
		// The 2px border on each side frames the image; the image keeps the asset's proportions.
		sizes.forEach((size, index) =>
			expect(size.width / (size.height - 4)).toBeCloseTo(ratios[index], 6),
		);
	});
	it('gives a tile wider than the row its own full-width row and stretches the final row like stock', () => {
		const ratios = [16 / 9, 16 / 9, 16 / 9];
		const narrow = justifiedRowSizes(ratios, 320);
		expect(narrow.length).toBe(3);
		narrow.forEach((size) => expect(size.width).toBeCloseTo(320, 6));
		const wide = rowsOf(justifiedRowSizes(ratios, 1024));
		expect(wide.map((row) => row.length)).toEqual([2, 1]);
		expect(wide[1][0].width).toBeCloseTo(1024, 6);
		expect(justifiedRowSizes([0, Number.NaN, 1], 600).every((size) => size.width > 0)).toBeTrue();
	});
});
