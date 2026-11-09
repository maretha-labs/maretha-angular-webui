import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserAndGroupPermissionsComponent } from './user-and-group-permissions.component';

describe('UserAndGroupPermissionsComponent', () => {
	let component: UserAndGroupPermissionsComponent;
	let fixture: ComponentFixture<UserAndGroupPermissionsComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [UserAndGroupPermissionsComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(UserAndGroupPermissionsComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('userOrGroup', {
			id: 'fixture-user',
			groups: [],
			properties: { groups: [] },
		});
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
