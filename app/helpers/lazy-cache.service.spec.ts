import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';

import { LazyCacheService } from './lazy-cache.service';

describe('LazyCacheService', () => {
	let service: LazyCacheService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(LazyCacheService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
});
