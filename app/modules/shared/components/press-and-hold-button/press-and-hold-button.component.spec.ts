import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PressAndHoldButtonComponent } from './press-and-hold-button.component';

describe('PressAndHoldButtonComponent', () => {
	let component: PressAndHoldButtonComponent;
	let fixture: ComponentFixture<PressAndHoldButtonComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [PressAndHoldButtonComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(PressAndHoldButtonComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
