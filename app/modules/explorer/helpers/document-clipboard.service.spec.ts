import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from 'app/helpers/auth.service';
import { ToastService } from 'app/helpers/toast.service';
import { WebUiMessages } from 'app/extensions/webui-messages';
import { WebUiLocale } from 'app/extensions/i18n/webui-locale';
import { loadWebUiCatalog } from 'app/helpers/webui-message-catalog';

import { DocumentClipboardService } from './document-clipboard.service';

describe('DocumentClipboardService', () => {
	let service: DocumentClipboardService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(DocumentClipboardService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
	it('formats actual catalog plural counts at completion using the current locale', async () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('notification-test', {
			es: await loadWebUiCatalog('es'),
			ar: await loadWebUiCatalog('ar'),
		});
		const locale = TestBed.inject(WebUiLocale);
		const toast = spyOn(TestBed.inject(ToastService), 'success');
		const http = TestBed.inject(HttpTestingController);
		locale.locale.set('es');
		service.copyTo(['one', 'two'], 'destination').subscribe();
		for (const request of http.match((req) => req.url.endsWith('/Document.Copy')))
			request.flush({});
		expect(toast).toHaveBeenCalledWith(
			'Se han copiado 2 documentos a la ubicación actual.',
			'Documentos copiados',
			{ enableHtml: false },
		);
		service.moveTo(['one', 'two', 'three'], 'destination').subscribe();
		locale.locale.set('ar');
		for (const request of http.match((req) => req.url.endsWith('/Document.Move')))
			request.flush({});
		expect(toast).toHaveBeenCalledWith(
			`تم نقل ${new Intl.NumberFormat('ar').format(3)} مستندات إلى الموقع الحالي.`,
			'تم نقل المستندات',
			{ enableHtml: false },
		);
	});
});

describe('Drawer clipboard transport', () => {
	let service: DocumentClipboardService;
	let user: ReturnType<typeof signal<any>>;
	const item = (uid: string) => ({ uid, ng: { canAddToCollection: true } });
	beforeEach(() => {
		user = signal({ id: 'alice' });
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(withXhr()),
				provideHttpClientTesting(),
				{
					provide: AuthService,
					useValue: { userInfo: user, userInfoUpdated$: { subscribe: () => undefined } },
				},
				{
					provide: ToastService,
					useValue: { success: () => undefined, error: () => undefined, warning: () => undefined },
				},
			],
		});
		service = TestBed.inject(DocumentClipboardService);
	});
	afterEach(() => TestBed.inject(HttpTestingController).verify());
	it('posts one repository batch, keeps later additions, and never emits legacy events', () => {
		service.addToClipboard([item('one'), item('two')]);
		const changed = jasmine.createSpy('changed');
		const legacy = jasmine.createSpy('legacy');
		service.drawerActionPerformed$.subscribe(changed);
		service.documentsCopied$.subscribe(legacy);
		service.pasteFromDrawer('Copy', ['one', 'two'], 'target', 'archive').subscribe();
		service.pasteFromDrawer('Copy', ['one', 'two'], 'target', 'archive').subscribe();
		const request = TestBed.inject(HttpTestingController).expectOne((req) =>
			req.url.endsWith('/Document.Copy'),
		);
		expect(request.request.body).toEqual({
			input: 'docs:one,two',
			params: { target: 'target' },
			context: {},
		});
		expect(request.request.headers.get('X-NXRepository')).toBe('archive');
		expect(request.request.headers.get('nx-es-sync')).toBe('true');
		service.addToClipboard([item('later')]);
		request.flush({ entries: [{ uid: 'copy' }] });
		expect(service.documentClipboard().map((doc) => doc.uid)).toEqual(['later']);
		expect(changed).toHaveBeenCalledTimes(1);
		expect(legacy).not.toHaveBeenCalled();
		expect(service.drawerPending()).toBeFalse();
	});
	it('retains clipboard and enables retry after failure, ignoring a different user on completion', () => {
		service.addToClipboard([item('one')]);
		service
			.pasteFromDrawer('Move', ['one'], 'target', 'default')
			.subscribe({ error: () => undefined });
		const http = TestBed.inject(HttpTestingController);
		http
			.expectOne((req) => req.url.endsWith('/Document.Move'))
			.flush({}, { status: 403, statusText: 'Forbidden' });
		expect(service.documentClipboard().length).toBe(1);
		expect(service.drawerPending()).toBeFalse();
		const changed = jasmine.createSpy('changed');
		service.drawerActionPerformed$.subscribe(changed);
		const committed = jasmine.createSpy('committed');
		service.pasteFromDrawer('Move', ['one'], 'target', 'default', committed).subscribe();
		user.set({ id: 'bob' });
		http.expectOne((req) => req.url.endsWith('/Document.Move')).flush({ entries: [] });
		expect(service.documentClipboard().length).toBe(1);
		expect(changed).not.toHaveBeenCalled();
		expect(committed).not.toHaveBeenCalled();
	});
});
