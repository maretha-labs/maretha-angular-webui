import { Component, Renderer2, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { ShellActionsComponent } from './components/quick-search/shell-actions.component';
import { WebUiLocale, WebUiMessagePipe } from '@maretha/webui-sdk';
import { WebUiTranslationBridge } from './helpers/webui-translation-bridge.service';
import { ToastContainerComponent } from './components/toasts/toast-container.component';
import { AuthService } from './helpers/auth.service';
import { SidebarService } from './helpers/sidebar.service';
import { DrawerWidthPreferences } from './helpers/drawer-width-preferences.service';
import { SidebarComponent } from './modules/shared/components/sidebar/sidebar.component';
import { NgProgressbar } from 'ngx-progressbar';
import { NgProgressHttp } from 'ngx-progressbar/http';
import { NgProgressRouter } from 'ngx-progressbar/router';
import { RouterOutlet } from '@angular/router';

@Component({
	selector: 'nx-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
	host: {
		'[class.browse-drawer]': "activeTab() === 'tree'",
		'[class.drawer-resizing]': 'drawerWidths.resizing()',
		'[style.--nx-user-drawer-width]': 'drawerWidths.preferredWidthCss()',
	},
	imports: [
		SidebarComponent,
		WebUiMessagePipe,
		ShellActionsComponent,
		NgProgressbar,
		NgProgressHttp,
		NgProgressRouter,
		RouterOutlet,
		ToastContainerComponent,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
	private readonly locale = inject(WebUiLocale);
	private readonly translations = inject(WebUiTranslationBridge);

	readonly drawerOpen = this.sidebarService.drawerOpen;
	readonly activeTab = this.sidebarService.activeTab;
	readonly drawerWidths = inject(DrawerWidthPreferences);

	constructor(
		private readonly authService: AuthService,
		private readonly sidebarService: SidebarService,
		private readonly renderer: Renderer2,
	) {
		this.configureLocale();
	}

	// --------------------------------------------------------------------------------------------------
	private configureLocale() {
		this.translations.initialize();
		effect(() => this.setLanguage(this.locale.locale()));
	}

	// --------------------------------------------------------------------------------------------------
	private setLanguage(language: string) {
		const html = document.getElementsByTagName('html')[0];
		if (language === 'ar') {
			this.renderer.setAttribute(html, 'dir', 'rtl');
			this.renderer.setAttribute(html, 'lang', language);

			const node =
				(document.getElementById('bootstrap_rtl') as HTMLLinkElement | null) ??
				document.createElement('link');
			node.id = 'bootstrap_rtl';
			node.rel = 'stylesheet';
			node.href = new URL('assets/styles/bootstrap.rtl.min.css', document.baseURI).href;

			if (!node.isConnected) document.head.appendChild(node);
		} else {
			this.renderer.setAttribute(html, 'dir', 'ltr');
			this.renderer.setAttribute(html, 'lang', language);

			const rtlStylesheet = document.head.querySelector('#bootstrap_rtl');
			if (rtlStylesheet) document.head.removeChild(rtlStylesheet);
		}
	}
}
