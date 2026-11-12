import { Component, ChangeDetectionStrategy } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { NgSelectComponent } from '@ng-select/ng-select';
import { SuggestionEscapeDirective } from './suggestion-escape.directive';

@Component({
	imports: [FormsModule, NgSelectComponent, SuggestionEscapeDirective],
	changeDetection: ChangeDetectionStrategy.Eager,
	template: `<div>
		<ng-select
			nxSuggestionEscape
			[items]="items"
			[multiple]="true"
			bindLabel="label"
			bindValue="id"
			[(ngModel)]="value"
		/>
	</div>`,
})
class DrawerComponent {
	readonly items = [
		{ id: 'audit', label: 'Audit' },
		{ id: 'birds', label: 'Birds' },
	];
	value: string[] = [];
	escapes = 0;
}

describe('SuggestionEscapeDirective', () => {
	function setup() {
		const fixture = TestBed.createComponent(DrawerComponent);
		fixture.detectChanges();
		const select = fixture.debugElement.query(By.directive(NgSelectComponent))
			.componentInstance as NgSelectComponent;
		const input = fixture.nativeElement.querySelector('ng-select input') as HTMLInputElement;
		// The drawer around the picker closes on an Escape that reaches it.
		(fixture.nativeElement as HTMLElement).addEventListener('keydown', (event) => {
			if (event.key === 'Escape') fixture.componentInstance.escapes++;
		});
		return { fixture, select, input };
	}
	function escape(input: HTMLInputElement): KeyboardEvent {
		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		input.dispatchEvent(event);
		return event;
	}

	it('closes open suggestions, keeps the typed text and stops the key at the picker', fakeAsync(() => {
		const { fixture, select, input } = setup();
		select.filter('aud');
		fixture.detectChanges();
		tick();
		expect(select.isOpen()).toBeTrue();
		const event = escape(input);
		fixture.detectChanges();
		expect(select.isOpen()).toBeFalse();
		expect(select.searchTerm).toBe('aud');
		expect(input.value).toBe('aud');
		expect(event.defaultPrevented).toBeTrue();
		expect(fixture.componentInstance.escapes).toBe(0);
		expect(fixture.componentInstance.value).toEqual([]);
	}));

	it('lets Escape reach the drawer when no suggestions are open', () => {
		const { fixture, select, input } = setup();
		expect(select.isOpen()).toBeFalse();
		escape(input);
		expect(fixture.componentInstance.escapes).toBe(1);
	});
});
