import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SerialWfDocumentValidationTaskComponent } from './serial-wf-document-validation-task.component';

describe('SerialWfDocumentValidationTaskComponent', () => {
	let component: SerialWfDocumentValidationTaskComponent;
	let fixture: ComponentFixture<SerialWfDocumentValidationTaskComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [SerialWfDocumentValidationTaskComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(SerialWfDocumentValidationTaskComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
