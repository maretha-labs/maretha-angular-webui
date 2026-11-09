import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParallelWfGiveOpinionTaskComponent } from './parallel-wf-give-opinion-task.component';

describe('GiveOpinionComponent', () => {
	let component: ParallelWfGiveOpinionTaskComponent;
	let fixture: ComponentFixture<ParallelWfGiveOpinionTaskComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [ParallelWfGiveOpinionTaskComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(ParallelWfGiveOpinionTaskComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
