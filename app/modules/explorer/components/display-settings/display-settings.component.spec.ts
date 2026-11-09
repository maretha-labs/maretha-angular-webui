import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DisplaySettingsComponent } from './display-settings.component';

describe('DisplaySettingsComponent', () => {
	let component: DisplaySettingsComponent;
	let fixture: ComponentFixture<DisplaySettingsComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [DisplaySettingsComponent],
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(DisplaySettingsComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
	it('changes page size with Space on a named native button without submitting the form', () => {
		const button = fixture.nativeElement.querySelector(
			'[formControlName="pageSize"] button',
		) as HTMLButtonElement;
		expect(button.type).toBe('button');
		expect(button.textContent?.trim()).toBe('5');
		button.focus();
		expect(document.activeElement).toBe(button);
		button.dispatchEvent(
			new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
		);
		fixture.detectChanges();
		expect(component.displaySettingsForm?.get('pageSize')?.value).toBe('5');
		expect(button.getAttribute('aria-checked')).toBe('true');
	});
});
