import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DocumentPermissionEditorComponent } from './document-permission-editor.component';

describe('DocumentPermissionEditorComponent', () => {
	let component: DocumentPermissionEditorComponent;
	let fixture: ComponentFixture<DocumentPermissionEditorComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders(), { provide: 'document', useValue: fixtureDocument() }],
			imports: [DocumentPermissionEditorComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(DocumentPermissionEditorComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
