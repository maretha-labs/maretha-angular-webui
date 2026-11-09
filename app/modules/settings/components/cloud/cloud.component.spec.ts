import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CloudServicesService } from '../../helpers/cloud-services.service';

import { CloudComponent } from './cloud.component';

describe('CloudComponent', () => {
	let component: CloudComponent;
	let fixture: ComponentFixture<CloudComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{
					provide: CloudServicesService,
					useValue: {
						getProviders: () => of([]),
						getClients: () => of([]),
						getApplications: () => of([]),
						getAccounts: () => of([]),
					},
				},
			],
			imports: [CloudComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(CloudComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
	it('opens Providers and separates Tokens and Consumers into accessible tab panels', () => {
		const tabs = [...fixture.nativeElement.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
		const visiblePanel = () =>
			fixture.nativeElement.querySelector('[role="tabpanel"]:not([hidden])') as HTMLElement;
		expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
			'Providers',
			'Tokens',
			'Consumers',
		]);
		expect(visiblePanel().textContent).toContain('No provider defined');
		expect(visiblePanel().textContent).not.toContain('OAuth2 Clients');
		tabs[1].click();
		fixture.detectChanges();
		expect(tabs[1].getAttribute('aria-selected')).toBe('true');
		expect(visiblePanel().getAttribute('aria-labelledby')).toBe(tabs[1].id);
		expect(visiblePanel().querySelectorAll('tbody tr').length).toBe(2);
		expect(visiblePanel().textContent).toContain('No tokens defined');
		tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		fixture.detectChanges();
		expect(tabs[2].getAttribute('aria-selected')).toBe('true');
		expect(visiblePanel().textContent).toContain('OAuth2 Clients');
		tabs[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		fixture.detectChanges();
		expect(tabs[0].getAttribute('aria-selected')).toBe('true');
	});
});
