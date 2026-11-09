import { WebUiLocale } from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetentionRulesComponent } from './retention-rules.component';

describe('RetentionRulesComponent', () => {
	const enabled = environment.addons.retention;
	beforeEach(() => (environment.addons.retention = true));
	afterEach(() => (environment.addons.retention = enabled));

	let component: RetentionRulesComponent;
	let fixture: ComponentFixture<RetentionRulesComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [RetentionRulesComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(RetentionRulesComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('formats calendar durations and millisecond fallback in the selected locale without rewriting amounts', () => {
		const rule = { durationYears: 2, durationMonths: 3, durationDays: 0 } as Parameters<
			RetentionRulesComponent['duration']
		>[0];
		expect(component.duration(rule)).toBe('2 years and 3 months');
		TestBed.inject(WebUiLocale).setLocale('fr');
		expect(component.duration(rule)).toMatch(/^2 ans et 3\smois$/);
		expect(rule.durationYears).toBe(2);
		expect(component.duration({ durationMillis: 1500 } as typeof rule)).toMatch(/^1,5\sseconde$/);
		expect(component.duration({} as typeof rule)).toMatch(/^0\sseconde$/);
	});
	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
