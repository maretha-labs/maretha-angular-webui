import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CollapsibleComponent } from './collapsible.component';

describe('CollapsibleComponent', () => {
	let component: CollapsibleComponent;
	let fixture: ComponentFixture<CollapsibleComponent>;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [CollapsibleComponent],
		});
		fixture = TestBed.createComponent(CollapsibleComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
