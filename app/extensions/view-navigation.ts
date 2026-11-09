import { inject, Injectable } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export interface ViewDeparture {
	readonly reason: 'tab' | 'navigation';
	readonly nextViewId: string | null;
	readonly nextUrl?: string;
}

export interface GuardedView {
	canDeactivate(departure: ViewDeparture): boolean | Promise<boolean>;
	hasPendingChanges?(): boolean;
}

@Injectable({ providedIn: 'root' })
export class ViewNavigation {
	private readonly guards = new Set<(url: string) => Promise<boolean>>();
	private lastNavigation?: { id: number; result: Promise<boolean> };

	register(guard: (url: string) => Promise<boolean>): () => void {
		this.guards.add(guard);
		return () => this.guards.delete(guard);
	}

	canNavigate(url: string, navigationId: number): Promise<boolean> {
		if (this.lastNavigation?.id === navigationId) return this.lastNavigation.result;
		const result = this.check(url);
		this.lastNavigation = { id: navigationId, result };
		return result;
	}

	/** Check a departure outside the Angular router, such as explicit sign out. */
	canLeave(url: string): Promise<boolean> {
		return this.check(url);
	}

	private async check(url: string): Promise<boolean> {
		for (const guard of [...this.guards]) {
			try {
				if (!(await guard(url))) return false;
			} catch {
				return false;
			}
		}
		return true;
	}
}

export const documentViewsNavigationGuard: CanActivateFn = (_route, state) => {
	const router = inject(Router);
	return inject(ViewNavigation).canNavigate(state.url, router.currentNavigation()?.id ?? -1);
};
