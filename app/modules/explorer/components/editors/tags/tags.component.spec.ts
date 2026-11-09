import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TagsComponent } from './tags.component';

describe('TagsComponent', () => {
	let component: TagsComponent;
	let fixture: ComponentFixture<TagsComponent>;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [TagsComponent],
		});
		fixture = TestBed.createComponent(TagsComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
