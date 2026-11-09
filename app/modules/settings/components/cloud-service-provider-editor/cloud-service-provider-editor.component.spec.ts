import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CloudServiceProviderEditorComponent } from './cloud-service-provider-editor.component';

describe('CloudServiceProviderEditorComponent', () => {
	let component: CloudServiceProviderEditorComponent;
	let fixture: ComponentFixture<CloudServiceProviderEditorComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [CloudServiceProviderEditorComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(CloudServiceProviderEditorComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
