import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { selectionToolbarShortcut } from './selection-toolbar-shortcut';

@Component({
	selector: 'nx-test-selection-bar',
	changeDetection: ChangeDetectionStrategy.Eager,
	template: `<p><button type="button" class="outside">Outside</button></p>
		<div class="bar">
			<span class="hint"></span><button type="button" class="first">Clear</button>
		</div>`,
})
class TestBarComponent {
	readonly shortcut = selectionToolbarShortcut('.bar');
}

describe('selectionToolbarShortcut', () => {
	const press = (init: KeyboardEventInit) =>
		document.dispatchEvent(new KeyboardEvent('keydown', { key: '.', bubbles: true, ...init }));
	it('moves focus into the bar on Command/Ctrl + . and keeps the hint until the bar is used', () => {
		const fixture = TestBed.createComponent(TestBarComponent);
		document.body.appendChild(fixture.nativeElement);
		const { keyboardHint, modifierKey } = fixture.componentInstance.shortcut;
		const outside = fixture.nativeElement.querySelector('.outside') as HTMLButtonElement;
		outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(keyboardHint()).toBeTrue();
		press({ key: '.' });
		expect(keyboardHint()).toBeTrue();
		press(modifierKey === 'Command' ? { metaKey: true } : { ctrlKey: true });
		expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.first'));
		expect(keyboardHint()).toBeFalse();
		fixture.destroy();
		fixture.nativeElement.remove();
	});
	it('hides the hint when the bar itself is pressed', () => {
		const fixture = TestBed.createComponent(TestBarComponent);
		const hint = fixture.componentInstance.shortcut.keyboardHint;
		fixture.nativeElement
			.querySelector('.hint')
			.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(hint()).toBeFalse();
		fixture.destroy();
	});
});
