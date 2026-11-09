import { ElementRef } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { AutofocusDirective } from './autofocus.directive';

describe('AutofocusDirective', () => {
	it('leaves an input alone when autofocus is disabled', fakeAsync(() => {
		const input = document.createElement('input');
		const select = spyOn(input, 'select');
		const directive = new AutofocusDirective(new ElementRef(input));

		directive.ngAfterViewInit();
		tick();

		expect(select).not.toHaveBeenCalled();
	}));

	it('selects a nested input after the configured delay', fakeAsync(() => {
		const host = document.createElement('div');
		const input = document.createElement('input');
		host.append(input);
		const scroll = spyOn(input, 'scrollIntoView');
		const select = spyOn(input, 'select');
		const directive = new AutofocusDirective(new ElementRef(host));
		directive.nxAutofocus = true;
		directive.nxAutofocusDelay = 50;

		directive.ngAfterViewInit();
		tick(49);
		expect(select).not.toHaveBeenCalled();
		tick(1);

		expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
		expect(select).toHaveBeenCalledTimes(1);
	}));

	it('leaves the focus in a field the user moved to during the delay', fakeAsync(() => {
		const input = document.createElement('input');
		const other = document.createElement('input');
		document.body.append(input, other);
		const select = spyOn(input, 'select');
		const directive = new AutofocusDirective(new ElementRef(input));
		directive.nxAutofocus = true;
		directive.nxAutofocusDelay = 400;

		directive.ngAfterViewInit();
		other.focus();
		tick(400);

		expect(select).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(other);
		input.remove();
		other.remove();
	}));

	it('focuses a non-input host when explicitly enabled', fakeAsync(() => {
		const button = document.createElement('button');
		spyOn(button, 'scrollIntoView');
		const focus = spyOn(button, 'focus');
		const directive = new AutofocusDirective(new ElementRef(button));
		directive.nxAutofocus = true;
		directive.nxFocusAnyElement = true;

		directive.ngAfterViewInit();
		tick();

		expect(focus).toHaveBeenCalledTimes(1);
	}));

	it('tolerates a host without a focusable descendant', fakeAsync(() => {
		const directive = new AutofocusDirective(new ElementRef(document.createElement('div')));
		directive.nxAutofocus = true;
		directive.ngAfterViewInit();

		expect(() => tick()).not.toThrow();
	}));
});
