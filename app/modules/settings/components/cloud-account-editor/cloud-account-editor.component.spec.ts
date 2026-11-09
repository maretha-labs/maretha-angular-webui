import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CloudAccountEditorComponent } from './cloud-account-editor.component';

describe('CloudAccountEditorComponent', () => {
	let component: CloudAccountEditorComponent;
	let fixture: ComponentFixture<CloudAccountEditorComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [CloudAccountEditorComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(CloudAccountEditorComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
