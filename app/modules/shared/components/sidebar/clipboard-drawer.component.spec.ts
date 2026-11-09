import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ClipboardDrawerComponent } from './clipboard-drawer.component';
import { DocumentClipboardService } from 'app/modules/explorer/helpers/document-clipboard.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { DocumentHistoryService } from 'app/modules/explorer/helpers/document-history.service';

describe('Clipboard drawer actions', () => {
	const member = { uid: 'note', type: 'Note', title: 'Clipboard note', repository: 'archive' };
	const target = {
		uid: 'target',
		repository: 'archive',
		type: 'Workspace',
		facets: ['Folderish'],
		contextParameters: { subtypes: [{ type: 'Note' }], permissions: ['AddChildren'] },
	};
	let paste: Subject<any>;
	let clipboard: any;
	let manager: any;
	let context: any;
	beforeEach(() => {
		paste = new Subject();
		clipboard = {
			drawerPending: signal(false),
			pasteFromDrawer: jasmine.createSpy('paste').and.returnValue(paste),
			removeFromClipboard: jasmine.createSpy('remove'),
		};
		manager = { reloadDocument: jasmine.createSpy('reload').and.returnValue(of(target)) };
		context = {
			user: { id: 'alice' },
			document: target,
			clipboard: [member],
			noEdit: false,
			navigate: jasmine.createSpy('navigate'),
			clearClipboard: jasmine.createSpy('clear'),
		};
		TestBed.configureTestingModule({
			imports: [ClipboardDrawerComponent],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: DocumentClipboardService, useValue: clipboard },
				{ provide: DocumentsManagerService, useValue: manager },
				{
					provide: DocumentHistoryService,
					useValue: { invalidatePaths: jasmine.createSpy('invalidate') },
				},
				{
					provide: Router,
					useValue: {
						url: '/browse/documents/target?repository=archive',
						navigateByUrl: jasmine.createSpy('navigateByUrl').and.resolveTo(true),
					},
				},
			],
		});
	});
	afterEach(() => TestBed.inject(HttpTestingController).verify());
	function setup() {
		const fixture = TestBed.createComponent(ClipboardDrawerComponent);
		fixture.componentRef.setInput('context', context);
		fixture.detectChanges();
		return {
			fixture,
			component: fixture.componentInstance,
			http: TestBed.inject(HttpTestingController),
		};
	}
	it('preflights one batch with fresh permissions and suppresses duplicate submissions', async () => {
		const { component, http } = setup();
		const result = component.execute('Copy');
		void component.execute('Move');
		const request = http.expectOne((req) => req.url.includes('/repo/archive/id/target'));
		expect(request.request.headers.get('enrichers.document')).toBe('permissions,subtypes');
		request.flush(target);
		await Promise.resolve();
		expect(clipboard.pasteFromDrawer).toHaveBeenCalledOnceWith(
			'Copy',
			['note'],
			'target',
			'archive',
			jasmine.any(Function),
		);
		paste.next({ entries: [] });
		await result;
		expect(manager.reloadDocument).toHaveBeenCalledOnceWith('target', 'archive');
		expect(component.status()).toBe('Documents copied.');
		expect(component.busy()).toBeFalse();
	});
	it('rejects an obsolete destination or changed clipboard before posting', async () => {
		const { fixture, component, http } = setup();
		const result = component.execute('Move');
		fixture.componentRef.setInput('context', {
			...context,
			document: { ...target, uid: 'new-target' },
		});
		http.expectOne((req) => req.url.includes('/id/target')).flush(target);
		await result;
		expect(clipboard.pasteFromDrawer).not.toHaveBeenCalled();
		fixture.componentRef.setInput('context', context);
		const second = component.execute('Copy');
		fixture.componentRef.setInput('context', { ...context, clipboard: [] });
		http.expectOne((req) => req.url.includes('/id/target')).flush(target);
		await second;
		expect(clipboard.pasteFromDrawer).not.toHaveBeenCalled();
	});
	it('enforces subtype, repository and read-only constraints, including revoked permissions', async () => {
		const { fixture, component, http } = setup();
		for (const override of [
			{ noEdit: true },
			{ clipboard: [{ ...member, repository: 'default' }] },
			{ document: { ...target, contextParameters: { subtypes: [] } } },
			{ document: { ...target, isVersion: true } },
		]) {
			fixture.componentRef.setInput('context', { ...context, ...override });
			expect(component.canPaste()).toBeFalse();
		}
		fixture.componentRef.setInput('context', context);
		const result = component.execute('Copy');
		http
			.expectOne((req) => req.url.includes('/id/target'))
			.flush({
				...target,
				contextParameters: { ...target.contextParameters, permissions: ['Read'] },
			});
		await result;
		expect(clipboard.pasteFromDrawer).not.toHaveBeenCalled();
		expect(component.error()).toContain('could not be copied');
	});
	it('does not paste into the old document while a new route is loading', async () => {
		const { component, http } = setup();
		const result = component.execute('Move');
		(TestBed.inject(Router) as any).url = '/browse/documents/next?repository=archive';
		http.expectOne((req) => req.url.includes('/id/target')).flush(target);
		await result;
		expect(clipboard.pasteFromDrawer).not.toHaveBeenCalled();
		await component.execute('Copy');
		http.expectNone((req) => req.url.includes('/id/target'));
	});
	it('distinguishes a committed operation from a failed parent refresh', async () => {
		manager.reloadDocument.and.returnValue(throwError(() => new Error('offline')));
		const { component, http } = setup();
		const result = component.execute('Move');
		http.expectOne((req) => req.url.includes('/id/target')).flush(target);
		await Promise.resolve();
		paste.next({ entries: [member] });
		await result;
		expect(component.status()).toBe('Documents moved.');
		expect(component.error()).toContain('were saved');
		expect(clipboard.pasteFromDrawer).toHaveBeenCalledTimes(1);
	});
	it('removes only a current row without navigating and blocks stale or busy actions', () => {
		const { fixture, component } = setup();
		fixture.nativeElement.querySelector('.remove-document').click();
		expect(clipboard.removeFromClipboard).toHaveBeenCalledOnceWith(['note'], false);
		expect(context.navigate).not.toHaveBeenCalled();
		component.open(member);
		expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledOnceWith(
			'/browse/documents/note?repository=archive',
		);
		expect(context.navigate).not.toHaveBeenCalled();
		component.remove({ ...member });
		clipboard.drawerPending.set(true);
		component.remove(member);
		component.clear();
		expect(clipboard.removeFromClipboard).toHaveBeenCalledTimes(1);
		expect(context.clearClipboard).not.toHaveBeenCalled();
	});
	it('supports vertical keyboard focus without activating a row', () => {
		context.clipboard = [member, { ...member, uid: 'second', title: 'Second' }];
		const { fixture } = setup();
		const buttons = fixture.nativeElement.querySelectorAll('.open-document');
		spyOn(buttons[1], 'focus');
		buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		expect(buttons[1].focus).toHaveBeenCalled();
		expect(context.navigate).not.toHaveBeenCalled();
	});
});
