import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DocumentSnapshotComparisonComponent } from './document-snapshot-comparison.component';

describe('DocumentSnapshotComparisonComponent', () => {
	let component: DocumentSnapshotComparisonComponent;
	let fixture: ComponentFixture<DocumentSnapshotComparisonComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [DocumentSnapshotComparisonComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(DocumentSnapshotComparisonComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('documents', [
			fixtureDocument(),
			{ ...fixtureDocument(), uid: 'fixture-second' },
		]);
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
