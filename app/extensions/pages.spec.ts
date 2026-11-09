import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { definePage, PageContext, WebUiPageComponent } from './pages';
import { ExtensionRegistry } from './extension-registry.service';
import { ViewNavigation } from './view-navigation';
@Component({ template: 'Client page {{context().params["id"]}}' })
class ClientPage {
	readonly context = input.required<PageContext>();
	readonly canDeactivate = jasmine.createSpy().and.resolveTo(false);
}
describe('Application page contributions', () => {
	it('renders route context, respects guards and hides removed pages', async () => {
		TestBed.configureTestingModule({ imports: [WebUiPageComponent] });
		const registry = TestBed.inject(ExtensionRegistry);
		registry.register({
			id: 'client.pages',
			contributions: [
				definePage({ id: 'client.reports', pageId: 'reports', component: ClientPage }),
			],
		});
		const fixture = TestBed.createComponent(WebUiPageComponent);
		fixture.componentRef.setInput('context', {
			pageId: 'reports',
			params: { id: 'one' },
			query: {},
			route: '/page/reports',
			document: null,
			noEdit: false,
		});
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Client page one');
		const page = fixture.debugElement.query(By.directive(ClientPage))
			.componentInstance as ClientPage;
		expect(await TestBed.inject(ViewNavigation).canNavigate('/dashboard', 1)).toBeFalse();
		expect(page.canDeactivate).toHaveBeenCalledWith({
			reason: 'navigation',
			nextViewId: null,
			nextUrl: '/dashboard',
		});
		registry.register({
			id: 'client.hide',
			overrides: [{ slot: 'PAGES', id: 'client.reports', disabled: true }],
		});
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('This page is unavailable');
	});
	it('fails closed for ambiguous page keys rather than rendering multiple application pages', async () => {
		TestBed.configureTestingModule({ imports: [WebUiPageComponent] });
		TestBed.inject(ExtensionRegistry).register({
			id: 'ambiguous',
			contributions: ['one', 'two'].map((id) =>
				definePage({ id, pageId: 'reports', component: ClientPage }),
			),
		});
		const fixture = TestBed.createComponent(WebUiPageComponent);
		fixture.componentRef.setInput('context', {
			pageId: 'reports',
			params: {},
			query: {},
			route: '/page/reports',
			document: null,
			noEdit: false,
		});
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.componentInstance.page()).toBeNull();
		expect(fixture.nativeElement.textContent).toContain('unavailable');
	});
});
