import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DocumentInfoPanelComponent } from './document-info-panel.component';

describe('DocumentInfoPanelComponent', () => {
	let component: DocumentInfoPanelComponent;
	let fixture: ComponentFixture<DocumentInfoPanelComponent>;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [DocumentInfoPanelComponent],
		});
		fixture = TestBed.createComponent(DocumentInfoPanelComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
