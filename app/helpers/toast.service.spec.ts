import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { TOAST_DEFAULTS, TOAST_EASE_TIME, ToastService } from './toast.service';

describe('ToastService', () => {
	let service: ToastService;
	beforeEach(() => (service = TestBed.inject(ToastService)));

	it('shows the newest toast first and fades each one in on the next task', fakeAsync(() => {
		service.info('first', 'One');
		const second = service.error('second');
		expect(service.toasts().map((toast) => [toast.type, toast.message, toast.state])).toEqual([
			['error', 'second', 'inactive'],
			['info', 'first', 'inactive'],
		]);
		expect(second.title).toBe('');
		tick();
		expect(service.toasts().every((toast) => toast.state === 'active')).toBeTrue();
		service.clear();
		tick(TOAST_EASE_TIME);
		expect(service.toasts()).toEqual([]);
	}));

	it('hides a toast after its timeout, fading before it is dropped', fakeAsync(() => {
		const toast = service.success('Saved');
		expect(service.toasts()[0].options).toEqual(TOAST_DEFAULTS);
		tick(TOAST_DEFAULTS.timeOut - 1);
		expect(service.toasts()[0].state).toBe('active');
		tick(1);
		expect(service.toasts()[0].state).toBe('removed');
		expect(service.remove(toast.toastId)).toBeTrue();
		tick(TOAST_EASE_TIME);
		expect(service.toasts()).toEqual([]);
		expect(service.remove(toast.toastId)).toBeFalse();
		expect(toast.message).toBe('');
	}));

	it('returns the shown toast when the same message arrives again', fakeAsync(() => {
		const first = service.warning('Same', 'A');
		const again = service.error('Same', 'B');
		expect(again.toastId).toBe(first.toastId);
		expect(service.toasts().length).toBe(1);
		service.info();
		service.info();
		expect(service.toasts().length).toBe(3);
		service.remove(first.toastId);
		expect(service.info('Same').toastId).not.toBe(first.toastId);
		service.clear();
		tick(TOAST_EASE_TIME);
	}));

	it('keeps a toast without timeout until it is removed and updates its text in place', fakeAsync(() => {
		const toast = service.info('Progress 10%', 'Bulk', {
			disableTimeOut: true,
			tapToDismiss: false,
			enableHtml: false,
		});
		tick(60_000);
		toast.update('Progress 50%');
		expect([toast.message, toast.title]).toEqual(['Progress 50%', 'Bulk']);
		toast.update('Progress 90%', 'Bulk move');
		expect(service.toasts()[0]).toEqual(
			jasmine.objectContaining({ message: 'Progress 90%', title: 'Bulk move', state: 'active' }),
		);
		service.tap(toast.toastId);
		service.release(toast.toastId);
		tick(60_000);
		expect(service.toasts().length).toBe(1);
		service.remove(toast.toastId);
		tick(TOAST_EASE_TIME);
		expect(service.toasts()).toEqual([]);
	}));

	it('holds a hovered toast and hides it after the extended timeout once released', fakeAsync(() => {
		const toast = service.info('Hover me', '', { timeOut: 100, extendedTimeOut: 50 });
		tick(99);
		service.hold(toast.toastId);
		tick(10_000);
		expect(service.toasts()[0].state).toBe('active');
		service.release(toast.toastId);
		tick(49);
		expect(service.toasts()[0].state).toBe('active');
		tick(1);
		expect(service.toasts()[0].state).toBe('removed');
		service.hold(toast.toastId);
		service.release(toast.toastId);
		tick(TOAST_EASE_TIME);
		expect(service.toasts()).toEqual([]);
		service.hold(toast.toastId);
		service.release(toast.toastId);
		service.tap(toast.toastId);
	}));

	it('dismisses on a click unless the toast opts out, and keeps timeOut 0 toasts on release', fakeAsync(() => {
		const sticky = service.info('Sticky', '', { timeOut: 0 });
		tick(60_000);
		service.release(sticky.toastId);
		tick(60_000);
		expect(service.toasts()[0].state).toBe('active');
		service.tap(sticky.toastId);
		expect(service.toasts()[0].state).toBe('removed');
		tick(TOAST_EASE_TIME);
		expect(service.toasts()).toEqual([]);
	}));
});
