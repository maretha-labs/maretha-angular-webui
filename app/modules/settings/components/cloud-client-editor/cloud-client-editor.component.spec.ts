import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CloudClientEditorComponent } from './cloud-client-editor.component';

describe('CloudClientEditorComponent', () => {
	let component: CloudClientEditorComponent;
	let fixture: ComponentFixture<CloudClientEditorComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [CloudClientEditorComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(CloudClientEditorComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
