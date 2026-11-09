import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WebUiMessages } from '@maretha/webui-sdk';
import { DrawerWidthPreferences } from 'app/helpers/drawer-width-preferences.service';
import { SidebarService } from 'app/helpers/sidebar.service';
import { DrawerResizeHandleComponent } from './drawer-resize-handle.component';

@Component({
	imports: [DrawerResizeHandleComponent],
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
	template: `<nx-sidebar>
		<nav id="nx-primary-navigation"></nav>
		<section id="nx-sidebar-drawer"></section>
		<nx-drawer-resize-handle />
	</nx-sidebar>`,
})
class ResizeTestHost {}

describe('Drawer resize handle', () => {
	let fixture: ComponentFixture<ResizeTestHost>;
	let handle: HTMLElement;
	let panelWidth: number;
	let captured: Set<number>;
	let capture: jasmine.Spy;
	let release: jasmine.Spy;
	let originalViewport: PropertyDescriptor | undefined;
	let scope: ReturnType<typeof signal<string | null>>;
	let drawerOpen: ReturnType<typeof signal<boolean>>;
	let preferences: {
		scope: typeof scope;
		preferredWidth: ReturnType<typeof signal<number | null>>;
		previewWidth: jasmine.Spy;
		saveWidth: jasmine.Spy;
		cancelPreview: jasmine.Spy;
		resetWidth: jasmine.Spy;
	};

	function viewport(width: number): void {
		Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
	}

	function pointer(type: string, clientX: number, pointerId = 7, button = 0): PointerEvent {
		const event = new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			pointerId,
			pointerType: 'mouse',
			button,
			clientX,
		});
		handle.dispatchEvent(event);
		return event;
	}

	function key(key: string, shiftKey = false): KeyboardEvent {
		const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
		handle.dispatchEvent(event);
		return event;
	}

	beforeEach(async () => {
		originalViewport = Object.getOwnPropertyDescriptor(window, 'innerWidth');
		viewport(1280);
		panelWidth = 240;
		captured = new Set();
		scope = signal<string | null>('app/alice/tree');
		drawerOpen = signal(true);
		preferences = {
			scope,
			preferredWidth: signal<number | null>(null),
			previewWidth: jasmine.createSpy('previewWidth').and.callFake((width: number) => {
				panelWidth = width;
			}),
			saveWidth: jasmine.createSpy('saveWidth').and.callFake((width: number) => {
				panelWidth = width;
				preferences.preferredWidth.set(width);
			}),
			cancelPreview: jasmine.createSpy('cancelPreview'),
			resetWidth: jasmine.createSpy('resetWidth').and.callFake(() => {
				panelWidth = 240;
				preferences.preferredWidth.set(null);
			}),
		};
		TestBed.configureTestingModule({
			imports: [ResizeTestHost],
			providers: [
				{ provide: DrawerWidthPreferences, useValue: preferences },
				{ provide: SidebarService, useValue: { drawerOpen } },
				{
					provide: WebUiMessages,
					useValue: { text: (_key: string, fallback: string) => fallback },
				},
			],
		});
		fixture = TestBed.createComponent(ResizeTestHost);
		const panel = fixture.nativeElement.querySelector('#nx-sidebar-drawer') as HTMLElement;
		const rail = fixture.nativeElement.querySelector('#nx-primary-navigation') as HTMLElement;
		handle = fixture.nativeElement.querySelector('nx-drawer-resize-handle');
		spyOn(panel, 'getBoundingClientRect').and.callFake(() => new DOMRect(52, 0, panelWidth, 700));
		spyOn(rail, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 0, 52, 700));
		capture = spyOn(handle, 'setPointerCapture').and.callFake((id) => captured.add(id));
		spyOn(handle, 'hasPointerCapture').and.callFake((id) => captured.has(id));
		release = spyOn(handle, 'releasePointerCapture').and.callFake((id) => captured.delete(id));
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
	});

	afterEach(() => {
		fixture.destroy();
		if (originalViewport) Object.defineProperty(window, 'innerWidth', originalViewport);
	});

	it('exposes measured bounds and accessible separator instructions after rendering', () => {
		expect(handle.getAttribute('role')).toBe('separator');
		expect(handle.getAttribute('aria-controls')).toBe('nx-sidebar-drawer');
		expect(handle.getAttribute('aria-orientation')).toBe('vertical');
		expect(handle.getAttribute('aria-label')).toBe('Resize navigation drawer');
		expect(handle.getAttribute('title')).toContain('Use arrow keys');
		expect(handle.getAttribute('aria-valuemin')).toBe('200');
		expect(handle.getAttribute('aria-valuemax')).toBe('640');
		expect(handle.getAttribute('aria-valuenow')).toBe('240');
	});

	it('previews a primary drag and saves its final width only when that pointer is released', () => {
		expect(pointer('pointerdown', 292).defaultPrevented).toBeTrue();
		expect(capture).toHaveBeenCalledOnceWith(7);
		pointer('pointermove', 352);
		expect(preferences.previewWidth.calls.allArgs()).toEqual([[240], [300]]);
		expect(preferences.saveWidth).not.toHaveBeenCalled();
		pointer('pointerup', 352);
		expect(preferences.saveWidth).toHaveBeenCalledOnceWith(300);
		expect(release).toHaveBeenCalledOnceWith(7);
		expect(preferences.cancelPreview).toHaveBeenCalled();
		pointer('pointermove', 400);
		pointer('pointerup', 400);
		expect(preferences.saveWidth).toHaveBeenCalledTimes(1);
	});

	it('ignores secondary buttons and events from pointers other than the captured one', () => {
		expect(pointer('pointerdown', 292, 8, 2).defaultPrevented).toBeFalse();
		expect(capture).not.toHaveBeenCalled();
		pointer('pointerdown', 292);
		pointer('pointermove', 400, 8);
		pointer('pointerup', 400, 8);
		expect(preferences.previewWidth).toHaveBeenCalledOnceWith(240);
		expect(release).not.toHaveBeenCalled();
		pointer('pointerup', 292);
		expect(release).toHaveBeenCalledOnceWith(7);
		expect(preferences.saveWidth).not.toHaveBeenCalled();
	});

	it('clamps dragging to minimum and maximum widths', () => {
		pointer('pointerdown', 292);
		pointer('pointermove', 0);
		expect(preferences.previewWidth).toHaveBeenCalledWith(200);
		pointer('pointermove', 2000);
		expect(preferences.previewWidth).toHaveBeenCalledWith(640);
		pointer('pointerup', 2000);
		expect(preferences.saveWidth).toHaveBeenCalledOnceWith(640);
	});

	it('reverses the drag direction for RTL drawers', () => {
		handle.style.direction = 'rtl';
		pointer('pointerdown', 1000);
		pointer('pointermove', 950);
		pointer('pointerup', 950);
		expect(preferences.saveWidth).toHaveBeenCalledOnceWith(290);
	});

	it('supports directional keyboard steps, Shift and RTL', () => {
		expect(key('ArrowRight').defaultPrevented).toBeTrue();
		expect(preferences.saveWidth).toHaveBeenCalledWith(250);
		key('ArrowLeft');
		expect(preferences.saveWidth).toHaveBeenCalledWith(240);
		key('ArrowRight', true);
		expect(preferences.saveWidth).toHaveBeenCalledWith(290);
		handle.style.direction = 'rtl';
		key('ArrowLeft', true);
		expect(preferences.saveWidth).toHaveBeenCalledWith(340);
		key('ArrowRight');
		expect(preferences.saveWidth).toHaveBeenCalledWith(330);
	});

	it('accumulates repeated keyboard steps while the panel geometry is still transitioning', () => {
		preferences.saveWidth.and.callFake((width: number) => preferences.preferredWidth.set(width));
		key('ArrowRight');
		key('ArrowRight');
		key('ArrowRight');
		expect(panelWidth).toBe(240);
		expect(preferences.saveWidth.calls.allArgs()).toEqual([[250], [260], [270]]);
	});

	it('adjusts an oversized saved preference from the current viewport limit', () => {
		viewport(800);
		preferences.preferredWidth.set(600);
		key('ArrowLeft');
		expect(preferences.saveWidth).toHaveBeenCalledOnceWith(418);
	});

	it('supports minimum, viewport-limited maximum and reset from the keyboard or double-click', () => {
		viewport(800);
		window.dispatchEvent(new Event('resize'));
		key('End');
		expect(preferences.saveWidth).toHaveBeenCalledWith(428);
		key('ArrowRight', true);
		expect(preferences.saveWidth.calls.mostRecent().args).toEqual([428]);
		key('Home');
		expect(preferences.saveWidth.calls.mostRecent().args).toEqual([200]);
		key('ArrowLeft');
		expect(preferences.saveWidth.calls.mostRecent().args).toEqual([200]);
		expect(key('Enter').defaultPrevented).toBeTrue();
		expect(preferences.resetWidth).toHaveBeenCalledTimes(1);
		handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(preferences.resetWidth).toHaveBeenCalledTimes(2);
		expect(key('Tab').defaultPrevented).toBeFalse();
	});

	for (const cancellation of ['pointercancel', 'lostpointercapture']) {
		it(`cancels a captured drag on ${cancellation} without saving`, () => {
			pointer('pointerdown', 292);
			pointer('pointermove', 352);
			pointer(cancellation, 352);
			pointer('pointerup', 352);
			expect(release).toHaveBeenCalledOnceWith(7);
			expect(preferences.cancelPreview).toHaveBeenCalled();
			expect(preferences.saveWidth).not.toHaveBeenCalled();
		});
	}

	it('cancels dragging with Escape and stops the key from closing the drawer', () => {
		pointer('pointerdown', 292);
		pointer('pointermove', 352);
		const ancestorKey = jasmine.createSpy('ancestorKey');
		fixture.nativeElement.addEventListener('keydown', ancestorKey);
		expect(key('Escape').defaultPrevented).toBeTrue();
		expect(ancestorKey).not.toHaveBeenCalled();
		pointer('pointerup', 352);
		expect(release).toHaveBeenCalledOnceWith(7);
		expect(preferences.saveWidth).not.toHaveBeenCalled();
	});

	for (const nextScope of ['app/alice/search', 'app/bob/tree', null]) {
		it(`does not save to a changed user or drawer scope (${nextScope}) before effects run`, () => {
			pointer('pointerdown', 292);
			pointer('pointermove', 352);
			scope.set(nextScope);
			pointer('pointerup', 352);
			expect(preferences.saveWidth).not.toHaveBeenCalled();
			expect(release).toHaveBeenCalledOnceWith(7);
		});
	}

	it('reactively cancels capture when changing drawers', () => {
		pointer('pointerdown', 292);
		pointer('pointermove', 352);
		scope.set('app/alice/search');
		fixture.detectChanges();
		expect(release).toHaveBeenCalledOnceWith(7);
		pointer('pointerup', 352);
		expect(preferences.saveWidth).not.toHaveBeenCalled();
	});

	it('cannot save after closing the drawer, even before effects run', () => {
		pointer('pointerdown', 292);
		pointer('pointermove', 352);
		drawerOpen.set(false);
		pointer('pointerup', 352);
		expect(preferences.saveWidth).not.toHaveBeenCalled();
		expect(release).toHaveBeenCalledOnceWith(7);
	});

	it('cancels capture on mobile resize and ignores subsequent pointer and keyboard resizing', () => {
		pointer('pointerdown', 292);
		pointer('pointermove', 352);
		viewport(720);
		window.dispatchEvent(new Event('resize'));
		expect(release).toHaveBeenCalledOnceWith(7);
		pointer('pointerup', 352);
		expect(pointer('pointerdown', 292).defaultPrevented).toBeFalse();
		expect(key('ArrowRight').defaultPrevented).toBeFalse();
		expect(capture).toHaveBeenCalledTimes(1);
		expect(preferences.saveWidth).not.toHaveBeenCalled();
	});

	it('releases capture and cancels the preview when destroyed mid-drag', () => {
		pointer('pointerdown', 292);
		pointer('pointermove', 352);
		fixture.destroy();
		expect(release).toHaveBeenCalledOnceWith(7);
		expect(preferences.cancelPreview).toHaveBeenCalled();
		expect(preferences.saveWidth).not.toHaveBeenCalled();
	});
});
