import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WebUiLocale } from '@maretha/webui-sdk';
import { DocumentActivityService } from './document-activity.service';

describe('DocumentActivityService locale refresh', () => {
	it('cancels stale localized vocabulary responses and retains literal server labels', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const locale = TestBed.inject(WebUiLocale);
		locale.setLocale('es');
		const service = TestBed.inject(DocumentActivityService);
		const http = TestBed.inject(HttpTestingController);
		TestBed.tick();
		const first = http.match((req) => req.url.endsWith('/Directory.SuggestEntries'));
		expect(first.length).toBe(2);
		expect(first.every((request) => request.request.body.params.lang === 'es')).toBeTrue();
		locale.setLocale('ar');
		TestBed.tick();
		expect(first.every((request) => request.cancelled)).toBeTrue();
		const second = http.match((req) => req.url.endsWith('/Directory.SuggestEntries'));
		expect(second.length).toBe(2);
		for (const request of second) {
			expect(request.request.body.params.lang).toBe('ar');
			request.flush([{ id: 'custom', displayLabel: 'document.trash' }]);
		}
		expect(service.initialized()?.types[0].displayLabel).toBe('document.trash');
		http.verify();
	});
});
