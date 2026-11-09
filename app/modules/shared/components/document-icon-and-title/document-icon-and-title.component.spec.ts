import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DocumentIconAndTitleComponent } from './document-icon-and-title.component';

describe('DocumentIconAndTitleComponent', () => {
	let component: DocumentIconAndTitleComponent;
	let fixture: ComponentFixture<DocumentIconAndTitleComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [DocumentIconAndTitleComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(DocumentIconAndTitleComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('document', fixtureDocument());
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
