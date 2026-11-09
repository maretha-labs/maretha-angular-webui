import { defineContribution, provideWebUiExtensions, USER_MENU_SLOT } from '@maretha/webui-sdk';
import { UserMenuLanguageComponent } from './user-menu-language.component';
import { UserMenuRowComponent } from './user-menu-row.component';

export function provideDefaultUserMenu() {
	return provideWebUiExtensions({
		id: 'maretha.core.user-menu',
		contributions: [
			defineContribution(USER_MENU_SLOT, {
				id: 'maretha.user.profile',
				order: 10,
				component: UserMenuRowComponent,
				inputs: {
					label: 'Profile',
					labelKey: 'app.user.profile',
					action: 'route',
					route: '/profile',
				},
				when: (context) => context.user !== null,
			}),
			defineContribution(USER_MENU_SLOT, {
				id: 'maretha.user.authorized-applications',
				order: 20,
				component: UserMenuRowComponent,
				inputs: {
					label: 'Authorized Applications',
					labelKey: 'app.user.authorizedApps',
					action: 'route',
					route: '/user-authorized-apps',
				},
				when: (context) => context.user !== null,
			}),
			defineContribution(USER_MENU_SLOT, {
				id: 'maretha.user.cloud-services',
				order: 30,
				component: UserMenuRowComponent,
				inputs: {
					label: 'Cloud Services',
					labelKey: 'app.user.cloudServices',
					action: 'route',
					route: '/user-cloud-services',
				},
				when: (context) => context.user !== null,
			}),
			defineContribution(USER_MENU_SLOT, {
				id: 'maretha.user.themes',
				order: 40,
				component: UserMenuRowComponent,
				inputs: { label: 'Themes', labelKey: 'app.user.themes', action: 'route', route: '/themes' },
				when: (context) => context.user !== null,
			}),
			defineContribution(USER_MENU_SLOT, {
				id: 'maretha.user.language',
				order: 50,
				component: UserMenuLanguageComponent,
				when: (context) => context.user !== null,
			}),
			defineContribution(USER_MENU_SLOT, {
				id: 'maretha.user.sign-out',
				order: 60,
				component: UserMenuRowComponent,
				inputs: { label: 'Sign Out', labelKey: 'app.user.signOut', action: 'sign-out' },
				when: (context) => context.user !== null,
			}),
		],
	});
}
