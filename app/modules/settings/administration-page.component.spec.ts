import { TestBed } from '@angular/core/testing';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { AdministrationPageComponent } from './administration-page.component';
import { SettingsModule } from './settings.module';

describe('AdministrationPageComponent', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [AdministrationPageComponent],
			providers: [...legacyTestProviders()],
		});
	});

	it('renders the page registered for its kind with permissive departure defaults', () => {
		const fixture = TestBed.createComponent(AdministrationPageComponent);
		fixture.componentRef.setInput('kind', 'audit');
		fixture.componentRef.setInput('context', {
			document: null,
			noEdit: false,
			user: { id: 'admin', isAdministrator: true },
			features: { retention: false },
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('nx-audit')).toBeTruthy();
		expect(fixture.componentInstance.hasPendingChanges()).toBeFalse();
		expect(
			fixture.componentInstance.canDeactivate({ reason: 'navigation', nextViewId: null }),
		).toBeTrue();
	});

	it('loads the administration route module', () => {
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({
			imports: [SettingsModule],
			providers: [...legacyTestProviders()],
		});
		expect(TestBed.inject(SettingsModule)).toBeTruthy();
	});
});
