import { TestBed } from '@angular/core/testing';
import { LazyCacheService } from 'app/helpers/lazy-cache.service';
import { AssetsSearchTileComponent } from './assets-search-tile.component';

describe('Asset search direction', () => {
	it('moves the selection control to the reading start without mirroring customer content', () => {
		TestBed.configureTestingModule({
			imports: [AssetsSearchTileComponent],
			providers: [{ provide: LazyCacheService, useValue: {} }],
		});
		const fixture = TestBed.createComponent(AssetsSearchTileComponent);
		const activate = jasmine.createSpy('activate');
		const row = { uid: 'file', title: 'Customer title' };
		fixture.componentRef.setInput('row', row);
		fixture.componentRef.setInput('search', {
			selectedIds: () => [],
			assetAspectRatio: () => 1,
			thumbnail: () => undefined,
			activateAsset: activate,
		});
		fixture.nativeElement.style.width = '240px';
		fixture.detectChanges();
		const checkbox = fixture.nativeElement.querySelector('input') as HTMLInputElement;
		const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
		for (const direction of ['ltr', 'rtl', 'ltr']) {
			fixture.nativeElement.dir = direction;
			const hostBounds = fixture.nativeElement.getBoundingClientRect();
			const bounds = checkbox.getBoundingClientRect();
			const offset =
				direction === 'rtl' ? hostBounds.right - bounds.right : bounds.left - hostBounds.left;
			// Stock justified-grid check: 10px inside the tile's 2px frame.
			expect(offset).toBeCloseTo(12, 0);
			expect(getComputedStyle(button).textAlign).toBe('start');
			expect(button.textContent).toContain(row.title);
		}
		button.click();
		expect(activate).toHaveBeenCalledOnceWith(row);
	});
});
