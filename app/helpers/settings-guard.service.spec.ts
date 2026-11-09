import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	ActivatedRouteSnapshot,
	RedirectCommand,
	Router,
	RouterStateSnapshot,
	UrlTree,
} from '@angular/router';
import { firstValueFrom, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { SettingsGuardService } from './settings-guard.service';

describe('SettingsGuardService', () => {
	let userInfo: ReturnType<typeof signal<any>>;
	let router: jasmine.SpyObj<Router>;
	let unauthorized: UrlTree;

	beforeEach(() => {
		userInfo = signal<any>(null);
		unauthorized = new UrlTree();
		router = jasmine.createSpyObj<Router>('Router', ['createUrlTree']);
		router.createUrlTree.and.returnValue(unauthorized);
		TestBed.configureTestingModule({
			providers: [
				{ provide: AuthService, useValue: { userInfo } },
				{ provide: Router, useValue: router },
			],
		});
	});

	const runGuard = () =>
		firstValueFrom(
			TestBed.runInInjectionContext(() =>
				SettingsGuardService(
					{} as ActivatedRouteSnapshot,
					{
						url: '/settings?admin=users',
					} as RouterStateSnapshot,
				),
			) as Observable<boolean | RedirectCommand>,
		);

	it('allows the signed-in administrator without another identity request', async () => {
		userInfo.set({ id: 'Administrator', isAdministrator: true });
		expect(await runGuard()).toBe(true);
		expect(router.createUrlTree).not.toHaveBeenCalled();
	});

	it('allows a power user', async () => {
		userInfo.set({ id: 'power', isAdministrator: false, groups: [{ id: 'powerusers' }] });
		expect(await runGuard()).toBeTrue();
	});

	it('opens the 403 page for a signed-in non-administrator and keeps the requested address', async () => {
		userInfo.set({ id: 'member', isAdministrator: false, groups: [] });
		const result = (await runGuard()) as RedirectCommand;
		expect(result).toEqual(jasmine.any(RedirectCommand));
		expect(result.redirectTo).toBe(unauthorized);
		expect(result.navigationBehaviorOptions?.browserUrl).toBe('/settings?admin=users');
		expect(router.createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
	});

	it('waits for the signed-in user before deciding', async () => {
		const result = runGuard();
		await Promise.resolve();
		expect(router.createUrlTree).not.toHaveBeenCalled();
		userInfo.set({ id: 'Administrator', isAdministrator: true });
		expect(await result).toBeTrue();
	});
});
