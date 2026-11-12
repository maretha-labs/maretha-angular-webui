import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

/** Per-toast settings; a field left out takes the value in `TOAST_DEFAULTS`. */
export interface ToastOptions {
	/** Milliseconds before the toast hides itself; 0 keeps it until dismissed. */
	timeOut?: number;
	/** Milliseconds a toast stays after the pointer leaves it. */
	extendedTimeOut?: number;
	/** Keep the toast until `remove()` or a click dismisses it. */
	disableTimeOut?: boolean;
	/** Render the message as sanitized HTML instead of text. */
	enableHtml?: boolean;
	closeButton?: boolean;
	/** A click on the toast dismisses it. */
	tapToDismiss?: boolean;
}

export const TOAST_DEFAULTS: Readonly<Required<ToastOptions>> = Object.freeze({
	timeOut: 3000,
	extendedTimeOut: 1000,
	disableTimeOut: false,
	enableHtml: true,
	closeButton: false,
	tapToDismiss: true,
});

/** Milliseconds of the fade a toast plays when it appears and when it leaves. */
export const TOAST_EASE_TIME = 300;

export type ToastState = 'inactive' | 'active' | 'removed';

/** What the container renders for one toast. */
export interface ToastView {
	readonly toastId: number;
	readonly type: ToastType;
	readonly message: string;
	readonly title: string;
	readonly options: Readonly<Required<ToastOptions>>;
	readonly state: ToastState;
}

/** Handle on a shown toast: pass `toastId` to `remove()`, or change its text in place. */
export interface ActiveToast {
	readonly toastId: number;
	readonly message: string;
	readonly title: string;
	/** Replaces the text without restarting the timeout. */
	update(message: string, title?: string): void;
}

/**
 * Notifications of the application shell. Toasts are state here and DOM in
 * `ToastContainerComponent`; a toast whose message is already on screen is not shown twice.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
	private readonly entries = signal<readonly ToastView[]>([]);
	private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
	private nextId = 0;

	/** Newest first. */
	readonly toasts = this.entries.asReadonly();

	success(message?: string, title?: string, options?: ToastOptions): ActiveToast {
		return this.show('success', message, title, options);
	}

	error(message?: string, title?: string, options?: ToastOptions): ActiveToast {
		return this.show('error', message, title, options);
	}

	info(message?: string, title?: string, options?: ToastOptions): ActiveToast {
		return this.show('info', message, title, options);
	}

	warning(message?: string, title?: string, options?: ToastOptions): ActiveToast {
		return this.show('warning', message, title, options);
	}

	/** Fades the toast out and drops it; false when no such toast is shown. */
	remove(toastId: number): boolean {
		const entry = this.find(toastId);
		if (!entry) return false;
		if (entry.state === 'removed') return true;
		this.clearTimer(toastId);
		this.patch(toastId, { state: 'removed' });
		this.timers.set(
			toastId,
			setTimeout(() => this.drop(toastId), TOAST_EASE_TIME),
		);
		return true;
	}

	/** Removes every toast. */
	clear(): void {
		for (const entry of this.entries()) this.remove(entry.toastId);
	}

	/** The pointer entered the toast: it stays while hovered. */
	hold(toastId: number): void {
		const entry = this.find(toastId);
		if (!entry || entry.state === 'removed') return;
		this.clearTimer(toastId);
	}

	/** The pointer left the toast: it hides after `extendedTimeOut`. */
	release(toastId: number): void {
		const entry = this.find(toastId);
		if (!entry || entry.state === 'removed') return;
		const { disableTimeOut, extendedTimeOut, timeOut } = entry.options;
		if (disableTimeOut || timeOut === 0 || extendedTimeOut === 0) return;
		this.schedule(toastId, extendedTimeOut);
	}

	/** A click on the toast body. */
	tap(toastId: number): void {
		if (this.find(toastId)?.options.tapToDismiss) this.remove(toastId);
	}

	private show(type: ToastType, message = '', title = '', options: ToastOptions = {}): ActiveToast {
		const duplicate = message
			? this.entries().find((entry) => entry.state !== 'removed' && entry.message === message)
			: undefined;
		if (duplicate) return this.handle(duplicate.toastId);

		const toastId = ++this.nextId;
		const merged = { ...TOAST_DEFAULTS, ...options };
		this.entries.update((entries) => [
			{ toastId, type, message, title, options: merged, state: 'inactive' },
			...entries,
		]);
		// The toast enters transparent and fades in on the next task.
		setTimeout(() => {
			if (this.find(toastId)?.state === 'inactive') this.patch(toastId, { state: 'active' });
		});
		if (!merged.disableTimeOut && merged.timeOut > 0) this.schedule(toastId, merged.timeOut);
		return this.handle(toastId);
	}

	private handle(toastId: number): ActiveToast {
		const find = () => this.find(toastId);
		const patch = (changes: Partial<ToastView>) => this.patch(toastId, changes);
		return {
			toastId,
			get message() {
				return find()?.message ?? '';
			},
			get title() {
				return find()?.title ?? '';
			},
			update(message: string, title?: string) {
				patch(title === undefined ? { message } : { message, title });
			},
		};
	}

	private find(toastId: number): ToastView | undefined {
		return this.entries().find((entry) => entry.toastId === toastId);
	}

	private patch(toastId: number, changes: Partial<ToastView>): void {
		this.entries.update((entries) =>
			entries.map((entry) => (entry.toastId === toastId ? { ...entry, ...changes } : entry)),
		);
	}

	private schedule(toastId: number, delay: number): void {
		this.clearTimer(toastId);
		this.timers.set(
			toastId,
			setTimeout(() => this.remove(toastId), delay),
		);
	}

	private clearTimer(toastId: number): void {
		const timer = this.timers.get(toastId);
		if (timer !== undefined) clearTimeout(timer);
		this.timers.delete(toastId);
	}

	private drop(toastId: number): void {
		this.clearTimer(toastId);
		this.entries.update((entries) => entries.filter((entry) => entry.toastId !== toastId));
	}
}
