import type { WritableSignal } from '@angular/core';
import type { ActiveToast } from 'ngx-toastr';

/** Refresh text on the installed animated ngx-toastr Toast without restarting its timeout. */
export function updateToastText(toast: ActiveToast<unknown>, message: string, title: string): void {
	const component = toast.toastRef?.componentInstance as
		| {
				message?: string | null;
				title?: string;
				state?: WritableSignal<unknown>;
		  }
		| undefined;
	if (!component) return;
	component.message = message;
	component.title = title;
	// Toast is OnPush and its template reads this public state signal. A fresh state object
	// marks that view for checking while retaining active/removed state and animation options.
	if (typeof component.state?.update === 'function') {
		component.state.update((state) => (state && typeof state === 'object' ? { ...state } : state));
	}
}
