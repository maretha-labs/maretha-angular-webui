import { Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';

export type SidebarTab = string;

@Injectable({
	providedIn: 'root',
})
export class SidebarService {
	private readonly _drawerOpen = signal(false);
	private readonly _activeTab = signal<SidebarTab | null>(null);

	readonly administrationNavigationRequest = signal(0);

	openAdministrationNavigation(): void {
		this.closeDrawer();
		this.administrationNavigationRequest.update((value) => value + 1);
	}

	readonly drawerOpen = this._drawerOpen.asReadonly();
	readonly activeTab = this._activeTab.asReadonly();
	readonly drawerOpen$ = toObservable(this._drawerOpen);
	readonly activeTab$ = toObservable(this._activeTab);

	// --------------------------------------------------------------------------------------------------
	toggleDrawer(tab: SidebarTab) {
		if (this._activeTab() === tab && this._drawerOpen()) {
			this.closeDrawer();
		} else {
			this._activeTab.set(tab);
			this._drawerOpen.set(true);
		}
	}

	// --------------------------------------------------------------------------------------------------
	closeDrawer() {
		this._drawerOpen.set(false);
	}

	// --------------------------------------------------------------------------------------------------
	selectTab(tab: SidebarTab) {
		this._activeTab.set(tab);

		if (!this._drawerOpen()) this._drawerOpen.set(true);
	}
}
