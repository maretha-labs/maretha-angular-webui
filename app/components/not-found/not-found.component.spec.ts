import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { NotFoundComponent } from './not-found.component';
import { UnauthorizedComponent } from '../unauthorized/unauthorized.component';

describe('NotFoundComponent', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				provideRouter([{ path: '**', component: NotFoundComponent }]),
			],
		});
	});

	const text = (root: HTMLElement, selector: string) =>
		root.querySelector(selector)?.textContent?.trim() ?? null;

	it('reports an unknown route, then a missing document named by the redirect, as stock nuxeo-error', async () => {
		const harness = await RouterTestingHarness.create();
		await harness.navigateByUrl('/nuxeo/oauth2/authorize?client_id=x#top', NotFoundComponent);
		const root = harness.routeNativeElement!;
		expect(root.querySelector('header.nx-not-found__header')).not.toBeNull();
		expect(text(root, '.nx-not-found__code')).toBe('404');
		expect(text(root, 'h1')).toBe('Not Found');
		expect(text(root, '.nx-not-found__address')).toBe('nuxeo/oauth2/authorize');
		expect(root.querySelector('.nx-not-found__message')).toBeNull();

		// The documents service keeps the address and names the document; the reused page must follow.
		await TestBed.inject(Router).navigate(['/not-found'], {
			skipLocationChange: true,
			state: { error: { document: '/default-domain/workspaces/missing' } },
		});
		harness.detectChanges();
		expect(text(root, '.nx-not-found__address')).toBe('/default-domain/workspaces/missing');
		expect(text(root, '.nx-not-found__message')).toBe('Could not load document.');
	});

	it('shows a document the user may not read as stock 403 Permission Denied, the address kept', async () => {
		const harness = await RouterTestingHarness.create();
		await harness.navigateByUrl('/default-domain/workspaces/private', NotFoundComponent);
		await TestBed.inject(Router).navigate(['/unauthorized'], {
			skipLocationChange: true,
			state: { error: { code: 403, document: '/default-domain/workspaces/private' } },
		});
		harness.detectChanges();
		const root = harness.routeNativeElement!;
		expect(text(root, '.nx-not-found__code')).toBe('403');
		expect(text(root, 'h1')).toBe('Permission Denied');
		expect(text(root, '.nx-not-found__address')).toBe('/default-domain/workspaces/private');
		expect(text(root, '.nx-not-found__message')).toBe('Could not load document.');
	});

	it('renders the unauthorized route as the same page at 403, naming the route', async () => {
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				provideRouter([{ path: '**', component: UnauthorizedComponent }]),
			],
		});
		const harness = await RouterTestingHarness.create();
		await harness.navigateByUrl('/settings?admin=users', UnauthorizedComponent);
		const root = harness.routeNativeElement!;
		expect(text(root, '.nx-not-found__code')).toBe('403');
		expect(text(root, 'h1')).toBe('Permission Denied');
		expect(text(root, '.nx-not-found__address')).toBe('settings');
		expect(root.querySelector('.nx-not-found__message')).toBeNull();
	});
});
