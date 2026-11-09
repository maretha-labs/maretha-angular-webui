import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParallelWfChooseParticipantsTaskComponent } from './parallel-wf-choose-participants-task.component';

describe('ChooseParticipantsComponent', () => {
	let component: ParallelWfChooseParticipantsTaskComponent;
	let fixture: ComponentFixture<ParallelWfChooseParticipantsTaskComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [ParallelWfChooseParticipantsTaskComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(ParallelWfChooseParticipantsTaskComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
