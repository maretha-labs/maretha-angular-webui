import { Injectable, inject } from '@angular/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { take } from 'rxjs';
import {
	ConfirmationDialogComponent,
	confirmationDialogOptions,
} from './confirmation-dialog.component';

export interface ConfirmDialogRequest {
	titleKey?: string;
	title?: string;
	messageKey?: string;
	message?: string;
	messageValues?: Record<string, string | number>;
	confirmKey?: string;
	confirm?: string;
	declineKey?: string;
	decline?: string;
	/** Makes Cancel the filled default, placed last; the action stays a visible outline button. */
	destructive?: boolean;
	/** A Web UI icon name, such as nuxeo:delete, shown in a tinted badge beside the question. */
	icon?: string;
}

/**
 * The one in-app confirmation for destructive or irreversible actions. Cancel, Escape, the
 * backdrop and the close control all decline; focus returns to the opening control.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
	private readonly modal = inject(BsModalService);
	confirm(request: ConfirmDialogRequest): Promise<boolean> {
		const opener =
			typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);
		const ref = this.modal.show(
			ConfirmationDialogComponent,
			confirmationDialogOptions({
				keyboard: true,
				ignoreBackdropClick: false,
				initialState: {
					titleKey: request.titleKey,
					title: request.title,
					messageKey: request.messageKey,
					message: request.message,
					messageValues: request.messageValues ?? {},
					confirmButtonTitleKey: request.confirmKey,
					confirmButtonTitle: request.confirm,
					declineButtonTitleKey: request.declineKey ?? 'command.cancel',
					declineButtonTitle: request.decline ?? 'Cancel',
					defaultButtonConfirm: !request.destructive,
					icon: request.icon,
				},
			}),
		);
		return new Promise<boolean>((resolve) => {
			let confirmed = false;
			const subscription = ref.content?.confirm$.subscribe(() => (confirmed = true));
			const finish = () => {
				subscription?.unsubscribe();
				if (opener?.isConnected) opener.focus?.();
				resolve(confirmed);
			};
			if (ref.onHidden) ref.onHidden.pipe(take(1)).subscribe(finish);
			else finish();
		});
	}
}
