import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AudioRendererComponent } from './audio-renderer.component';

describe('AudioRendererComponent', () => {
	let component: AudioRendererComponent;
	let fixture: ComponentFixture<AudioRendererComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [AudioRendererComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(AudioRendererComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('document', fixtureDocument());
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
