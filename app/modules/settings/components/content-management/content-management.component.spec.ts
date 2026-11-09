import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContentManagementComponent } from './content-management.component';

describe('ContentManagementComponent', () => {
	let component: ContentManagementComponent;
	let fixture: ComponentFixture<ContentManagementComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [ContentManagementComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(ContentManagementComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
