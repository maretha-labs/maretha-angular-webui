import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserProfileComponent } from './user-profile.component';

describe('UserProfileComponent', () => {
	let component: UserProfileComponent;
	let fixture: ComponentFixture<UserProfileComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [UserProfileComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(UserProfileComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
