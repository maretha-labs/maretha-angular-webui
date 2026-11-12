import { WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import { ToastService } from 'app/helpers/toast.service';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';

import { AutomationsService } from './automations.service';

describe('AutomationsService', () => {
	let service: AutomationsService;

	let previousActions: string | null;
	beforeEach(() => {
		previousActions = localStorage.getItem('bulkActions');
		localStorage.removeItem('bulkActions');
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(AutomationsService);
	});

	afterEach(() => {
		if (previousActions === null) localStorage.removeItem('bulkActions');
		else localStorage.setItem('bulkActions', previousActions);
	});
	it('should be created', () => {
		expect(service).toBeTruthy();
	});
	it('opens the shared preparation controls for legacy calls instead of hidden ZIP polling', async () => {
		const modal = spyOn(TestBed.inject(BsModalService), 'show').and.returnValue({} as BsModalRef);
		await service.bulkDownloadAsZip('folder', 'Documents', 'archive');
		expect(modal).toHaveBeenCalledWith(jasmine.any(Function), {
			initialState: { documentId: 'folder', repository: 'archive', filename: 'Documents.zip' },
			ignoreBackdropClick: true,
		});
		TestBed.inject(HttpTestingController).expectNone(() => true);
	});
	it('keeps progress notifications localized and removes them when the native bulk operation completes', fakeAsync(() => {
		const component = { message: '', title: '' };
		const toast = {
			toastId: 42,
			update(message: string, title?: string) {
				component.message = message;
				if (title !== undefined) component.title = title;
			},
		};
		const toastr = TestBed.inject(ToastService);
		spyOn(toastr, 'info').and.returnValue(toast as any);
		const remove = spyOn(toastr, 'remove');
		TestBed.inject(WebUiMessages).register('progress-test', {
			es: {
				'app.services.automations.progress': 'Progreso: {progress, number, percent}',
				'app.services.automations.title': 'Operación {operation}',
			},
			ar: {
				'app.services.automations.progress': 'التقدم: {progress, number, percent}',
				'app.services.automations.title': 'العملية {operation}',
			},
		});
		const locale = TestBed.inject(WebUiLocale);
		locale.setLocale('es');
		const done = jasmine.createSpy();
		service.bulkMoveToTrash('parent').subscribe(done);
		const http = TestBed.inject(HttpTestingController);
		http
			.expectOne((r) => r.url.endsWith('/Bulk.RunAction'))
			.flush({ value: { commandId: 'command', total: 10 } });
		http
			.expectOne((r) => r.url.endsWith('/bulk/command'))
			.flush({ commandId: 'command', total: 10, processed: 5, completed: true });
		TestBed.tick();
		expect(component.message).toContain('Progreso:');
		locale.setLocale('ar');
		TestBed.tick();
		expect(component.message).toContain('التقدم:');
		expect(component.title).toContain('العملية');
		tick(1000);
		expect(done).toHaveBeenCalled();
		expect(remove).toHaveBeenCalledOnceWith(42);
		expect(JSON.parse(localStorage.getItem('bulkActions')!)).toEqual({});
		http.verify();
	}));
});
