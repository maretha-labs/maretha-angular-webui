import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetentionRulePickerComponent } from './retention-rule-picker.component';

describe('RetentionRulePickerComponent', () => {
	let component: RetentionRulePickerComponent;
	let fixture: ComponentFixture<RetentionRulePickerComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [RetentionRulePickerComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(RetentionRulePickerComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('documentUid', 'fixture-document');
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
