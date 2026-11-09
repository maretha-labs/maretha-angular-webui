import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { StandardContentFieldsComponent } from './standard-content-fields.component';
import { WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import { of } from 'rxjs';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { AutomationsService } from '../../helpers/automations.service';
import { StandardContentEditorComponent } from './standard-content-editor.component';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { BsDatepickerDirective } from 'ngx-bootstrap/datepicker';

describe('Standard content editor field accessibility', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [StandardContentEditorComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: AutomationsService, useValue: { getDirectoryEntries: () => of([]) } },
			],
		});
	});
	function render(type = 'PictureBook') {
		const fixture = TestBed.createComponent(StandardContentEditorComponent);
		fixture.componentRef.setInput('documentType', type);
		fixture.componentRef.setInput('parentDocument', { uid: 'parent' });
		fixture.detectChanges();
		return fixture;
	}
	it('closes only the calendar on Escape and restores normal Escape handling afterward', () => {
		const fixture = render('Picture');
		document.body.append(fixture.nativeElement);
		const input = fixture.debugElement.query(By.directive(BsDatepickerDirective));
		const picker = input.injector.get(BsDatepickerDirective);
		const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.calendar-toggle');
		const modalEscape = jasmine.createSpy('modal Escape');
		window.addEventListener('keydown', modalEscape);
		try {
			toggle.click();
			fixture.detectChanges();
			expect(picker.isOpen).toBeTrue();
			input.nativeElement.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
			);
			expect(picker.isOpen).toBeFalse();
			expect(modalEscape).not.toHaveBeenCalled();
			expect(document.activeElement).toBe(toggle);
			toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			expect(modalEscape).toHaveBeenCalledTimes(1);
			toggle.click();
			fixture.detectChanges();
			expect(picker.isOpen).toBeTrue();
			fixture.destroy();
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
			expect(modalEscape).toHaveBeenCalledTimes(2);
		} finally {
			window.removeEventListener('keydown', modalEscape);
		}
	});
	it('does not load supplemental schema metadata without a registered field extension', () => {
		const gateway = spyOn(
			TestBed.inject(DocumentLayoutGatewayService),
			'readDocumentType',
		).and.resolveTo({ name: 'File', schemas: [] });
		const fixture = render('File');
		expect(fixture.nativeElement.querySelector('nx-supplemental-document-fields')).toBeNull();
		expect(gateway).not.toHaveBeenCalled();
	});
	it('keeps labels and title errors associated with their own editor when two forms are mounted', () => {
		const fixtures = [render(), render()];
		for (const fixture of fixtures) document.body.append(fixture.nativeElement);
		const ids = new Set<string>();
		expect(
			fixtures[0].nativeElement.querySelector('nx-base-editor h2.modal-title.h4'),
		).not.toBeNull();
		for (const fixture of fixtures) {
			const input: HTMLInputElement = fixture.nativeElement.querySelector(
				'[formControlName="dc:title"]',
			);
			const description: HTMLTextAreaElement = fixture.nativeElement.querySelector(
				'[formControlName="dc:description"]',
			);
			for (const field of [input, description]) {
				expect(field.id).toBeTruthy();
				expect(ids.has(field.id)).toBeFalse();
				ids.add(field.id);
				expect(field.labels?.length).toBe(1);
				expect(fixture.nativeElement.contains(field.labels?.[0])).toBeTrue();
			}
			expect(input.getAttribute('aria-invalid')).toBeNull();
			expect(input.getAttribute('aria-describedby')).toBeNull();
			input.dispatchEvent(new Event('blur'));
			fixture.detectChanges();
			expect(input.getAttribute('aria-invalid')).toBe('true');
			const message = document.getElementById(input.getAttribute('aria-describedby')!);
			expect(message?.getAttribute('role')).toBe('alert');
			expect(message?.textContent).toContain('Please specify a title.');
			expect(fixture.nativeElement.contains(message)).toBeTrue();
			input.value = 'Customer {title}';
			input.dispatchEvent(new Event('input'));
			fixture.detectChanges();
			expect(input.getAttribute('aria-invalid')).toBeNull();
			expect(input.getAttribute('aria-describedby')).toBeNull();
			expect(message?.isConnected).toBeFalse();
			expect(
				fixture.nativeElement.querySelector('nx-base-editor [role="alert"]').textContent.trim(),
			).toBe('');
		}
	});
	it('updates associated validation text and labels across locales without replacing the field or changing the draft', () => {
		TestBed.inject(WebUiMessages).register('editor-a11y', {
			es: {
				'label.dublincore.title': 'Título',
				'app.modules.standard-content-editor.please-specify-a-title-92e0dc': 'Indique un título.',
			},
			ar: {
				'label.dublincore.title': 'العنوان',
				'app.modules.standard-content-editor.please-specify-a-title-92e0dc': 'يرجى تحديد عنوان.',
			},
		});
		const locale = TestBed.inject(WebUiLocale);
		locale.setLocale('es');
		const fixture = render();
		const input: HTMLInputElement = fixture.nativeElement.querySelector(
			'[formControlName="dc:title"]',
		);
		const description: HTMLInputElement = fixture.nativeElement.querySelector(
			'[formControlName="dc:description"]',
		);
		description.value = 'Customer {description}';
		description.dispatchEvent(new Event('input'));
		input.dispatchEvent(new Event('blur'));
		fixture.detectChanges();
		const messageId = input.getAttribute('aria-describedby')!;
		expect(document.getElementById(messageId)?.textContent).toContain('Indique un título.');
		locale.setLocale('ar');
		fixture.detectChanges();
		expect(input.getAttribute('aria-describedby')).toBe(messageId);
		expect(document.getElementById(messageId)?.textContent).toContain('يرجى تحديد عنوان.');
		expect(input.labels?.[0].textContent).toContain('العنوان');
		expect(fixture.nativeElement.querySelector('[formControlName="dc:title"]')).toBe(input);
		expect(description.value).toBe('Customer {description}');
		expect(fixture.componentInstance.editorForm?.dirty).toBeTrue();
	});
	it('gives nested directory/date fields unique labels and associates invalid expiration feedback', () => {
		const fixtures = [render('Note'), render('Video')];
		for (const fixture of fixtures) document.body.append(fixture.nativeElement);
		const ids = new Set<string>();
		for (const fixture of fixtures) {
			const controls: NodeListOf<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> =
				fixture.nativeElement.querySelectorAll('input, select, textarea');
			for (const control of controls) {
				expect(control.id).withContext(control.outerHTML).toBeTruthy();
				expect(ids.has(control.id)).withContext(control.id).toBeFalse();
				ids.add(control.id);
				expect(control.labels?.length).withContext(control.outerHTML).toBe(1);
			}
			const fields = fixture.debugElement.query(By.directive(StandardContentFieldsComponent))
				.componentInstance as StandardContentFieldsComponent;
			const input: HTMLInputElement = fixture.nativeElement.querySelector(
				'[formControlName="dc:expired"]',
			);
			expect(input.getAttribute('aria-invalid')).toBeNull();
			expect(
				(input.labels?.[0]?.compareDocumentPosition(input) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
			expect(input.closest('.form-floating')).toBeNull();
			fields.formGroup.controls['dc:expired'].setErrors({ bsDate: true });
			fields.formGroup.controls['dc:expired'].markAsTouched();
			input.dispatchEvent(new Event('blur'));
			fixture.detectChanges();
			expect(input.getAttribute('aria-invalid')).toBe('true');
			const error = document.getElementById(input.getAttribute('aria-describedby')!);
			expect(error?.textContent).toContain('Enter a valid date.');
			expect(error?.getAttribute('role')).toBe('alert');
			fields.formGroup.controls['dc:expired'].setErrors(null);
			input.dispatchEvent(new Event('blur'));
			fixture.detectChanges();
			expect(input.getAttribute('aria-describedby')).toBeNull();
		}
	});
	it('handles file selection, clearing, deactivation, close, save and input changes on StandardContentEditorComponent', () => {
		const fixture = render('File');
		const component = fixture.componentInstance;
		expect(component.canDeactivate()).toBeTrue();
		const file = new File(['data'], 'report.pdf', { type: 'application/pdf' });
		component.selectFile({ target: { files: [file], value: 'report.pdf' } } as unknown as Event);
		expect(component.editorForm?.get('file:content')?.value).toBe(file);
		component.selectFile({ target: { files: [], value: '' } } as unknown as Event);
		expect(component.editorForm?.get('file:content')?.value).toBe(file);
		component.clearFile();
		expect(component.editorForm?.get('file:content')?.value).toBeNull();
		fixture.componentRef.setInput('documentType', 'Audio');
		fixture.detectChanges();
		expect(component.supplementalContext?.documentType).toBe('audio');
		const saved: any[] = [];
		component.save$.subscribe((val) => saved.push(val));
		component.saved([{ uid: 'audio-1' }]);
		expect(saved.length).toBe(1);
		component.close();
		fixture.destroy();
	});
});
