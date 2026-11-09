import { TestBed } from '@angular/core/testing';
import { DOCUMENT_IMPORT_DRAFT, documentLayoutContext } from '@maretha/webui-sdk';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { StandardContentImportComponent } from './standard-content-import.component';

describe('StandardContentImportComponent', () => {
	function create(documentType: string, properties: Record<string, unknown>) {
		const draft = {
			file: new File(['body'], 'body.md'),
			properties,
			update: jasmine.createSpy('update'),
			setValid: jasmine.createSpy('setValid'),
		};
		TestBed.configureTestingModule({
			imports: [StandardContentImportComponent],
			providers: [...legacyTestProviders(), { provide: DOCUMENT_IMPORT_DRAFT, useValue: draft }],
		});
		const fixture = TestBed.createComponent(StandardContentImportComponent);
		fixture.componentInstance.layoutContext = documentLayoutContext({
			documentType,
			mode: 'import',
			parentDocument: { uid: 'parent' },
		});
		fixture.detectChanges();
		return { fixture, draft, layout: fixture.componentInstance };
	}

	it('starts from the draft and reports edited properties and validity', () => {
		const { fixture, draft, layout } = create('Video', {
			'dc:title': 'clip.mp4',
			'dc:subjects': ['art'],
		});
		const title = fixture.nativeElement.querySelector('#import-title') as HTMLInputElement;
		expect(title.value).toBe('clip.mp4');
		expect(fixture.nativeElement.querySelector('#import-format')).toBeNull();
		expect(draft.setValid).toHaveBeenCalledWith(true);
		layout.form.get('dc:description')!.setValue('Launch');
		expect(draft.update).toHaveBeenCalledWith({
			'dc:title': 'clip.mp4',
			'dc:description': 'Launch',
			'dc:nature': null,
			'dc:subjects': ['art'],
			'dc:coverage': null,
			'dc:expired': null,
		});
		layout.form.get('dc:title')!.setValue('');
		expect(draft.setValid).toHaveBeenCalledWith(false);
	});

	it('edits the Note format the host derived from the file', () => {
		const { fixture, draft, layout } = create('Note', {
			'dc:title': 'body.md',
			'note:mime_type': 'text/x-web-markdown',
		});
		const format = fixture.nativeElement.querySelector('#import-format') as HTMLSelectElement;
		expect(format.value).toBe('text/x-web-markdown');
		layout.form.get('note:mime_type')!.setValue('text/plain');
		expect(draft.update.calls.mostRecent().args[0]['note:mime_type']).toBe('text/plain');
	});

	it('keeps earlier vocabulary choices when the fields report one change', () => {
		const { draft, layout } = create('Audio', { 'dc:title': 'song.mp3', 'dc:coverage': 'europe' });
		layout.form.get('common')!.setValue({ 'dc:nature': 'article' });
		const properties = draft.update.calls.mostRecent().args[0];
		expect(properties['dc:nature']).toBe('article');
		expect(properties['dc:coverage']).toBe('europe');
	});
});
