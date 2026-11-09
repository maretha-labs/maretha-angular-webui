import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { WebUiLocale } from '@maretha/webui-sdk';
import { Subject } from 'rxjs';
import { AutomationsService } from '../../../helpers/automations.service';
import { VocabularyComponent } from './vocabulary.component';

describe('VocabularyComponent', () => {
	let component: VocabularyComponent;
	let fixture: ComponentFixture<VocabularyComponent>;
	let requests: Subject<unknown[]>[];
	let getEntries: jasmine.Spy;
	beforeEach(async () => {
		requests = [];
		getEntries = jasmine.createSpy().and.callFake(() => {
			const request = new Subject<unknown[]>();
			requests.push(request);
			return request.asObservable();
		});
		await TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{ provide: AutomationsService, useValue: { getDirectoryEntries: getEntries } },
			],
			imports: [VocabularyComponent],
		}).compileComponents();
		TestBed.inject(WebUiLocale).setLocale('es');
		fixture = TestBed.createComponent(VocabularyComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('directoryName', 'customer-directory');
		fixture.componentRef.setInput('entryTranslationPrefix', 'country');
		fixture.detectChanges();
	});
	it('refreshes server-localized choices while preserving selected IDs, query and custom literals', fakeAsync(() => {
		const changed = jasmine.createSpy();
		component.registerOnChange(changed);
		component.writeValue({ id: 'custom', label: 'Original customer label' });
		component.searchTerm$.next('typed query');
		tick(301);
		expect(getEntries).toHaveBeenCalledWith('customer-directory', 'typed query', true, true, 'es');
		requests[0].next([
			{ id: 'custom', displayLabel: 'Etiqueta del servidor' },
			{ id: 'label.loadMore' },
		]);
		fixture.detectChanges();
		expect(component.formControl.value).toEqual(
			jasmine.objectContaining({ id: 'custom', label: 'Etiqueta del servidor' }),
		);
		TestBed.inject(WebUiLocale).setLocale('ar');
		fixture.detectChanges();
		TestBed.tick();
		expect(getEntries).toHaveBeenCalledWith('customer-directory', 'typed query', true, true, 'ar');
		expect(requests[0].observers.length).toBe(0);
		requests[1].next([{ id: 'custom', displayLabel: 'document.trash' }, { id: 'label.loadMore' }]);
		fixture.detectChanges();
		expect(component.formControl.value.label).toBe('document.trash');
		expect(fixture.nativeElement.textContent).toContain('document.trash');
		expect(changed).not.toHaveBeenCalled();
		component.writeValue('label.loadMore');
		expect(component.formControl.value.label).toBe('label.loadMore');
		fixture.destroy();
		expect(requests[1].observers.length).toBe(0);
	}));
	it('associates the field label with the focusable combobox input rather than its wrapper', () => {
		fixture.componentRef.setInput('id', 'customer-vocabulary');
		fixture.componentRef.setInput('label', 'Customer {label}');
		fixture.detectChanges();
		const input: HTMLInputElement = fixture.nativeElement.querySelector('input[role="combobox"]');
		const label: HTMLLabelElement = fixture.nativeElement.querySelector('label');
		expect(label.control).toBe(input);
		expect(input.labels?.[0]).toBe(label);
		expect(label.textContent).toBe('Customer {label}');
		label.click();
		expect(document.activeElement).toBe(input);
	});
	for (const multiple of [false, true]) {
		it(`keeps ${multiple ? 'multiple' : 'single'} selected values and typed queries readable after a theme change`, () => {
			fixture.componentRef.setInput('multiple', multiple);
			fixture.detectChanges();
			const value = { id: 'customer', label: 'Customer {label}' };
			component.writeValue(multiple ? [value] : value);
			fixture.detectChanges();
			const host: HTMLElement = fixture.nativeElement;
			const input: HTMLInputElement = host.querySelector('input[role="combobox"]')!;
			const container = host.querySelector<HTMLElement>('.ng-select-container')!;
			container.style.transition = 'none';
			const label = host.querySelector('.ng-value-label')!;
			input.value = 'Customer query';
			for (const theme of [
				{
					text: '#ffffff',
					background: '#2e2e3e',
					foreground: 'rgb(255, 255, 255)',
					surface: 'rgb(46, 46, 62)',
				},
				{
					text: '#32353f',
					background: '#ffffff',
					foreground: 'rgb(50, 53, 63)',
					surface: 'rgb(255, 255, 255)',
				},
			]) {
				host.style.setProperty('--nuxeo-text-default', theme.text);
				host.style.setProperty('--nuxeo-box', theme.background);
				expect(getComputedStyle(input).color).toBe(theme.foreground);
				expect(getComputedStyle(label).color).toBe(theme.foreground);
				expect(getComputedStyle(container).backgroundColor).toBe(theme.surface);
				expect(input.value).toBe('Customer query');
				expect(label.textContent).toContain('Customer {label}');
			}
		});
	}
	it('exposes selected-value removal as a named keyboard control without bubbling to the combobox', () => {
		fixture.componentRef.setInput('multiple', true);
		fixture.componentRef.setInput('id', 'subjects');
		fixture.detectChanges();
		component.writeValue([
			{ id: 'a', label: 'Customer {one}' },
			{ id: 'b', label: 'Customer two', parentLabel: 'Group' },
		]);
		fixture.detectChanges();
		const remove: HTMLButtonElement = fixture.nativeElement.querySelector('button.ng-value-icon');
		expect(remove.type).toBe('button');
		expect(remove.getAttribute('aria-hidden')).toBeNull();
		expect(remove.getAttribute('aria-label')).toBeTruthy();
		expect(
			document.getElementById(remove.getAttribute('aria-describedby')!)?.textContent,
		).toContain('Customer {one}');
		remove.focus();
		expect(document.activeElement).toBe(remove);
		const parentKey = jasmine.createSpy();
		const parentClick = jasmine.createSpy();
		fixture.nativeElement.addEventListener('keydown', parentKey);
		fixture.nativeElement.addEventListener('click', parentClick);
		const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		remove.dispatchEvent(enter);
		expect(enter.defaultPrevented).toBeFalse();
		expect(parentKey).not.toHaveBeenCalled();
		remove.click();
		fixture.detectChanges();
		expect(component.formControl.value.map((item: any) => item.id)).toEqual(['b']);
		expect(document.activeElement).toBe(
			fixture.nativeElement.querySelector('input[role="combobox"]'),
		);
		expect(parentClick).not.toHaveBeenCalled();
		component.setDisabledState(true);
		fixture.detectChanges();
		const remaining: HTMLButtonElement =
			fixture.nativeElement.querySelector('button.ng-value-icon');
		expect(remaining.disabled).toBeTrue();
		remaining.click();
		expect(component.formControl.value.map((item: any) => item.id)).toEqual(['b']);
	});
});
