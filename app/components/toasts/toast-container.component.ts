import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WebUiMessagePipe } from 'app/extensions/webui-messages';
import { ToastService, TOAST_EASE_TIME } from 'app/helpers/toast.service';

/**
 * Renders the toasts of `ToastService` in place. The class names are the ones
 * `styles/toastr.scss` styles; the host adds no box of its own.
 */
@Component({
	selector: 'nx-toast-container',
	imports: [WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	styles: [':host { display: contents; }'],
	template: `
		<div id="toast-container" class="inline toast-container">
			@for (toast of toasts(); track toast.toastId) {
				<!-- A click dismisses early as a pointer shortcut; every toast also leaves by itself. -->
				<!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
				<div
					class="ngx-toastr"
					[class]="'toast-' + toast.type"
					[style.opacity]="toast.state === 'active' ? 1 : 0"
					[style.transition]="transition"
					(click)="service.tap(toast.toastId)"
					(mouseenter)="service.hold(toast.toastId)"
					(mouseleave)="service.release(toast.toastId)"
				>
					@if (toast.options.closeButton) {
						<button
							type="button"
							class="toast-close-button"
							[attr.aria-label]="'command.close' | webuiMessage: 'Close'"
							(click)="$event.stopPropagation(); service.remove(toast.toastId)"
						>
							<span aria-hidden="true">&times;</span>
						</button>
					}
					@if (toast.title) {
						<div class="toast-title" [attr.aria-label]="toast.title">{{ toast.title }}</div>
					}
					@if (toast.message) {
						@if (toast.options.enableHtml) {
							<div role="alert" class="toast-message" [innerHTML]="toast.message"></div>
						} @else {
							<div role="alert" class="toast-message" [attr.aria-label]="toast.message">
								{{ toast.message }}
							</div>
						}
					}
				</div>
			}
		</div>
	`,
})
export class ToastContainerComponent {
	protected readonly service = inject(ToastService);
	protected readonly toasts = this.service.toasts;
	protected readonly transition = `opacity ${TOAST_EASE_TIME}ms ease-in`;
}
