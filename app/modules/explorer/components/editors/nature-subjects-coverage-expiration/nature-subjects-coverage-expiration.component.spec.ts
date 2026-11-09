import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NatureSubjectsCoverageExpirationComponent } from './nature-subjects-coverage-expiration.component';

describe('NatureSubjectsCoverageExpirationComponent', () => {
	let component: NatureSubjectsCoverageExpirationComponent;
	let fixture: ComponentFixture<NatureSubjectsCoverageExpirationComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [NatureSubjectsCoverageExpirationComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(NatureSubjectsCoverageExpirationComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
