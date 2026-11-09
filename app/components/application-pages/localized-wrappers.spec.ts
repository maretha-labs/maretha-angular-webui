import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
	AdministrationContext,
	DocumentViewsComponent,
	WebUiMessages,
	WebUiThemes,
} from '@maretha/webui-sdk';
import { ThemesPageComponent } from './themes-page.component';
import { provideDefaultThemes } from 'app/modules/shared/components/sidebar/user-menu/default-themes';
import { AnalyticsWorkspaceComponent } from 'app/modules/settings/components/analytics/analytics-workspace.component';

@Component({ selector: 'nx-paired-views', template: '' })
class PairedViewsProbe {
	readonly itemSlot = input('');
	readonly pageSlot = input('');
	readonly label = input('');
	readonly context = input<AdministrationContext>();
}

describe('Localized application wrappers', () => {
	let savedTheme: string | null;
	beforeEach(() => {
		savedTheme = localStorage.getItem('maretha.webui.theme');
	});
	afterEach(() => {
		if (savedTheme === null) localStorage.removeItem('maretha.webui.theme');
		else localStorage.setItem('maretha.webui.theme', savedTheme);
	});
	it('changes theme heading and built-in labels while retaining the selected theme identity', () => {
		TestBed.configureTestingModule({
			imports: [ThemesPageComponent],
			providers: [provideDefaultThemes()],
		});
		const messages = TestBed.inject(WebUiMessages);
		messages.register('theme-test', {
			fr: { 'app.components.themes-page.themes-08df78': 'Thèmes', 'themes.dark': 'Sombre' },
		});
		const fixture = TestBed.createComponent(ThemesPageComponent);
		fixture.detectChanges();
		const card = Array.from(
			fixture.nativeElement.querySelectorAll('nx-theme-choice') as NodeListOf<HTMLElement>,
		).find((element) => element.querySelector('strong')?.textContent?.trim() === 'Dark')!;
		const dark = card.querySelector('button')!;

		expect(dark).toBeTruthy();
		dark.click();
		fixture.detectChanges();
		expect(TestBed.inject(WebUiThemes).selected()?.id).toBe('maretha.theme.dark');
		messages.locale.set('fr');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Thèmes');
		expect(card.querySelector('strong')?.textContent?.trim()).toBe('Sombre');
		expect(dark.disabled).toBeTrue();
		expect(dark.textContent?.trim()).toBe('Current');
		expect(card.querySelector('img')?.getAttribute('src')).toBe('assets/themes/dark-preview.jpg');
		expect(dark.getAttribute('aria-pressed')).toBe('true');
		expect(TestBed.inject(WebUiThemes).selected()?.id).toBe('maretha.theme.dark');
	});
	it('preserves administration context and analytics slot pairing while changing its accessible label', () => {
		TestBed.configureTestingModule({ imports: [AnalyticsWorkspaceComponent] });
		TestBed.overrideComponent(AnalyticsWorkspaceComponent, {
			remove: { imports: [DocumentViewsComponent] },
			add: { imports: [PairedViewsProbe] },
		});
		const messages = TestBed.inject(WebUiMessages);
		messages.register('analytics-test', {
			fr: { 'app.modules.analytics-workspace.analytics-views-a2f7e3': 'Vues analytiques' },
		});
		const fixture = TestBed.createComponent(AnalyticsWorkspaceComponent);
		const context: AdministrationContext = {
			document: null,
			noEdit: false,
			user: { id: 'customer', displayName: 'customer', isAdministrator: true, groups: [] },
			features: { retention: false },
		};
		fixture.componentRef.setInput('context', context);
		fixture.detectChanges();
		const host = fixture.debugElement.query(By.directive(PairedViewsProbe))
			.componentInstance as PairedViewsProbe;
		expect(host.itemSlot()).toBe('ANALYTICS_ITEMS');
		expect(host.pageSlot()).toBe('ANALYTICS_PAGES');
		expect(host.context()).toBe(context);
		expect(host.label()).toBe('Analytics views');
		messages.locale.set('fr');
		fixture.detectChanges();
		expect(host.label()).toBe('Vues analytiques');
		expect(host.context()).toBe(context);
	});
});
