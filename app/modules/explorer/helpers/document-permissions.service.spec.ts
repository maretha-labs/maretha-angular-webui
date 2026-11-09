import { WebUiMessages } from 'app/extensions/webui-messages';
import { WebUiLocale } from 'app/extensions/i18n/webui-locale';
import { loadWebUiCatalog } from 'app/helpers/webui-message-catalog';
import { HttpTestingController } from '@angular/common/http/testing';
import { ToastrService } from 'ngx-toastr';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';

import { DocumentPermissionsService } from './document-permissions.service';

describe('DocumentPermissionsService', () => {
	let service: DocumentPermissionsService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(DocumentPermissionsService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
	it('renders whole plain-text notification messages and only notifies opted-in changes', async () => {
		TestBed.inject(WebUiMessages).register('permission-locale-test', {
			es: await loadWebUiCatalog('es'),
			ar: await loadWebUiCatalog('ar'),
		});
		const locale = TestBed.inject(WebUiLocale);
		const toast = spyOn(TestBed.inject(ToastrService), 'info');
		const http = TestBed.inject(HttpTestingController);
		const email = 'customer{count}<b>@example.test';
		service.addPermission('doc', 'Read', email, undefined, undefined, true).subscribe();
		locale.locale.set('es');
		http.expectOne((req) => req.url.endsWith('/Document.AddPermission')).flush({});
		expect(toast).toHaveBeenCalledWith(
			`Se ha enviado un enlace a este documento a ${email}.`,
			'Notificación enviada',
			{ enableHtml: false },
		);
		toast.calls.reset();
		service
			.updatePermission('doc', 'permission', 'Read', email, 'user', undefined, undefined, false)
			.subscribe();
		http.expectOne((req) => req.url.endsWith('/Document.ReplacePermission')).flush({});
		expect(toast).not.toHaveBeenCalled();
		service.sendNotificationEmailForPermission('doc', 'permission', email).subscribe();
		locale.locale.set('ar');
		http
			.expectOne((req) => req.url.endsWith('/Document.SendNotificationEmailForPermission'))
			.flush({});
		expect(toast).toHaveBeenCalledWith(
			`تم إرسال رابط لهذا المستند إلى ${email}.`,
			'تم إرسال الإشعار',
			{ enableHtml: false },
		);
		http.verify();
	});
});
