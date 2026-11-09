import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	inject,
	input,
	signal,
} from '@angular/core';
import {
	defineContribution,
	ExtensionRegistry,
	USER_MENU_SLOT,
	UserMenuContext,
	WebUiSlotComponent,
} from '@maretha/webui-sdk';

@Component({
	selector: 'nx-preview-support-entry',
	template: `<button
			type="button"
			[attr.aria-expanded]="expanded()"
			(click)="expanded.update(toggle)"
		>
			Client support
		</button>
		@if (expanded()) {
			<p>Support contribution for {{ context().user?.displayName }}.</p>
		}`,
	styles: `
		:host {
			display: block;
		}
		button {
			width: 100%;
			padding: 1.3em;
			border: 0;
			border-bottom: 1px solid #e3e3e3;
			background: #edf3ff;
			color: #1f28bf;
			font: inherit;
			text-align: start;
			cursor: pointer;
		}
		p {
			padding: 0 1.3em;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class SupportEntry {
	readonly context = input.required<UserMenuContext>();
	readonly expanded = signal(false);
	readonly toggle = (value: boolean) => !value;
}

@Component({
	selector: 'nx-user-menu-preview',
	imports: [WebUiSlotComponent],
	template: `<section id="user-menu-preview">
		<h2>Customize the account menu</h2>
		<p>
			The real USER_MENU host and default contributions, using sample callbacks. These controls
			change only this preview.
		</p>
		<div class="preview-controls">
			<button type="button" (click)="toggleThemes()">
				{{ themesHidden() ? 'Restore Themes entry' : 'Hide Themes entry' }}
			</button>
			<button type="button" (click)="toggleOrder()">
				{{ signOutFirst() ? 'Restore Sign Out order' : 'Move Sign Out first' }}
			</button>
			<button type="button" (click)="toggleSupport()">
				{{ supportAdded() ? 'Remove Support entry' : 'Add Support entry' }}
			</button>
			<button type="button" (click)="reset()">Reset account menu</button>
		</div>
		<div class="menu-example">
			<nav aria-label="Sample user menu">
				<nx-webui-slot name="USER_MENU" layout="stack" [context]="context()" />
			</nav>
			<div>
				<p role="status">{{ message() }}</p>
				<p>
					Selected language: <strong>{{ locale() }}</strong>
				</p>
				<p>
					The four disabled entries reflect account pages that still need implementation. Each entry
					can be replaced with a client component.
				</p>
			</div>
		</div>
	</section>`,
	styles: `
		:host {
			display: block;
			margin-top: 40px;
		}
		section {
			scroll-margin-top: 24px;
		}
		.menu-example {
			display: grid;
			grid-template-columns: minmax(240px, 340px) 1fr;
			gap: 28px;
			align-items: start;
		}
		nav {
			background: white;
			border: 1px solid #e3e3e3;
		}
		@media (max-width: 650px) {
			.menu-example {
				grid-template-columns: 1fr;
			}
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserMenuPreviewComponent {
	private readonly registry = inject(ExtensionRegistry);
	readonly themesHidden = signal(false);
	readonly signOutFirst = signal(false);
	readonly supportAdded = signal(false);
	readonly locale = signal('en-US');
	readonly message = signal('Choose an account action to see its callback.');
	private removeThemes?: () => void;
	private removeOrder?: () => void;
	private removeSupport?: () => void;
	private readonly user = {
		id: 'preview-user',
		displayName: 'Preview user',
		isAdministrator: false,
		groups: [],
	};
	private readonly languages = [
		{ key: 'en-US', label: 'English' },
		{ key: 'ro', label: 'Română' },
		{ key: 'ar', label: 'عربي' },
	];
	private readonly close = () => this.message.set('Close menu requested (sample callback).');
	private readonly profile = () => this.message.set('Open Profile requested (sample callback).');
	private readonly logout = () =>
		this.message.set('Sign Out requested (sample callback; no session exists).');
	private readonly language = (key: string) => {
		this.locale.set(key);
		this.message.set(`Language changed to ${key}.`);
	};
	readonly context = computed<UserMenuContext>(() => ({
		user: this.user,
		locale: this.locale(),
		route: '/',
		document: null,
		languages: this.languages,
		close: this.close,
		openProfile: this.profile,
		signOut: this.logout,
		changeLanguage: this.language,
	}));
	constructor() {
		inject(DestroyRef).onDestroy(() => {
			this.removeThemes?.();
			this.removeOrder?.();
			this.removeSupport?.();
		});
	}

	toggleThemes(): void {
		if (this.themesHidden()) this.removeThemes?.();
		else
			this.removeThemes = this.registry.register({
				id: 'preview.menu.hidden',
				overrides: [{ slot: 'USER_MENU', id: 'maretha.user.themes', disabled: true }],
			});
		this.themesHidden.update((value) => !value);
	}
	toggleOrder(): void {
		if (this.signOutFirst()) this.removeOrder?.();
		else
			this.removeOrder = this.registry.register({
				id: 'preview.menu.order',
				overrides: [{ slot: 'USER_MENU', id: 'maretha.user.sign-out', order: 0 }],
			});
		this.signOutFirst.update((value) => !value);
	}
	toggleSupport(): void {
		if (this.supportAdded()) this.removeSupport?.();
		else
			this.removeSupport = this.registry.register({
				id: 'preview.menu.support',
				contributions: [
					defineContribution(USER_MENU_SLOT, {
						id: 'client.support',
						order: 5,
						component: SupportEntry,
						when: (context) => context.user !== null,
					}),
				],
			});
		this.supportAdded.update((value) => !value);
	}
	reset(): void {
		if (this.themesHidden()) this.toggleThemes();
		if (this.signOutFirst()) this.toggleOrder();
		if (this.supportAdded()) this.toggleSupport();
		this.locale.set('en-US');
		this.message.set('Default menu restored.');
	}
}
