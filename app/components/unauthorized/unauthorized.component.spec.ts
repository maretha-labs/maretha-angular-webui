import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UnauthorizedComponent } from './unauthorized.component';

describe('UnauthorizedComponent', () => {
	let component: UnauthorizedComponent;
	let fixture: ComponentFixture<UnauthorizedComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [UnauthorizedComponent],
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(UnauthorizedComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
