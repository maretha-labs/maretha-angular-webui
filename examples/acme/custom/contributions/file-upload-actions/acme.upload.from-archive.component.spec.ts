import { TestBed } from '@angular/core/testing';
import type { FileUploadContext } from '@maretha/webui-sdk';
import { AcmeUploadFromArchiveComponent } from './acme.upload.from-archive.component';

describe('AcmeUploadFromArchiveComponent', () => {
	const render = (context: Partial<FileUploadContext>) => {
		const fixture = TestBed.createComponent(AcmeUploadFromArchiveComponent);
		fixture.componentRef.setInput('context', {
			disabled: false,
			multiple: true,
			allowedMimeTypes: [],
			label: 'Choose files',
			chooseFiles: () => undefined,
			...context,
		} as FileUploadContext);
		fixture.detectChanges();
		return fixture;
	};

	it('hands archived files to the host', async () => {
		const addFiles = jasmine.createSpy('addFiles');
		const fixture = render({ addFiles });
		expect(fixture.nativeElement.textContent).toContain('From archive');
		await fixture.componentInstance.run();
		expect(addFiles).toHaveBeenCalledOnceWith([]);
	});

	it('is disabled where the host accepts no extra sources', () => {
		expect(render({}).nativeElement.querySelector('button').disabled).toBeTrue();
	});
});
