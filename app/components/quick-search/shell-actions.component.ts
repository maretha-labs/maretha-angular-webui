import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { ShellActionContext, WebUiMessages, WebUiSlotComponent } from '@maretha/webui-sdk';
import { AuthService } from 'app/helpers/auth.service';
import { toApplicationUser } from 'app/helpers/application-user';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
@Component({
	selector: 'nx-shell-actions',
	host: { role: 'banner', '[attr.aria-label]': 'landmarkLabel()' },
	imports: [WebUiSlotComponent],
	template: `@if (context().user) {
		<nx-webui-slot name="SHELL_ACTIONS" [context]="context()" />
	}`,
	styles: ':host{position:fixed;inset-block-start:0;inset-inline-end:0;z-index:100;display:flex}',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellActionsComponent {
	private readonly messages = inject(WebUiMessages);
	readonly landmarkLabel = () =>
		this.messages.text('app.components.shell-actions.landmark', 'Application actions');
	private readonly auth = inject(AuthService);
	private readonly router = inject(Router);

	private readonly documents = inject(DocumentsManagerService);
	private readonly route = toSignal(
		this.router.events.pipe(
			filter((e): e is NavigationEnd => e instanceof NavigationEnd),
			map((e) => e.urlAfterRedirects),
		),
		{ initialValue: this.router.url },
	);
	readonly context = computed<ShellActionContext>(() => {
		const user = this.auth.userInfo();
		return {
			user: toApplicationUser(user),
			locale: this.messages.locale(),
			route: this.route(),
			document: this.documents.documentFetched(),
			navigate: (url) => this.router.navigateByUrl(url),
		};
	});
}
