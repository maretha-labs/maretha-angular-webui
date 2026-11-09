import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UserMenuContext, WebUiMessages, WebUiThemePickerComponent } from '@maretha/webui-sdk';

@Component({
	selector: 'nx-user-menu-row',
	standalone: true,
	imports: [WebUiThemePickerComponent],
	templateUrl: './user-menu-row.component.html',
	styleUrl: './user-menu-row.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserMenuRowComponent {
	readonly context = input.required<UserMenuContext>();
	readonly label = input.required<string>();
	readonly labelKey = input<string>();
	readonly messages = inject(WebUiMessages);
	readonly action = input<'profile' | 'route' | 'sign-out' | 'themes' | 'unavailable'>(
		'unavailable',
	);
	readonly route = input<string>();
	private readonly router = inject(Router);

	readonly themesOpen = signal(false);

	activate(): void {
		if (!this.context().user) return;
		if (this.action() === 'themes') this.themesOpen.update((open) => !open);
		if (this.action() === 'profile') this.context().openProfile();
		if (this.action() === 'route' && this.route()) {
			if (window.matchMedia('(max-width: 720px)').matches) this.context().close();
			void this.router.navigateByUrl(this.route()!);
		}
		if (this.action() === 'sign-out') this.context().signOut();
	}
}
