import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VideoRendererComponent } from './video-renderer.component';

describe('VideoRendererComponent', () => {
	let component: VideoRendererComponent;
	let fixture: ComponentFixture<VideoRendererComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [VideoRendererComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(VideoRendererComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('document', fixtureDocument());
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
