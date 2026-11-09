import { WebUiMessages } from '@maretha/webui-sdk';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { provideDefaultFileActions } from 'app/modules/explorer/components/document-attachments/default-file-actions';
import { FileUploadComponent } from './file-upload.component';

describe('FileUploadComponent', () => {
	let component: FileUploadComponent;
	let fixture: ComponentFixture<FileUploadComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders(), provideDefaultFileActions()],
			imports: [FileUploadComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(FileUploadComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('updates the default picker label by locale but preserves explicit customer tooltips', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('upload-locale', {
			fr: {
				'app.labels.you-can-either-manually-select-files-or-drag--ced9be':
					'Choisir ou déposer des fichiers',
			},
		});
		const initial = component.uploadContext;
		messages.locale.set('fr');
		expect(component.uploadContext.label).toBe('Choisir ou déposer des fichiers');
		expect(component.uploadContext).not.toBe(initial);
		component.tooltip = 'Customer picker';
		expect(component.uploadContext.label).toBe('Customer picker');
		messages.locale.set('en-US');
		expect(component.tooltip).toBe('Customer picker');
		component.tooltip = undefined;
		expect(component.tooltip).toContain('manually select files');
	});
	it('tracks drag feedback and rejects disallowed dropped files without selecting them', () => {
		const emit = spyOn(component.update, 'emit');
		const error = spyOn(component.error, 'emit');
		component.allowedMimeTypes = ['text/plain'];
		component.filesDragged(true);
		expect(component.fileOver).toBeTrue();
		const invalid = new File(['x'], 'image.png', { type: 'image/png' });
		component.filesDropped([invalid]);
		expect(error).toHaveBeenCalledWith({ error: 'Invalid MIME type', file: invalid });
		expect(emit).not.toHaveBeenCalled();
		component.filesDragged(false);
		expect(component.fileOver).toBeFalse();
	});
	it('should create', () => {
		expect(component).toBeTruthy();
	});
	it('captures the live native FileList before clearing and supports reselection', () => {
		fixture.componentRef.setInput('multiple', true);
		fixture.detectChanges();
		const input = component.fileInput!.nativeElement;
		const first = new File(['first'], 'first.txt', { type: 'text/plain' });
		const second = new File(['second'], 'second.txt', { type: 'text/plain' });
		const emit = spyOn(component.update, 'emit');
		for (let attempt = 0; attempt < 2; attempt++) {
			const selected = new DataTransfer();
			selected.items.add(first);
			selected.items.add(second);
			input.files = selected.files;
			input.dispatchEvent(new Event('change', { bubbles: true }));
			expect(input.files?.length).toBe(0);
			expect(emit.calls.mostRecent().args[0]).toEqual([first, second]);
		}
		expect(emit).toHaveBeenCalledTimes(2);
	});
	it('rejects a native selection without emitting it, then accepts a valid reselection', () => {
		fixture.componentRef.setInput('allowedMimeTypes', ['text/plain']);
		fixture.detectChanges();
		const input = component.fileInput!.nativeElement;
		const emit = spyOn(component.update, 'emit');
		const error = spyOn(component.error, 'emit');
		const invalid = new DataTransfer();
		invalid.items.add(new File(['x'], 'image.png', { type: 'image/png' }));
		input.files = invalid.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		expect(error).toHaveBeenCalledTimes(1);
		expect(emit).not.toHaveBeenCalled();
		expect(input.files?.length).toBe(0);
		const valid = new DataTransfer();
		const file = new File(['x'], 'text.txt', { type: 'text/plain' });
		valid.items.add(file);
		input.files = valid.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		expect(emit).toHaveBeenCalledOnceWith([file]);
		expect(input.files?.length).toBe(0);
	});
	it('honors disabled state for native selection, drop and contributed picker', () => {
		component.disabled = true;
		const emit = spyOn(component.update, 'emit');
		const click = spyOn(component.fileInput!.nativeElement, 'click');
		const file = new File(['x'], 'x.txt', { type: 'text/plain' });
		component.filesDropped([file]);
		component.fileInputChanged({ target: { files: [file] } });
		component.uploadContext.chooseFiles();
		component.uploadContext.addFiles!([file]);
		expect(emit).not.toHaveBeenCalled();
		expect(click).not.toHaveBeenCalled();
	});
	it('validates MIME wildcards/extensions and resets rejected selections', () => {
		component.allowedMimeTypes = ['IMAGE/*', '.pdf'];
		const emit = spyOn(component.update, 'emit');
		const error = spyOn(component.error, 'emit');
		const image = new File(['x'], 'x.png', { type: 'image/png' });
		const pdf = new File(['x'], 'x.PDF');
		component.multiple = true;
		component.filesDropped([image, pdf]);
		expect(emit).toHaveBeenCalledWith([image, pdf]);
		component.uploadContext.addFiles!([new File(['x'], 'x.txt', { type: 'text/plain' })]);
		expect(error).toHaveBeenCalledTimes(1);
		const target = { files: [new File(['x'], 'unknown')], value: 'unknown' };
		component.fileInputChanged({ target });
		expect(error).toHaveBeenCalled();
		expect(target.value).toBe('');
	});
	it('limits single selection and supports choosing the same file again', () => {
		const file = new File(['x'], 'x.txt');
		const target = { files: [file, file], value: 'x.txt' };
		const emit = spyOn(component.update, 'emit');
		component.fileInputChanged({ target });
		expect(emit).toHaveBeenCalledWith([file]);
		expect(target.value).toBe('');
		component.fileInputChanged({ target });
		expect(emit).toHaveBeenCalledTimes(2);
		const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
		const click = spyOn(component.fileInput!.nativeElement, 'click');
		button.click();
		expect(click).toHaveBeenCalled();
	});
	it('autofocuses the visible picker and does not steal focus again during locale updates', () => {
		fixture.componentRef.setInput('autoFocus', true);
		fixture.detectChanges();
		TestBed.tick();
		const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
		expect(document.activeElement).toBe(button);
		expect(document.activeElement).not.toBe(component.fileInput!.nativeElement);
		const other = document.createElement('button');
		document.body.append(other);
		try {
			other.focus();
			TestBed.inject(WebUiMessages).locale.set('ar');
			fixture.detectChanges();
			TestBed.tick();
			expect(document.activeElement).toBe(other);
			fixture.componentRef.setInput('autoFocus', false);
			fixture.detectChanges();
			TestBed.tick();
			fixture.componentRef.setInput('autoFocus', true);
			fixture.detectChanges();
			TestBed.tick();
			expect(document.activeElement).toBe(button);
		} finally {
			other.remove();
		}
	});
	it('waits until the picker is enabled before applying requested autofocus', () => {
		const other = document.createElement('button');
		document.body.append(other);
		try {
			other.focus();
			fixture.componentRef.setInput('disabled', true);
			fixture.componentRef.setInput('autoFocus', true);
			fixture.detectChanges();
			TestBed.tick();
			expect(document.activeElement).toBe(other);
			fixture.componentRef.setInput('disabled', false);
			fixture.detectChanges();
			TestBed.tick();
			expect(document.activeElement).toBe(fixture.nativeElement.querySelector('button'));
		} finally {
			other.remove();
		}
	});
});
