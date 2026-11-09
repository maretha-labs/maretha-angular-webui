import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
	ActivatedRouteSnapshot,
	CanActivateFn,
	RedirectCommand,
	Router,
	RouterStateSnapshot,
} from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthService } from './auth.service';
import { hasAdministrationAccess } from './administration-access';

/**
 * Administration routes wait for the signed-in user the application already holds. Without access,
 * the stock 403 error page opens while the address bar keeps the requested route, so it is named on
 * the page and a reload retries it.
 */
export const SettingsGuardService: CanActivateFn = (
	_route: ActivatedRouteSnapshot,
	state: RouterStateSnapshot,
) => {
	const router = inject(Router);
	const auth = inject(AuthService);

	return toObservable(auth.userInfo).pipe(
		filter((user) => user !== null),
		take(1),
		map((user) =>
			hasAdministrationAccess(user)
				? true
				: new RedirectCommand(router.createUrlTree(['/unauthorized']), {
						browserUrl: state.url,
					}),
		),
	);
};
