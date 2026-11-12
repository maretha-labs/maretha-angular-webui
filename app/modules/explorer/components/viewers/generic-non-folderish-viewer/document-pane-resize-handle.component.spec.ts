import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DocumentPaneResizeHandleComponent } from './document-pane-resize-handle.component';

const KEY = 'nuxeo.documentPage.sidePaneWidth';

@Component({
	imports: [DocumentPaneResizeHandleComponent],
	changeDetection: ChangeDetectionStrategy.Eager,
	template: `<div
		class="page-layout"
		style="display:grid;width:1000px;gap:16px;grid-template-columns:minmax(0,1fr) var(--nx-document-side-width,320px)"
	>
		<main>Preview</main>
		<aside class="details-side"><nx-document-pane-resize-handle /></aside>
	</div>`,
})
class PaneHost {}

describe('Document information pane resizing', () => {
	let fixture: ComponentFixture<PaneHost>;
	let handle: DocumentPaneResizeHandleComponent;
	let element: HTMLElement;
	let layout: HTMLElement;
	let viewport: jasmine.Spy;
	const key = (value: string, shiftKey = false) => {
		element.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, cancelable: true }));
		fixture.detectChanges();
	};
	beforeEach(async () => {
		localStorage.removeItem(KEY);
		viewport = spyOnProperty(window, 'innerWidth', 'get').and.returnValue(1400);
		await TestBed.configureTestingModule({ imports: [PaneHost] }).compileComponents();
		fixture = TestBed.createComponent(PaneHost);
		fixture.detectChanges();
		await fixture.whenStable();
		const debug = fixture.debugElement.query(By.directive(DocumentPaneResizeHandleComponent));
		handle = debug.componentInstance;
		element = debug.nativeElement;
		layout = fixture.nativeElement.querySelector('.page-layout');
		handle.measure();
		fixture.detectChanges();
	});
	afterEach(() => {
		fixture.destroy();
		localStorage.removeItem(KEY);
	});
	it('exposes a keyboard separator and applies bounded steps, Home/End and reset', () => {
		expect(element.getAttribute('role')).toBe('separator');
		expect(element.getAttribute('aria-orientation')).toBe('vertical');
		expect(element.getAttribute('tabindex')).toBe('0');
		expect(element.getAttribute('aria-valuenow')).toBe('320');
		key('ArrowLeft');
		expect(handle.width()).toBe(330);
		key('ArrowLeft', true);
		expect(handle.width()).toBe(380);
		key('Home');
		expect(handle.width()).toBe(280);
		key('ArrowRight');
		expect(handle.width()).toBe(280);
		key('End');
		expect(handle.width()).toBe(492);
		expect(localStorage.getItem(KEY)).toBe('492');
		key('Enter');
		expect(layout.style.getPropertyValue('--nx-document-side-width')).toBe('');
		expect(localStorage.getItem(KEY)).toBeNull();
		key('ArrowLeft');
		key(' ');
		expect(localStorage.getItem(KEY)).toBeNull();
	});
	it('reverses arrow and pointer direction for a right-to-left information pane', () => {
		layout.dir = 'rtl';
		key('ArrowRight');
		expect(handle.width()).toBe(330);
		key('ArrowLeft');
		expect(handle.width()).toBe(320);
		spyOn(element, 'setPointerCapture');
		spyOn(element, 'hasPointerCapture').and.returnValue(false);
		handle.startResize(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, button: 0 }));
		handle.moveResize(new PointerEvent('pointermove', { pointerId: 1, clientX: 140 }));
		expect(handle.width()).toBe(360);
		handle.finishResize(new PointerEvent('pointerup', { pointerId: 1 }));
		expect(localStorage.getItem(KEY)).toBe('360');
	});
	it('previews pointer changes, ignores unrelated pointers, persists only on completion and cancels safely', () => {
		spyOn(element, 'setPointerCapture');
		spyOn(element, 'hasPointerCapture').and.returnValue(true);
		const release = spyOn(element, 'releasePointerCapture');
		handle.startResize(new PointerEvent('pointerdown', { pointerId: 2, clientX: 500, button: 0 }));
		handle.moveResize(new PointerEvent('pointermove', { pointerId: 3, clientX: 400 }));
		expect(handle.width()).toBe(320);
		handle.moveResize(new PointerEvent('pointermove', { pointerId: 2, clientX: 400 }));
		expect(handle.width()).toBe(420);
		expect(localStorage.getItem(KEY)).toBeNull();
		key('Escape');
		expect(layout.style.getPropertyValue('--nx-document-side-width')).toBe('');
		expect(release).toHaveBeenCalledWith(2);
		handle.startResize(new PointerEvent('pointerdown', { pointerId: 4, clientX: 500, button: 0 }));
		handle.moveResize(new PointerEvent('pointermove', { pointerId: 4, clientX: 400 }));
		handle.finishResize(new PointerEvent('pointerup', { pointerId: 4 }));
		expect(localStorage.getItem(KEY)).toBe('420');
	});
	it('disables hidden, mobile and constrained layouts without overwriting the desktop preference', () => {
		key('ArrowLeft');
		viewport.and.returnValue(1024);
		handle.measure();
		fixture.detectChanges();
		expect(element.hidden).toBeTrue();
		expect(element.getAttribute('tabindex')).toBe('-1');
		key('End');
		expect(localStorage.getItem(KEY)).toBe('330');
		viewport.and.returnValue(1400);
		layout.style.width = '500px';
		handle.measure();
		expect(handle.active()).toBeFalse();
		layout.style.width = '1000px';
		const pane = element.closest('aside')!;
		pane.hidden = true;
		handle.measure();
		expect(handle.active()).toBeFalse();
		pane.hidden = false;
		handle.measure();
		expect(handle.active()).toBeTrue();
		expect(handle.width()).toBe(330);
	});
	it('reclamps to the available row and restores the preferred width when space returns', () => {
		key('End');
		layout.style.width = '600px';
		handle.measure();
		expect(handle.width()).toBe(292);
		expect(localStorage.getItem(KEY)).toBe('492');
		layout.style.width = '1000px';
		handle.measure();
		expect(handle.width()).toBe(492);
	});
	it('updates the separator value through ResizeObserver after restoring the default layout', async () => {
		key('End');
		key('Enter');
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
		);
		fixture.detectChanges();
		expect(handle.width()).toBe(320);
		expect(element.getAttribute('aria-valuenow')).toBe('320');
	});
	it('restores a persisted width on remount and resets by double click', async () => {
		key('ArrowLeft', true);
		fixture.destroy();
		fixture = TestBed.createComponent(PaneHost);
		fixture.detectChanges();
		await fixture.whenStable();
		const debug = fixture.debugElement.query(By.directive(DocumentPaneResizeHandleComponent));
		handle = debug.componentInstance;
		element = debug.nativeElement;
		handle.measure();
		expect(handle.width()).toBe(370);
		element.dispatchEvent(new MouseEvent('dblclick'));
		expect(localStorage.getItem(KEY)).toBeNull();
	});
});
