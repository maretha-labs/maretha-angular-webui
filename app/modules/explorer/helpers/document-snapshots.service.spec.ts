import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';

import { DocumentSnapshotsService } from './document-snapshots.service';

describe('DocumentSnapshotsService', () => {
	let service: DocumentSnapshotsService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(DocumentSnapshotsService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
});
