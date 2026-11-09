import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ExtensionRegistry } from '@maretha/webui-sdk';
import { AuthService } from 'app/helpers/auth.service';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ApplicationPageComponent } from './application-page.component';

describe('ApplicationPageComponent', () => {
	it('opens the stock 404 error page for a page id no contribution answers', async () => {
		const resolve = jasmine.createSpy('resolve').and.returnValue({ items: [] });
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				provideRouter([{ path: 'page/:pageId', component: ApplicationPageComponent }]),
				{ provide: AuthService, useValue: { userInfo: signal({ id: 'member', groups: [] }) } },
				{ provide: ExtensionRegistry, useValue: { resolve } },
			],
		});
		const harness = await RouterTestingHarness.create();
		await harness.navigateByUrl('/page/missing-page');
		const root = harness.routeNativeElement!;
		expect(resolve).toHaveBeenCalledWith(
			'PAGES',
			jasmine.objectContaining({ pageId: 'missing-page' }),
		);
		expect(root.querySelector('nx-webui-page')).toBeNull();
		expect(root.querySelector('nx-not-found .nx-not-found__code')?.textContent?.trim()).toBe('404');
		expect(root.querySelector('nx-not-found h1')?.textContent?.trim()).toBe('Not Found');
		expect(root.querySelector('.nx-not-found__address')?.textContent?.trim()).toBe(
			'page/missing-page',
		);
	});
});
