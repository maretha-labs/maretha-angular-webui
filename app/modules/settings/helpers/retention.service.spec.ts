import { environment } from 'environments/environment';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';

import { RetentionService } from './retention.service';

describe('RetentionService', () => {
	const enabled = environment.addons.retention;
	beforeEach(() => (environment.addons.retention = true));
	afterEach(() => (environment.addons.retention = enabled));

	let service: RetentionService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(RetentionService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
});
