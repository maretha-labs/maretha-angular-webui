import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';

import { DocumentTrashService } from './document-trash.service';

describe('DocumentTrashService', () => {
	let service: DocumentTrashService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(DocumentTrashService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
});
