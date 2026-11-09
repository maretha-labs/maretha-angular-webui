import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NxLegacyModelViewerComponent } from './legacy-model-vewer.component';

describe('ModelComponent', () => {
	let component: NxLegacyModelViewerComponent;
	let fixture: ComponentFixture<NxLegacyModelViewerComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [NxLegacyModelViewerComponent],
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(NxLegacyModelViewerComponent);
		component = fixture.componentInstance;
	});

	it('constructs before a model source is supplied', () => {
		expect(component).toBeTruthy();
	});
});
