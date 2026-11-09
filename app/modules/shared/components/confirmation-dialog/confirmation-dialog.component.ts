import { WebUiIconComponent, WebUiMessages, WebUiMessageValues } from '@maretha/webui-sdk';
import { Component, Input, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { BsModalRef, ModalOptions } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { NgStyle } from '@angular/common';

let confirmationDialogSequence = 0;

@Component({
	selector: 'nx-confirmation-dialog',
	templateUrl: './confirmation-dialog.component.html',
	styleUrls: ['./confirmation-dialog.component.scss'],
	imports: [WebUiIconComponent, NgStyle],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationDialogComponent implements OnInit {
	private readonly messages = inject(WebUiMessages);
	@Input() title?: string;
	@Input() titleKey?: string;
	@Input() titleId = `confirmation-dialog-title-${++confirmationDialogSequence}`;

	/** A Web UI icon name, such as nuxeo:delete, shown in a tinted badge beside the question. */
	@Input() icon?: string;

	@Input() message?: string;
	@Input() messageKey?: string;
	@Input() messageValues: WebUiMessageValues = {};

	@Input() declineButtonTitle?: string;
	@Input() declineButtonTitleKey?: string;

	@Input() confirmButtonTitle?: string;
	@Input() confirmButtonTitleKey?: string;

	@Input() defaultButtonConfirm = true;

	@Input() dismissable = true;

	get titleText(): string {
		return this.label(this.titleKey, this.title, 'dialog.confirmation', 'Confirmation');
	}
	get declineText(): string {
		return this.label(
			this.declineButtonTitleKey,
			this.declineButtonTitle,
			'dialog.decline',
			'Decline',
		);
	}
	get confirmText(): string {
		return this.label(
			this.confirmButtonTitleKey,
			this.confirmButtonTitle,
			'dialog.confirm',
			'Confirm',
		);
	}
	get closeText(): string {
		return this.messages.text('command.close', 'Close');
	}
	get messageText(): string {
		return this.messageKey
			? this.messages.format(this.messageKey, this.messageValues, this.message ?? this.messageKey)
			: (this.message ?? '');
	}
	private label(
		key: string | undefined,
		literal: string | undefined,
		defaultKey: string,
		fallback: string,
	): string {
		return key
			? this.messages.text(key, literal ?? fallback)
			: (literal ?? this.messages.text(defaultKey, fallback));
	}
	confirm$ = new Subject<any>();
	decline$ = new Subject();

	// --------------------------------------------------------------------------------------------------
	constructor(private readonly modalRef: BsModalRef) {}

	// --------------------------------------------------------------------------------------------------
	close(confirm = false) {
		if (confirm) this.confirm$.next(true);
		else this.decline$.next(false);

		this.modalRef.hide();
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit() {
		// A title-only question (stock's window.confirm text) renders without an empty body.
		if (!this.message && !this.messageKey && !this.title && !this.titleKey)
			throw 'nx-confirmation-dialog: You must specify the message';
	}
}

/** Keep the modal container's accessible name connected to its own heading. */
export function confirmationDialogOptions(
	options: ModalOptions<ConfirmationDialogComponent> = {},
): ModalOptions<ConfirmationDialogComponent> {
	const titleId = `confirmation-dialog-title-${++confirmationDialogSequence}`;
	return {
		...options,
		// Lifts every confirmation over the in-app editors that open it (styles.scss).
		class: [options.class, 'nx-confirmation-dialog'].filter(Boolean).join(' '),
		ariaLabelledBy: titleId,
		initialState: { ...options.initialState, titleId },
	};
}
