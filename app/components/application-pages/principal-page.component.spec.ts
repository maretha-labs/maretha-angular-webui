import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PrincipalPageComponent } from './principal-page.component';
describe('Principal result pages', () => {
	it('discards stale profiles, shows only named public fields and reports inaccessible principals', () => {
		TestBed.configureTestingModule({
			imports: [PrincipalPageComponent],
			providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
		});
		const fixture = TestBed.createComponent(PrincipalPageComponent);
		const http = TestBed.inject(HttpTestingController);
		const context = {
			pageId: 'user',
			query: { id: 'first' },
			params: {},
			user: { id: 'session' },
			route: '',
			locale: 'en-US',
			document: null,
			noEdit: false,
		};
		fixture.componentRef.setInput('context', context);
		fixture.detectChanges();
		const old = http.expectOne((r) => r.url.endsWith('/user/first'));
		fixture.componentRef.setInput('context', { ...context, query: { id: 'second' } });
		fixture.detectChanges();
		expect(old.cancelled).toBeTrue();
		http
			.expectOne((r) => r.url.endsWith('/user/second'))
			.flush({
				id: 'second',
				properties: { firstName: 'Second', email: 'test@example.test', password: 'never-render' },
				extendedGroups: [{ name: 'members' }],
			});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Second');
		expect(fixture.nativeElement.textContent).not.toContain('never-render');
		fixture.componentRef.setInput('context', {
			...context,
			pageId: 'group',
			query: { id: 'denied' },
		});
		fixture.detectChanges();
		http
			.expectOne((r) => r.url.endsWith('/group/denied'))
			.flush({}, { status: 403, statusText: 'Forbidden' });
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('permission');
		expect(fixture.nativeElement.textContent).not.toContain('test@example.test');
		http.verify();
	});
});
