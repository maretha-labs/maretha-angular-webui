import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
	let component: FooterComponent;
	let fixture: ComponentFixture<FooterComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [FooterComponent],
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(FooterComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('accepts supported locales and ignores unknown language input', () => {
		component.changeLanguage('pt-PT');
		expect(component.currentLanguage()).toBe('pt-PT');
		component.changeLanguage('xx-customer');
		expect(component.currentLanguage()).toBe('pt-PT');
		component.changeLanguage('en-US');
		expect(component.currentLanguage()).toBe('en-US');
	});
	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
