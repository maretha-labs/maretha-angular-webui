import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SerialWfChooseParticipantsTaskComponent } from './serial-wf-choose-participants-task.component';

describe('ChooseParticipantsComponent', () => {
	let component: SerialWfChooseParticipantsTaskComponent;
	let fixture: ComponentFixture<SerialWfChooseParticipantsTaskComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [SerialWfChooseParticipantsTaskComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(SerialWfChooseParticipantsTaskComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
