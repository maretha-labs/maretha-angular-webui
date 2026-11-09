import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, linkedSignal, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SidebarService } from './sidebar.service';
import { AUTH_STORAGE_SCOPE } from './token.service';

export const MIN_DRAWER_WIDTH = 200;
export const MAX_DRAWER_WIDTH = 640;

const STORAGE_PREFIX = 'maretha.drawer-width.v1:';

function validWidth(value: unknown): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= MIN_DRAWER_WIDTH &&
		value <= MAX_DRAWER_WIDTH
	);
}

/** Browser preferences are independent for each Angular application, user and drawer. */
@Injectable({ providedIn: 'root' })
export class DrawerWidthPreferences {
	private readonly document = inject(DOCUMENT);
	private readonly applicationScope = inject(AUTH_STORAGE_SCOPE);
	private readonly auth = inject(AuthService);
	private readonly sidebar = inject(SidebarService);
	private readonly cache = new Map<string, number | null>();
	private readonly revision = signal(0);

	readonly scope = computed(() => {
		const user = this.auth.userInfo()?.id;
		const drawer = this.sidebar.activeTab();
		return user && drawer
			? JSON.stringify([this.document.baseURI, this.applicationScope, user, drawer])
			: null;
	});

	private readonly openScope = computed(() => (this.sidebar.drawerOpen() ? this.scope() : null));
	private readonly draftWidth = linkedSignal<number | null>(() => {
		this.openScope();
		return null;
	});

	readonly preferredWidth = computed(() => {
		const scope = this.scope();
		if (!scope) return null;
		const draft = this.draftWidth();
		if (this.openScope() === scope && draft !== null) return draft;
		this.revision();
		return this.read(scope);
	});
	readonly preferredWidthCss = computed(() => {
		const width = this.preferredWidth();
		return width === null ? null : `${width}px`;
	});
	readonly resizing = computed(() => this.openScope() !== null && this.draftWidth() !== null);

	constructor() {
		const view = this.document.defaultView;
		if (!view) return;
		const changed = (event: StorageEvent) => {
			if (event.key !== null && !event.key.startsWith(STORAGE_PREFIX)) return;
			if (event.storageArea && event.storageArea !== this.storage()) return;
			if (event.key === null) this.cache.clear();
			else this.cache.delete(event.key);
			this.revision.update((value) => value + 1);
		};
		view.addEventListener('storage', changed);
		inject(DestroyRef).onDestroy(() => view.removeEventListener('storage', changed));
	}

	previewWidth(width: number): void {
		if (this.openScope() && validWidth(width)) this.draftWidth.set(width);
	}

	saveWidth(width: number): void {
		const scope = this.openScope();
		if (!scope || !validWidth(width)) return;
		const key = STORAGE_PREFIX + scope;
		this.cache.set(key, width);
		try {
			this.storage()?.setItem(key, JSON.stringify(width));
		} catch {
			// Keep the preference for this session when browser storage is unavailable.
		}
		this.draftWidth.set(null);
		this.revision.update((value) => value + 1);
	}

	cancelPreview(): void {
		this.draftWidth.set(null);
	}

	resetWidth(): void {
		const scope = this.openScope();
		if (!scope) return;
		const key = STORAGE_PREFIX + scope;
		this.cache.set(key, null);
		try {
			this.storage()?.removeItem(key);
		} catch {
			// Reset remains effective for this session if storage cannot be changed.
		}
		this.draftWidth.set(null);
		this.revision.update((value) => value + 1);
	}

	private read(scope: string): number | null {
		const key = STORAGE_PREFIX + scope;
		if (this.cache.has(key)) return this.cache.get(key)!;
		let width: number | null = null;
		try {
			const stored: unknown = JSON.parse(this.storage()?.getItem(key) ?? 'null');
			if (validWidth(stored)) width = stored;
		} catch {
			// Invalid preferences and unavailable storage use the drawer's default width.
		}
		this.cache.set(key, width);
		return width;
	}

	private storage(): Storage | null {
		try {
			return this.document.defaultView?.localStorage ?? null;
		} catch {
			return null;
		}
	}
}
