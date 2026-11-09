import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BsDatepickerDirective } from 'ngx-bootstrap/datepicker';
import { of } from 'rxjs';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { AutomationsService } from '../../helpers/automations.service';
import { StandardContentEditorComponent } from './standard-content-editor.component';
import { StandardContentFieldsComponent } from './standard-content-fields.component';

describe('Standard content fields calendar Escape handling', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [StandardContentEditorComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: AutomationsService, useValue: { getDirectoryEntries: () => of([]) } },
			],
		});
	});
	function render() {
		const fixture = TestBed.createComponent(StandardContentEditorComponent);
		fixture.componentRef.setInput('documentType', 'Picture');
		fixture.componentRef.setInput('parentDocument', { uid: 'parent' });
		fixture.detectChanges();
		const fields = fixture.debugElement.query(By.directive(StandardContentFieldsComponent))
			.componentInstance as StandardContentFieldsComponent;
		const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.calendar-toggle');
		return { fixture, fields, toggle };
	}
	it('ignores other keys and Escape while the calendar is already closed', () => {
		const { fixture, fields, toggle } = render();
		document.body.append(fixture.nativeElement);
		const picker = {
			isOpen: false,
			hide: jasmine.createSpy('hide'),
		} as unknown as BsDatepickerDirective;
		const outer = jasmine.createSpy('outer Escape');
		window.addEventListener('keydown', outer);
		try {
			fields.onCalendarShown(picker, toggle);
			const key = (key: string) =>
				new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
			const enter = key('Enter');
			toggle.dispatchEvent(enter);
			expect(enter.defaultPrevented).toBeFalse();
			const closedEscape = key('Escape');
			toggle.dispatchEvent(closedEscape);
			expect(closedEscape.defaultPrevented).toBeFalse();
			expect(picker.hide).not.toHaveBeenCalled();
			expect(outer).toHaveBeenCalledTimes(2);
			(picker as { isOpen: boolean }).isOpen = true;
			const openEscape = key('Escape');
			toggle.dispatchEvent(openEscape);
			expect(openEscape.defaultPrevented).toBeTrue();
			expect(picker.hide).toHaveBeenCalledTimes(1);
			expect(document.activeElement).toBe(toggle);
			expect(outer).toHaveBeenCalledTimes(2);
			fields.onCalendarHidden();
			toggle.dispatchEvent(key('Escape'));
			expect(picker.hide).toHaveBeenCalledTimes(1);
			expect(outer).toHaveBeenCalledTimes(3);
		} finally {
			window.removeEventListener('keydown', outer);
			fixture.destroy();
		}
	});
	it('flags the expiration field only once it is touched and invalid', () => {
		const { fixture, fields } = render();
		const expiration = fields.formGroup.controls['dc:expired'];
		expect(fields.expirationInvalid).toBeFalse();
		expiration.markAsTouched();
		expect(fields.expirationInvalid).toBeFalse();
		expiration.setErrors({ bsDate: { invalid: 'not a date' } });
		fixture.detectChanges();
		expect(fields.expirationInvalid).toBeTrue();
		const input: HTMLInputElement = fixture.nativeElement.querySelector(
			`#${fields.fieldIdPrefix}-expired`,
		);
		expect(input?.getAttribute('aria-invalid') ?? 'true').toBe('true');
		expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
		fixture.destroy();
	});
	it('does not register a listener when the document has no window', () => {
		const { fixture, fields, toggle } = render();
		const picker = {
			isOpen: true,
			hide: jasmine.createSpy('hide'),
		} as unknown as BsDatepickerDirective;
		const addEventListener = spyOn(window, 'addEventListener').and.callThrough();
		spyOnProperty(document, 'defaultView').and.returnValue(null);
		fields.onCalendarShown(picker, toggle);
		expect(addEventListener).not.toHaveBeenCalledWith('keydown', jasmine.any(Function), true);
		fields.onCalendarHidden();
		fixture.destroy();
	});
});
