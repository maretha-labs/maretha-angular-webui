import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NoteEditorComponent } from './note-editor.component';

describe('NoteEditorComponent', () => {
	let component: NoteEditorComponent;
	let fixture: ComponentFixture<NoteEditorComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [NoteEditorComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(NoteEditorComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('documentType', 'Note');
		fixture.componentRef.setInput('parentDocument', fixtureDocument());
		fixture.componentRef.setInput('documents', [
			fixtureDocument(),
			{ ...fixtureDocument(), uid: 'fixture-second' },
		]);
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
