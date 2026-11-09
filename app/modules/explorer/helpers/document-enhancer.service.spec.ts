import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DocumentEnhancerService } from './document-enhancer.service';

describe('DocumentEnhancerService', () => {
	let service: DocumentEnhancerService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(DocumentEnhancerService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
	it('requests nothing on construction or while enhancing: the action that opens a document does', () => {
		const http = TestBed.inject(HttpTestingController);
		service.setDocumentCustomProperties({
			uid: 'one',
			facets: ['Folderish'],
			contextParameters: { subtypes: [{ type: 'File', facets: [] }] },
		});
		http.expectNone((request) => request.url.includes('/config/types'));
	});
	it('fetches the type catalogue once, on the first action that asks for it', async () => {
		const http = TestBed.inject(HttpTestingController);
		const first = service.loadDocumentTypes();
		http
			.expectOne((request) => request.url.endsWith('/api/v1/config/types'))
			.flush({
				doctypes: { File: { schemas: ['file'] } },
			});
		expect(await first).toEqual({ File: { schemas: ['file'] } });
		expect(await service.loadDocumentTypes()).toEqual({ File: { schemas: ['file'] } });
		http.expectNone((request) => request.url.includes('/config/types'));
	});
	it('uses the current-user notification enricher without requiring the legacy Notifiable facet', () => {
		const document = {
			uid: 'one',
			facets: [],
			contextParameters: { subscribedNotifications: ['notification'] },
		};
		expect(service.setDocumentCustomProperties(document).ng.canNotify).toBeTrue();
		document.contextParameters.subscribedNotifications = [];
		expect(service.setDocumentCustomProperties(document).ng.canNotify).toBeFalse();
	});
});
