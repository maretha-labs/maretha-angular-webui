import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetentionRuleLogComponent } from './retention-rule-log.component';

describe('RetentionRuleLogComponent', () => {
	let component: RetentionRuleLogComponent;
	let fixture: ComponentFixture<RetentionRuleLogComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [RetentionRuleLogComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(RetentionRuleLogComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
