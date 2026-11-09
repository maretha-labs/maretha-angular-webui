import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InputDialogComponent } from './input-dialog.component';

describe('InputDialogComponent', () => {
	let component: InputDialogComponent;
	let fixture: ComponentFixture<InputDialogComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [InputDialogComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(InputDialogComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
