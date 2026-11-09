import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContributorsComponent } from './contributors.component';

describe('ContributorsComponent', () => {
	let component: ContributorsComponent;
	let fixture: ComponentFixture<ContributorsComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders(), { provide: 'document', useValue: fixtureDocument() }],
			imports: [ContributorsComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(ContributorsComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('document', fixtureDocument());
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
