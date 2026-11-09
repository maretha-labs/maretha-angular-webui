import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CloudApplicationEditorComponent } from './cloud-application-editor.component';

describe('CloudApplicationEditorComponent', () => {
	let component: CloudApplicationEditorComponent;
	let fixture: ComponentFixture<CloudApplicationEditorComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [CloudApplicationEditorComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(CloudApplicationEditorComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
