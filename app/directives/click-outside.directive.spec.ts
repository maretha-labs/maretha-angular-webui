import { ElementRef, Renderer2, SimpleChange } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { ClickOutsideDirective } from './click-outside.directive';

describe('ClickOutsideDirective', () => {
	let host: HTMLElement;
	let directive: ClickOutsideDirective;
	let renderer: jasmine.SpyObj<Renderer2>;
	let removeListener: jasmine.Spy;
	let mousedown: (event: PointerEvent) => void;

	beforeEach(() => {
		host = document.createElement('div');
		renderer = jasmine.createSpyObj<Renderer2>('Renderer2', ['listen']);
		removeListener = jasmine.createSpy('removeListener');
		renderer.listen.and.callFake((_target, _eventName, callback) => {
			mousedown = callback;
			return removeListener;
		});
		directive = new ClickOutsideDirective(new ElementRef(host), renderer);
		directive.nxClickOutside = true;
		directive.ngOnChanges({ nxClickOutside: new SimpleChange(false, true, true) });
	});

	it('emits after the delay for an outside click', fakeAsync(() => {
		const emitted = spyOn(directive.nxClickedOutside, 'emit');
		directive.nxClickOutsideEventDelay = 20;

		mousedown({ target: document.createElement('button') } as unknown as PointerEvent);
		tick(19);
		expect(emitted).not.toHaveBeenCalled();
		tick(1);

		expect(emitted).toHaveBeenCalledTimes(1);
	}));

	it('ignores clicks on the host or its descendants', fakeAsync(() => {
		const child = document.createElement('button');
		host.append(child);
		const emitted = spyOn(directive.nxClickedOutside, 'emit');

		mousedown({ target: host } as unknown as PointerEvent);
		mousedown({ target: child } as unknown as PointerEvent);
		tick();

		expect(emitted).not.toHaveBeenCalled();
	}));

	it('ignores clicks within the configured excluded parent', fakeAsync(() => {
		const excluded = document.createElement('div');
		excluded.className = 'click-outside-spec-excluded';
		const child = document.createElement('button');
		excluded.append(child);
		document.body.append(excluded);
		directive.nxClickOutsideDisabledWhenParentSelectorIs = '.click-outside-spec-excluded';
		const emitted = spyOn(directive.nxClickedOutside, 'emit');

		try {
			mousedown({ target: child } as unknown as PointerEvent);
			tick();
			expect(emitted).not.toHaveBeenCalled();
		} finally {
			excluded.remove();
		}
	}));

	it('removes the window listener when disabled', () => {
		directive.nxClickOutside = false;
		directive.ngOnChanges({ nxClickOutside: new SimpleChange(true, false, false) });

		expect(removeListener).toHaveBeenCalledTimes(1);
	});

	it('removes the window listener when destroyed', () => {
		directive.ngOnDestroy();

		expect(removeListener).toHaveBeenCalledTimes(1);
	});
});
