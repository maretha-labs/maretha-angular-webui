import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NoteRendererComponent } from './note-renderer.component';

describe('NoteRendererComponent', () => {
	let component: NoteRendererComponent;
	let fixture: ComponentFixture<NoteRendererComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [NoteRendererComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(NoteRendererComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('document', fixtureDocument('Note'));
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
