import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { QuickSearchComponent } from './quick-search.component';
import { QuickSearchService, SearchSuggestion } from './quick-search.service';
import {
	defineContribution,
	ExtensionRegistry,
	QUICK_SEARCH_ACTIONS_SLOT,
	QuickSearchCommandComponent,
	SHELL_ACTIONS_SLOT,
} from '@maretha/webui-sdk';
import { provideDefaultShellActions } from './default-shell-actions';
const doc: SearchSuggestion = {
	id: 'document-id',
	label: 'Document',
	type: 'document',
	repository: 'default',
	thumbnail: null,
	highlights: [],
};
describe('Quick search overlay', () => {
	let fixture: ComponentFixture<QuickSearchComponent>;
	let component: QuickSearchComponent;
	let service: jasmine.SpyObj<QuickSearchService>;
	let navigate: jasmine.Spy;
	beforeEach(() => {
		service = jasmine.createSpyObj('search', ['search']);
		service.search.and.returnValue(of([doc]));
		navigate = jasmine.createSpy('navigate').and.resolveTo(true);
		TestBed.configureTestingModule({
			imports: [QuickSearchComponent],
			providers: [{ provide: QuickSearchService, useValue: service }, provideDefaultShellActions()],
		});
		fixture = TestBed.createComponent(QuickSearchComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('context', {
			user: { id: 'a', displayName: 'A', groups: [], isAdministrator: false },
			locale: 'en-US',
			route: '/dashboard',
			document: null,
			navigate,
		});
		fixture.detectChanges();
	});
	it('cancels an in-flight search immediately on typing or closing and resets old results', fakeAsync(() => {
		const old = new Subject<readonly SearchSuggestion[]>();
		service.search.and.returnValue(old as any);
		component.show();
		fixture.detectChanges();
		component.update('old');
		tick(500);
		expect(old.observers.length).toBe(1);
		component.update('new');
		expect(old.observers.length).toBe(0);
		expect(component.items()).toEqual([]);
		service.search.and.returnValue(of([doc]));
		tick(500);
		expect(component.items()).toEqual([doc]);
		component.close();
		expect(component.items()).toEqual([]);
		expect(component.open()).toBeFalse();
	}));
	it('keeps the overlay when a draft guard rejects navigation and routes users and groups explicitly', async () => {
		component.show();
		fixture.detectChanges();
		navigate.and.resolveTo(false);
		await component.select(doc);
		expect(component.open()).toBeTrue();
		expect(navigate).toHaveBeenCalledWith('/browse/documents/document-id');
		navigate.and.resolveTo(true);
		await component.select({ ...doc, type: 'user', id: 'name/with spaces' });
		expect(navigate).toHaveBeenCalledWith('/page/user?id=name%2Fwith%20spaces');
		expect(component.open()).toBeFalse();
		await component.select({ ...doc, type: 'group', id: 'members' });
		expect(navigate).toHaveBeenCalledWith('/page/group?id=members');
	});
	it('shows retry after failure and focuses results with the arrow keys', fakeAsync(() => {
		service.search.and.returnValue(throwError(() => new Error('offline')));
		component.show();
		fixture.detectChanges();
		component.update('test');
		tick(500);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('retry');
		service.search.and.returnValue(of([doc]));
		component.retry();
		tick(500);
		fixture.detectChanges();
		const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
		input.focus();
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		expect(document.activeElement).toBe(
			fixture.nativeElement.querySelector('[data-search-result]'),
		);
		const modal: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
		modal.dispatchEvent(new Event('cancel', { cancelable: true }));
		fixture.detectChanges();
		expect(component.open()).toBeFalse();
	}));
	it('wraps Tab and Shift+Tab inside the dialog after reopening', () => {
		for (let attempt = 0; attempt < 2; attempt++) {
			component.show();
			fixture.detectChanges();
			const input = fixture.nativeElement.querySelector('dialog input') as HTMLInputElement;
			const close = fixture.nativeElement.querySelector('dialog .close') as HTMLButtonElement;
			input.focus();
			const backwards = new KeyboardEvent('keydown', {
				key: 'Tab',
				shiftKey: true,
				bubbles: true,
				cancelable: true,
			});
			input.dispatchEvent(backwards);
			expect(backwards.defaultPrevented).toBeTrue();
			expect(document.activeElement).toBe(close);
			const forwards = new KeyboardEvent('keydown', {
				key: 'Tab',
				bubbles: true,
				cancelable: true,
			});
			close.dispatchEvent(forwards);
			expect(forwards.defaultPrevented).toBeTrue();
			expect(document.activeElement).toBe(input);
			component.close();
			fixture.detectChanges();
		}
	});

	it('supports hiding the shell entry and contributing custom command results', () => {
		const registry = TestBed.inject(ExtensionRegistry);
		const context = component.context();
		expect(registry.resolve(SHELL_ACTIONS_SLOT.name, context).items.map((x) => x.id)).toEqual([
			'maretha.shell.quick-search',
			'maretha.shell.create',
		]);
		const cleanup = registry.register({
			id: 'client',
			overrides: [
				{ slot: SHELL_ACTIONS_SLOT.name, id: 'maretha.shell.quick-search', disabled: true },
			],
			contributions: [
				defineContribution(QUICK_SEARCH_ACTIONS_SLOT, {
					id: 'client.command',
					component: QuickSearchCommandComponent,
					inputs: { label: 'Custom command', run: () => true },
					when: (c) => c.searchTerm === 'custom',
				}),
			],
		});
		expect(registry.resolve(SHELL_ACTIONS_SLOT.name, context).items.map((x) => x.id)).toEqual([
			'maretha.shell.create',
		]);
		component.update('custom');
		expect(component.commandCount()).toBe(1);
		component.update('');
		expect(component.commandCount()).toBe(0);
		cleanup();
	});

	it('clears the query, handles link activation modifiers, and reports unsupported repositories or navigation failures', async () => {
		component.show();
		fixture.detectChanges();
		component.update('doc');
		component.clear();
		expect(component.term()).toBe('');

		// Modified clicks let native anchor behavior proceed without calling select()
		const selectSpy = spyOn(component, 'select').and.callThrough();
		const modEvent = new MouseEvent('click', { ctrlKey: true, button: 0, cancelable: true });
		component.activateLink(modEvent, doc);
		expect(modEvent.defaultPrevented).toBeFalse();
		expect(selectSpy).not.toHaveBeenCalled();

		// Plain left click intercepts and delegates to select()
		const plainEvent = new MouseEvent('click', { button: 0, cancelable: true });
		component.activateLink(plainEvent, { ...doc, path: '/Workspace/Doc' });
		expect(plainEvent.defaultPrevented).toBeTrue();
		await Promise.resolve();
		expect(navigate).toHaveBeenCalledWith('/browse/Workspace/Doc');

		// Non-default repository sets error message
		await component.select({ ...doc, repository: 'archive' });
		expect(component.error()).toContain('not supported');

		// Thrown navigation error sets retry error message
		navigate.and.rejectWith(new Error('router failed'));
		await component.select(doc);
		expect(component.error()).toContain('could not be opened');
	});
});
