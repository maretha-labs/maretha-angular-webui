import { DOCUMENT } from '@angular/common';
import { createEnvironmentInjector, EnvironmentInjector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import {
	DrawerWidthPreferences,
	MAX_DRAWER_WIDTH,
	MIN_DRAWER_WIDTH,
} from './drawer-width-preferences.service';
import { SidebarService } from './sidebar.service';
import { AUTH_STORAGE_SCOPE } from './token.service';

describe('DrawerWidthPreferences', () => {
	const baseURI = 'https://drawer-width.test/nuxeo/ng/';
	let values: Map<string, string>;
	let storage: jasmine.SpyObj<Storage>;
	let view: EventTarget;
	let storageAvailable: boolean;
	let injectors: EnvironmentInjector[];
	let user: ReturnType<typeof signal<{ id: string } | null>>;
	let drawer: ReturnType<typeof signal<string | null>>;
	let open: ReturnType<typeof signal<boolean>>;
	let preferences: DrawerWidthPreferences;

	function createService(
		appBase = baseURI,
		defaultView: EventTarget | null = view,
		backendScope = 'backend-one',
	) {
		const injector = createEnvironmentInjector(
			[
				DrawerWidthPreferences,
				{ provide: AuthService, useValue: { userInfo: user } },
				{ provide: SidebarService, useValue: { activeTab: drawer, drawerOpen: open } },
				{ provide: AUTH_STORAGE_SCOPE, useValue: backendScope },
				{ provide: DOCUMENT, useValue: { baseURI: appBase, defaultView } },
			],
			TestBed.inject(EnvironmentInjector),
		);
		injectors.push(injector);
		return injector.get(DrawerWidthPreferences);
	}

	function changed(key: string | null): void {
		view.dispatchEvent(new StorageEvent('storage', { key }));
	}

	beforeEach(() => {
		TestBed.configureTestingModule({});
		values = new Map();
		storage = jasmine.createSpyObj<Storage>('drawer storage', ['getItem', 'setItem', 'removeItem']);
		storage.getItem.and.callFake((key) => values.get(key) ?? null);
		storage.setItem.and.callFake((key, value) => values.set(key, value));
		storage.removeItem.and.callFake((key) => values.delete(key));
		view = new EventTarget();
		storageAvailable = true;
		Object.defineProperty(view, 'localStorage', {
			get: () => {
				if (!storageAvailable) throw new DOMException('Storage blocked', 'SecurityError');
				return storage;
			},
		});
		injectors = [];
		user = signal<{ id: string } | null>({ id: 'first' });
		drawer = signal<string | null>('tree');
		open = signal(true);
		preferences = createService();
	});

	afterEach(() => {
		for (const injector of injectors) injector.destroy();
	});

	it('uses existing defaults until a valid preference is saved', () => {
		expect(preferences.preferredWidth()).toBeNull();
		expect(preferences.preferredWidthCss()).toBeNull();
		expect(preferences.resizing()).toBeFalse();
		expect(JSON.parse(preferences.scope()!)).toEqual([baseURI, 'backend-one', 'first', 'tree']);
		expect(storage.setItem).not.toHaveBeenCalled();
	});

	it('saves both width boundaries as integer pixels', () => {
		preferences.saveWidth(MIN_DRAWER_WIDTH);
		expect(preferences.preferredWidth()).toBe(200);
		expect(preferences.preferredWidthCss()).toBe('200px');
		preferences.saveWidth(MAX_DRAWER_WIDTH);
		expect(preferences.preferredWidth()).toBe(640);
		expect([...values.values()]).toEqual(['640']);
	});

	it('restores the saved width in a new service instance after a reload', () => {
		preferences.saveWidth(420);
		const reloaded = createService();
		expect(reloaded.preferredWidth()).toBe(420);
		expect(reloaded.preferredWidthCss()).toBe('420px');
	});

	it('keeps Browse, Search, account and contributed drawer preferences independent', () => {
		preferences.saveWidth(240);
		for (const [id, width] of [
			['search', 380],
			['account', 320],
			['customer:custom/drawer', 460],
		] as const) {
			drawer.set(id);
			expect(preferences.preferredWidth()).toBeNull();
			preferences.saveWidth(width);
		}
		for (const [id, width] of [
			['tree', 240],
			['search', 380],
			['account', 320],
			['customer:custom/drawer', 460],
		] as const) {
			drawer.set(id);
			expect(preferences.preferredWidth()).toBe(width);
		}
	});

	it('isolates accounts and never persists an anonymous or absent drawer scope', () => {
		preferences.saveWidth(300);
		user.set({ id: 'second' });
		expect(preferences.preferredWidth()).toBeNull();
		preferences.saveWidth(400);
		user.set(null);
		expect(preferences.scope()).toBeNull();
		preferences.previewWidth(500);
		preferences.saveWidth(500);
		preferences.resetWidth();
		expect(preferences.preferredWidth()).toBeNull();
		expect(preferences.resizing()).toBeFalse();
		user.set({ id: 'first' });
		expect(preferences.preferredWidth()).toBe(300);
		drawer.set(null);
		expect(preferences.scope()).toBeNull();
		preferences.saveWidth(500);
		expect(values.size).toBe(2);
		user.set({ id: 'second' });
		drawer.set('tree');
		expect(preferences.preferredWidth()).toBe(400);
	});

	it('separates applications served under different base paths on the same origin', () => {
		preferences.saveWidth(300);
		const otherApp = createService('https://drawer-width.test/other/ng/');
		expect(otherApp.preferredWidth()).toBeNull();
		otherApp.saveWidth(400);
		expect(preferences.preferredWidth()).toBe(300);
		expect(otherApp.preferredWidth()).toBe(400);
	});

	it('isolates backend connections using the public authentication application scope', () => {
		preferences.saveWidth(300);
		const otherBackend = createService(baseURI, view, 'backend-two');
		expect(otherBackend.preferredWidth()).toBeNull();
		otherBackend.saveWidth(400);
		expect(preferences.preferredWidth()).toBe(300);
		expect(otherBackend.preferredWidth()).toBe(400);
	});

	it('previews without writing, cancels to the saved width and commits the final width', () => {
		preferences.saveWidth(300);
		storage.setItem.calls.reset();
		preferences.previewWidth(410);
		expect(preferences.resizing()).toBeTrue();
		expect(preferences.preferredWidth()).toBe(410);
		expect(preferences.preferredWidthCss()).toBe('410px');
		expect(storage.setItem).not.toHaveBeenCalled();
		preferences.cancelPreview();
		expect(preferences.resizing()).toBeFalse();
		expect(preferences.preferredWidth()).toBe(300);
		preferences.previewWidth(450);
		preferences.saveWidth(450);
		expect(preferences.resizing()).toBeFalse();
		expect(preferences.preferredWidth()).toBe(450);
		expect(storage.setItem.calls.count()).toBe(1);
	});

	it('discards drafts when the drawer closes and preserves the saved desktop choice', () => {
		preferences.saveWidth(600);
		preferences.previewWidth(430);
		expect(preferences.preferredWidth()).toBe(430);
		open.set(false);
		expect(preferences.resizing()).toBeFalse();
		expect(preferences.preferredWidth()).toBe(600);
		preferences.previewWidth(500);
		preferences.saveWidth(500);
		open.set(true);
		expect(preferences.preferredWidth()).toBe(600);
		expect(preferences.resizing()).toBeFalse();
	});

	it('discards drafts when changing drawers or identities', () => {
		preferences.saveWidth(300);
		preferences.previewWidth(450);
		drawer.set('search');
		expect(preferences.resizing()).toBeFalse();
		expect(preferences.preferredWidth()).toBeNull();
		drawer.set('tree');
		expect(preferences.preferredWidth()).toBe(300);
		preferences.previewWidth(500);
		user.set({ id: 'second' });
		expect(preferences.resizing()).toBeFalse();
		expect(preferences.preferredWidth()).toBeNull();
		user.set({ id: 'first' });
		expect(preferences.preferredWidth()).toBe(300);
	});

	it('ignores nonfinite, fractional and out-of-range changes', () => {
		preferences.saveWidth(300);
		storage.setItem.calls.reset();
		for (const width of [NaN, Infinity, -Infinity, -1, 199, 641, 201.5]) {
			preferences.previewWidth(width);
			preferences.saveWidth(width);
			expect(preferences.preferredWidth()).toBe(300);
			expect(preferences.resizing()).toBeFalse();
		}
		expect(storage.setItem).not.toHaveBeenCalled();
	});

	it('rejects malformed and untrusted stored values instead of coercing them', () => {
		preferences.saveWidth(300);
		const key = [...values.keys()][0];
		for (const stored of [
			'broken',
			'null',
			'true',
			'"320"',
			'{}',
			'[320]',
			'199',
			'641',
			'201.5',
		]) {
			values.set(key, stored);
			changed(key);
			expect(preferences.preferredWidth()).toBeNull();
		}
	});

	it('keeps a session fallback if storage methods fail', () => {
		storage.getItem.and.throwError('Read blocked');
		storage.setItem.and.throwError('Write blocked');
		storage.removeItem.and.throwError('Remove blocked');
		expect(preferences.preferredWidth()).toBeNull();
		preferences.saveWidth(450);
		expect(preferences.preferredWidth()).toBe(450);
		drawer.set('search');
		preferences.saveWidth(360);
		drawer.set('tree');
		expect(preferences.preferredWidth()).toBe(450);
		preferences.resetWidth();
		expect(preferences.preferredWidth()).toBeNull();
		drawer.set('search');
		expect(preferences.preferredWidth()).toBe(360);
	});

	it('keeps resizing usable if obtaining localStorage throws a security error', () => {
		storageAvailable = false;
		expect(preferences.preferredWidth()).toBeNull();
		preferences.previewWidth(400);
		preferences.saveWidth(400);
		expect(preferences.preferredWidth()).toBe(400);
		expect(preferences.resizing()).toBeFalse();
		preferences.resetWidth();
		expect(preferences.preferredWidth()).toBeNull();
	});

	it('resets only the current drawer and leaves other accounts and state intact', () => {
		values.set('unrelated-setting', 'keep');
		preferences.saveWidth(300);
		drawer.set('search');
		preferences.saveWidth(400);
		user.set({ id: 'second' });
		preferences.saveWidth(500);
		user.set({ id: 'first' });
		preferences.previewWidth(550);
		preferences.resetWidth();
		expect(preferences.preferredWidth()).toBeNull();
		expect(preferences.resizing()).toBeFalse();
		drawer.set('tree');
		expect(preferences.preferredWidth()).toBe(300);
		user.set({ id: 'second' });
		drawer.set('search');
		expect(preferences.preferredWidth()).toBe(500);
		expect(values.get('unrelated-setting')).toBe('keep');
		expect(storage.removeItem.calls.count()).toBe(1);
	});

	it('caches reads until a matching storage change or browser clear event', () => {
		preferences.saveWidth(300);
		const key = [...values.keys()][0];
		const reloaded = createService();
		expect(reloaded.preferredWidth()).toBe(300);
		const reads = storage.getItem.calls.count();
		drawer.set('search');
		expect(reloaded.preferredWidth()).toBeNull();
		drawer.set('tree');
		expect(reloaded.preferredWidth()).toBe(300);
		expect(storage.getItem.calls.count()).toBe(reads + 1);
		values.set(key, '420');
		changed('unrelated-setting');
		expect(reloaded.preferredWidth()).toBe(300);
		changed(key);
		expect(reloaded.preferredWidth()).toBe(420);
		values.delete(key);
		changed(null);
		expect(reloaded.preferredWidth()).toBeNull();
	});

	it('does not invalidate local preferences for a sessionStorage event', () => {
		preferences.saveWidth(300);
		const key = [...values.keys()][0];
		values.set(key, '420');
		view.dispatchEvent(new StorageEvent('storage', { key, storageArea: window.sessionStorage }));
		expect(preferences.preferredWidth()).toBe(300);
	});

	it('removes the storage listener on destruction', () => {
		const remove = spyOn(view, 'removeEventListener').and.callThrough();
		injectors[0].destroy();
		injectors.shift();
		expect(remove).toHaveBeenCalledWith('storage', jasmine.any(Function));
	});

	it('keeps session preferences when no browser window is available', () => {
		const noWindow = createService(baseURI, null);
		expect(noWindow.preferredWidth()).toBeNull();
		noWindow.saveWidth(400);
		expect(noWindow.preferredWidth()).toBe(400);
		noWindow.resetWidth();
		expect(noWindow.preferredWidth()).toBeNull();
	});
});
