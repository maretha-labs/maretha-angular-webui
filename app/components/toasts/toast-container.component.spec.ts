import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { TOAST_EASE_TIME, ToastService } from 'app/helpers/toast.service';
import { ToastContainerComponent } from './toast-container.component';

describe('ToastContainerComponent', () => {
	let fixture: ComponentFixture<ToastContainerComponent>;
	let service: ToastService;
	let host: HTMLElement;
	const toasts = () => Array.from(host.querySelectorAll<HTMLElement>('.ngx-toastr'));

	beforeEach(() => {
		fixture = TestBed.createComponent(ToastContainerComponent);
		service = TestBed.inject(ToastService);
		host = fixture.nativeElement;
		fixture.detectChanges();
	});

	it('renders each toast with its type class, title and message, fading it in', fakeAsync(() => {
		service.success('Document saved', 'Saved', { enableHtml: false });
		fixture.detectChanges();
		const [toast] = toasts();
		expect(host.querySelector('#toast-container.inline.toast-container')).not.toBeNull();
		expect(toast.classList).toContain('toast-success');
		expect(toast.style.opacity).toBe('0');
		expect(toast.querySelector('.toast-title')?.textContent).toContain('Saved');
		const message = toast.querySelector('.toast-message') as HTMLElement;
		expect(message.getAttribute('role')).toBe('alert');
		expect(message.textContent?.trim()).toBe('Document saved');
		expect(toast.querySelector('.toast-close-button')).toBeNull();
		tick();
		fixture.detectChanges();
		expect(toast.style.opacity).toBe('1');
		service.clear();
		tick(TOAST_EASE_TIME);
	}));

	it('renders HTML messages sanitized and text messages verbatim', fakeAsync(() => {
		service.error('<b>Bold</b><img src="x" onerror="window.toastXss = true">');
		service.info('<b>Plain</b>', '', { enableHtml: false });
		fixture.detectChanges();
		const [plain, html] = toasts().map((toast) => toast.querySelector('.toast-message')!);
		expect(html.querySelector('b')?.textContent).toBe('Bold');
		expect(html.querySelector('img')?.hasAttribute('onerror')).toBeFalse();
		expect(plain.querySelector('b')).toBeNull();
		expect(plain.textContent?.trim()).toBe('<b>Plain</b>');
		expect(plain.getAttribute('aria-label')).toBe('<b>Plain</b>');
		service.clear();
		tick(TOAST_EASE_TIME);
	}));

	it('dismisses on a click, holds while hovered and offers a close button on request', fakeAsync(() => {
		service.warning('Hover', '', { timeOut: 100, extendedTimeOut: 50 });
		service.info('Closable', '', { disableTimeOut: true, tapToDismiss: false, closeButton: true });
		fixture.detectChanges();
		const [closable, hover] = toasts();
		hover.dispatchEvent(new MouseEvent('mouseenter'));
		tick(1000);
		fixture.detectChanges();
		expect(toasts().length).toBe(2);
		hover.dispatchEvent(new MouseEvent('mouseleave'));
		tick(50 + TOAST_EASE_TIME);
		fixture.detectChanges();
		expect(toasts()).toEqual([closable]);
		closable.click();
		tick(TOAST_EASE_TIME);
		fixture.detectChanges();
		expect(toasts()).toEqual([closable]);
		const button = closable.querySelector('.toast-close-button') as HTMLButtonElement;
		expect(button.getAttribute('aria-label')).toBe('Close');
		button.click();
		fixture.detectChanges();
		expect(closable.style.opacity).toBe('0');
		tick(TOAST_EASE_TIME);
		fixture.detectChanges();
		expect(toasts()).toEqual([]);
	}));
});
