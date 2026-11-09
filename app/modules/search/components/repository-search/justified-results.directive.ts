import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';

/** Stock nuxeo-justified-grid rows (`_computeRows` / `_fitItemsToWidth`): tiles are added at the
 *  target height while they fit, then the row grows to fill the width, so rows are never shorter
 *  than the target. Each tile's 2px border sits inside its box and draws the gutter. */
export function justifiedRowSizes(
	ratios: readonly number[],
	width: number,
	target = 196,
	border = 2,
): { width: number; height: number }[] {
	const sizes: { width: number; height: number }[] = [];
	let row: number[] = [];
	let rowWidth = 0;
	const fit = () => {
		const height = (width * target) / rowWidth;
		for (const ratio of row) sizes.push({ width: ratio * height, height: height + 2 * border });
		row = [];
		rowWidth = 0;
	};
	for (const value of ratios) {
		const ratio = value > 0 && Number.isFinite(value) ? value : 1;
		if (row.length && rowWidth + ratio * target > width) fit();
		row.push(ratio);
		rowWidth += ratio * target;
	}
	if (row.length) fit();
	return sizes;
}

/** Justified rows have variable height; result paging retains document order on resize. */
@Directive({ selector: '[nxJustifiedResults]' })
export class JustifiedResultsDirective {
	readonly enabled = input(true, { alias: 'nxJustifiedResults' });
	private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly destroy = inject(DestroyRef);
	constructor() {
		afterNextRender(() => {
			let frame = 0;
			const layout = () => {
				cancelAnimationFrame(frame);
				frame = requestAnimationFrame(() => {
					if (!this.enabled()) return;
					for (const row of this.host.nativeElement.querySelectorAll<HTMLElement>(
						'.nx-results-projection__grid-row',
					)) {
						const tiles = [...row.querySelectorAll<HTMLElement>('[data-nx-justified-tile]')];
						// A hidden grid (drawer-only host) has no width to fill.
						const width = row.getBoundingClientRect().width;
						if (width <= 1) continue;
						// Half a pixel of slack: fractional tile widths never wrap the row's last tile.
						const sizes = justifiedRowSizes(
							tiles.map(
								(tile) => Number(tile.style.getPropertyValue('--nx-results-aspect-ratio')) || 1,
							),
							width - 0.5,
						);
						tiles.forEach((tile, index) => {
							tile.style.width = `${sizes[index].width}px`;
							tile.style.height = `${sizes[index].height}px`;
							tile.style.flex = '0 0 auto';
						});
					}
				});
			};
			const resize = new ResizeObserver(layout);
			resize.observe(this.host.nativeElement);
			const mutations = new MutationObserver(layout);
			mutations.observe(this.host.nativeElement, { childList: true, subtree: true });
			layout();
			this.destroy.onDestroy(() => {
				resize.disconnect();
				mutations.disconnect();
				cancelAnimationFrame(frame);
			});
		});
	}
}
