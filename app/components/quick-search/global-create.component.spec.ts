import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from 'app/helpers/auth.service';
import { documentUrl } from 'app/helpers/document-route';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ExtensionRegistry, ShellActionContext } from '@maretha/webui-sdk';
import {
	CreationDestination,
	CreationParentService,
} from 'app/modules/explorer/helpers/creation-parent.service';
import { LayoutService } from 'app/modules/explorer/helpers/layout.service';
import { GlobalCreateComponent } from './global-create.component';
import { DestinationCreateDialogComponent } from './destination-create-dialog.component';
import { provideDefaultShellActions } from './default-shell-actions';

describe('Global create behavior', () => {
	const folder = {
		uid: 'folder',
		path: '/Work/Folder',
		repository: 'secondary',
		facets: ['Folderish'],
	};
	const context = (
		document: any = folder,
		route = document ? documentUrl(document) : '/dashboard',
	): ShellActionContext => ({
		user: { id: 'user', displayName: 'User', isAdministrator: false, groups: [] },
		locale: 'en-US',
		route,
		document,
		navigate: () => Promise.resolve(true),
	});
	let fixture: ComponentFixture<GlobalCreateComponent>;
	let component: GlobalCreateComponent;
	let hidden: Subject<void>;
	let parentResults: Subject<CreationDestination>;
	let load: jasmine.Spy;
	let show: jasmine.Spy;
	let modalCount: jasmine.Spy;
	const placement = signal('floating');
	const user = signal<any>({ id: 'user' });
	beforeEach(() => {
		hidden = new Subject<void>();
		parentResults = new Subject<CreationDestination>();
		load = jasmine.createSpy('load').and.returnValue(parentResults);
		show = jasmine.createSpy('show').and.returnValue({ onHidden: hidden });
		modalCount = jasmine.createSpy('getModalsCount').and.returnValue(0);
		placement.set('floating');
		user.set({ id: 'user' });
		TestBed.configureTestingModule({
			imports: [GlobalCreateComponent],
			providers: [
				provideDefaultShellActions(),
				{ provide: AuthService, useValue: { userInfo: user } },
				{ provide: LayoutService, useValue: { createButtonPlacement: placement } },
				{ provide: CreationParentService, useValue: { load } },
				{ provide: BsModalService, useValue: { show, getModalsCount: modalCount } },
			],
		}).overrideComponent(GlobalCreateComponent, { set: { template: '' } });
		fixture = TestBed.createComponent(GlobalCreateComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('context', context(null));
		fixture.detectChanges();
	});
	function press(target: HTMLElement, options: KeyboardEventInit = {}): KeyboardEvent {
		document.body.appendChild(target);
		const event = new KeyboardEvent('keydown', {
			key: 'c',
			bubbles: true,
			cancelable: true,
			...options,
		});
		target.dispatchEvent(event);
		target.remove();
		return event;
	}
	function retainFolder(): void {
		fixture.componentRef.setInput('context', context());
		fixture.detectChanges();
	}
	it('retains the valid folder and file parent when Dashboard clears the current document', () => {
		retainFolder();
		expect(component.path()).toBe('/Work/Folder');
		fixture.componentRef.setInput('context', context(null, '/dashboard'));
		fixture.detectChanges();
		component.open();
		expect(show.calls.mostRecent().args[1].initialState).toEqual(
			jasmine.objectContaining({ initialPath: '/Work/Folder', repository: 'secondary' }),
		);
		hidden.next();
		fixture.componentRef.setInput(
			'context',
			context({ ...folder, path: '/Other/Note', facets: [] }),
		);
		fixture.detectChanges();
		fixture.componentRef.setInput('context', context(null, '/dashboard'));
		fixture.detectChanges();
		expect(component.path()).toBe('/Other');
		component.loadShortcuts();
		expect(load).toHaveBeenCalledOnceWith('/Other', 'secondary');
	});
	it('retains the destination across contribution destruction but clears it on a user change', () => {
		retainFolder();
		fixture.destroy();
		fixture = TestBed.createComponent(GlobalCreateComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('context', context(null, '/dashboard'));
		fixture.detectChanges();
		expect(component.path()).toBe('/Work/Folder');
		user.set({ id: 'another' });
		fixture.componentRef.setInput('context', {
			...context(null, '/dashboard'),
			user: { ...context().user!, id: 'another' },
		});
		fixture.detectChanges();
		expect(component.path()).toBe('/');
		expect(component.repository()).toBe('default');
		component.loadShortcuts();
		expect(load).not.toHaveBeenCalled();
		// A delayed old document on a non-document route cannot repopulate the new user's cache.
		fixture.componentRef.setInput('context', {
			...context(folder, '/dashboard'),
			user: { ...context().user!, id: 'another' },
		});
		fixture.detectChanges();
		expect(component.path()).toBe('/');
	});
	it('does not learn destinations from mismatched document routes or stale prior-user documents', () => {
		retainFolder();
		fixture.componentRef.setInput(
			'context',
			context({ ...folder, path: '/Unrelated' }, '/dashboard'),
		);
		fixture.detectChanges();
		expect(component.path()).toBe('/Work/Folder');
		user.set({ id: 'another' });
		fixture.componentRef.setInput('context', {
			...context(folder),
			user: { ...context().user!, id: 'another' },
		});
		fixture.detectChanges();
		expect(component.path()).toBe('/');
		fixture.componentRef.setInput('context', {
			...context({ ...folder, path: '/Fresh' }),
			user: { ...context().user!, id: 'another' },
		});
		fixture.detectChanges();
		expect(component.path()).toBe('/Fresh');
	});
	it('passes the destination repository and requested mode while preventing duplicate dialogs until hidden', () => {
		retainFolder();
		component.open('Note', true, 'import');
		expect(show).toHaveBeenCalledOnceWith(
			DestinationCreateDialogComponent,
			jasmine.objectContaining({
				ignoreBackdropClick: true,
				keyboard: false,
				initialState: {
					initialPath: '/Work/Folder',
					repository: 'secondary',
					initialType: 'Note',
					initialBulk: true,
					initialView: 'import',
				},
			}),
		);
		component.open();
		component.loadShortcuts();
		expect(show).toHaveBeenCalledTimes(1);
		expect(load).not.toHaveBeenCalled();
		hidden.next();
		component.open();
		expect(show).toHaveBeenCalledTimes(2);
	});
	it('passes the repository to shortcut lookup and cancels stale results when only the repository changes', () => {
		retainFolder();
		component.loadShortcuts();
		expect(load).toHaveBeenCalledOnceWith('/Work/Folder', 'secondary');
		expect(parentResults.observed).toBeTrue();
		fixture.componentRef.setInput('context', context({ ...folder, repository: 'another' }));
		fixture.detectChanges();
		expect(parentResults.observed).toBeFalse();
		expect(component.shortcuts()).toBeFalse();
		expect(component.shortcutContext()).toBeNull();
		parentResults.next({ document: folder, types: [], allowed: true });
		expect(component.shortcutContext()).toBeNull();
		const next = new Subject<CreationDestination>();
		load.and.returnValue(next);
		component.loadShortcuts();
		expect(load.calls.mostRecent().args).toEqual(['/Work/Folder', 'another']);
		next.next({ document: { ...folder, repository: 'another' }, types: [], allowed: true });
		expect(component.shortcutContext()?.document?.['repository']).toBe('another');
		component.shortcutContext()?.importFiles();
		expect(show.calls.mostRecent().args[1].initialState).toEqual(
			jasmine.objectContaining({ repository: 'another', initialView: 'import' }),
		);
	});
	it('hands the read its hover started to the dialog the same click opens, without reading again', () => {
		retainFolder();
		component.loadShortcuts();
		component.open();
		expect(load).toHaveBeenCalledTimes(1);
		const handed = show.calls.mostRecent().args[1].initialState.initialDestination;
		const received: CreationDestination[] = [];
		handed.subscribe((d: CreationDestination) => received.push(d));
		// A later context change does not cancel the read the dialog now owns.
		fixture.componentRef.setInput('context', context({ ...folder, repository: 'another' }));
		fixture.detectChanges();
		expect(parentResults.observed).toBeTrue();
		const loaded = { document: folder, types: [], allowed: true };
		parentResults.next(loaded);
		expect(received).toEqual([loaded]);
		hidden.next();
		component.open();
		expect(show.calls.mostRecent().args[1].initialState.initialDestination).toBeUndefined();
		expect(load).toHaveBeenCalledTimes(1);
	});
	it('does not hand a failed hover read to the dialog', () => {
		retainFolder();
		component.loadShortcuts();
		parentResults.error(new Error('offline'));
		component.open();
		expect(show.calls.mostRecent().args[1].initialState.initialDestination).toBeUndefined();
	});
	it('does not fetch root shortcuts on Home when there is no retained document', () => {
		fixture.componentRef.setInput('context', context(null, '/dashboard'));
		fixture.detectChanges();
		component.loadShortcuts();
		expect(load).not.toHaveBeenCalled();
		expect(component.shortcuts()).toBeFalse();
		component.open();
		expect(show.calls.mostRecent().args[1].initialState).toEqual(
			jasmine.objectContaining({ initialPath: '/', repository: 'default' }),
		);
	});
	it('ignores shortcut keys inside editing targets and when modifiers or key repeat are present', () => {
		for (const tag of ['input', 'textarea', 'select']) {
			expect(press(document.createElement(tag)).defaultPrevented).toBeFalse();
		}
		for (const attribute of ['contenteditable', 'role']) {
			const editor = document.createElement('div');
			editor.setAttribute(attribute, attribute === 'role' ? 'textbox' : 'true');
			editor.innerHTML = '<span>Editing</span>';
			document.body.appendChild(editor);
			const event = new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true });
			editor.firstElementChild!.dispatchEvent(event);
			expect(event.defaultPrevented).toBeFalse();
			editor.remove();
		}
		for (const options of [
			{ ctrlKey: true },
			{ metaKey: true },
			{ altKey: true },
			{ shiftKey: true },
			{ repeat: true },
			{ key: 'C' },
		]) {
			expect(press(document.createElement('button'), options).defaultPrevented).toBeFalse();
		}
		expect(show).not.toHaveBeenCalled();
	});
	it('opens with plain c only for floating placement and no already-open modal', () => {
		modalCount.and.returnValue(1);
		expect(press(document.createElement('button')).defaultPrevented).toBeFalse();
		modalCount.and.returnValue(0);
		placement.set('toolbar');
		expect(press(document.createElement('button')).defaultPrevented).toBeFalse();
		expect(show).not.toHaveBeenCalled();
		placement.set('floating');
		expect(press(document.createElement('button')).defaultPrevented).toBeTrue();
		expect(show).toHaveBeenCalledTimes(1);
		expect(press(document.createElement('button')).defaultPrevented).toBeFalse();
		expect(show).toHaveBeenCalledTimes(1);
	});
	it('contributes Create to authenticated normal routes but excludes administration and unauthorized routes', () => {
		const registry = TestBed.inject(ExtensionRegistry);
		const visible = (value: ShellActionContext) =>
			registry
				.resolve('SHELL_ACTIONS', value)
				.items.some((item) => item.id === 'maretha.shell.create');
		for (const route of [
			'/dashboard',
			'/browse',
			'/search',
			'/page/tasks',
			'/page/administration-other',
		])
			expect(visible(context(null, route))).toBeTrue();
		for (const route of [
			'/settings',
			'/settings?admin=users',
			'/page/administration',
			'/page/administration?panel=history',
			'/unauthorized',
		])
			expect(visible(context(folder, route))).toBeFalse();
		for (const type of ['Folder', 'Picture', 'File'])
			expect(visible(context({ ...folder, type }))).toBeTrue();
		expect(visible({ ...context(), user: null })).toBeFalse();
	});
});
