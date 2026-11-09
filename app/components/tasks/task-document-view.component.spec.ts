import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DocumentAttachmentsService } from 'app/modules/explorer/helpers/document-attachments.service';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TaskDocumentViewComponent, taskDocumentPreview } from './task-document-view.component';

describe('Task document view', () => {
	const document = (mimeType: string, extra: Record<string, unknown> = {}) => ({
		uid: 'doc',
		title: 'FILE',
		changeToken: '7',
		contextParameters: {
			renditions: [
				{ name: 'thumbnail', url: 'https://nuxeo.test/thumbnail' },
				{ name: 'pdf', url: 'https://nuxeo.test/pdf' },
			],
		},
		ng: {
			attachment: {
				name: 'Download.jpg',
				length: 1_551_892,
				'mime-type': mimeType,
				data: 'https://nuxeo.test/blob',
			},
		},
		...extra,
	});

	it('previews the main file as the document page does', () => {
		expect(taskDocumentPreview(document('image/jpeg')).kind).toBe('image');
		expect(taskDocumentPreview(document('video/mp4')).kind).toBe('video');
		expect(taskDocumentPreview(document('audio/mpeg')).kind).toBe('audio');
		expect(taskDocumentPreview(document('application/pdf'))).toEqual({
			kind: 'pdf',
			contentUrl: 'https://nuxeo.test/blob',
			thumbnailUrl: 'https://nuxeo.test/thumbnail',
		});
		expect(taskDocumentPreview(document('application/msword')).contentUrl).toBe(
			'https://nuxeo.test/pdf?changeToken=7',
		);
		expect(taskDocumentPreview(document('application/zip')).kind).toBe('none');
		expect(taskDocumentPreview({ ...document('image/png'), ng: {} }).kind).toBe('none');
		expect(taskDocumentPreview(null)).toEqual({ kind: 'none', contentUrl: '', thumbnailUrl: '' });
	});

	it('shows the thumbnail and the main blob row, and downloads the main blob', () => {
		TestBed.configureTestingModule({
			imports: [TaskDocumentViewComponent],
			providers: legacyTestProviders(),
		});
		const download = spyOn(
			TestBed.inject(DocumentAttachmentsService),
			'downloadDocumentBlob',
		).and.returnValue(of(undefined));
		const fixture = TestBed.createComponent(TaskDocumentViewComponent);
		const model = document('application/zip');
		fixture.componentRef.setInput('document', model);
		fixture.detectChanges();
		const view: HTMLElement = fixture.nativeElement;
		expect(view.querySelector('img.thumbnail')!.getAttribute('src')).toBe(
			'https://nuxeo.test/thumbnail',
		);
		expect(view.querySelector('.blob-info span')!.textContent!.trim()).toBe('Download.jpg');
		expect(view.querySelector('.blob-info small')!.textContent!.trim()).toMatch(/^1\.48 /);
		view.querySelector<HTMLButtonElement>('.blob button')!.click();
		expect(download).toHaveBeenCalledOnceWith(model, model.ng.attachment);
	});
});
