import { Component, input, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { REPOSITORY_SEARCH } from '../../helpers/repository-search-definitions';
import { SearchFormOutletComponent } from './search-form-outlet.component';

@Component({ template: '<button (click)="search().submit()">{{ search().text }}</button>' })
class CustomFormComponent {
	readonly search = input.required<{ text: string; submit: () => void }>();
}

@Component({ template: '<span>Other form</span>' })
class OtherFormComponent {}

describe('Per-search form outlet', () => {
	it('reserves drawer space and announces loading while a first-use form chunk is pending', async () => {
		let resolveForm!: (component: Type<unknown>) => void;
		const pending = new Promise<Type<unknown>>((resolve) => (resolveForm = resolve));
		const fixture = TestBed.createComponent(SearchFormOutletComponent);
		fixture.componentRef.setInput('definition', {
			...REPOSITORY_SEARCH.trash,
			form: { ...REPOSITORY_SEARCH.trash.form, loadComponent: () => pending },
		});
		fixture.detectChanges();
		const placeholder = fixture.nativeElement.querySelector('[role="status"]');
		expect(placeholder).not.toBeNull();
		expect(placeholder.classList.contains('search-form-placeholder--drawer')).toBeTrue();
		expect(fixture.nativeElement.querySelector('span')).toBeNull();
		resolveForm(OtherFormComponent);
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
		expect(fixture.nativeElement.textContent).toContain('Other form');
	});
	it('loads only the chosen component and leaves request ownership with its controller', async () => {
		const load = jasmine.createSpy('load').and.resolveTo(CustomFormComponent);
		const search = { text: 'Custom filters', submit: jasmine.createSpy('submit') };
		const fixture = TestBed.createComponent(SearchFormOutletComponent);
		fixture.componentRef.setInput('definition', {
			...REPOSITORY_SEARCH.trash,
			form: { ...REPOSITORY_SEARCH.trash.form, loadComponent: load },
		});
		fixture.componentRef.setInput('inputs', { search });
		expect(load).not.toHaveBeenCalled();
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(load).toHaveBeenCalledTimes(1);
		expect(fixture.nativeElement.textContent).toContain('Custom filters');
		expect(search.submit).not.toHaveBeenCalled();
		fixture.nativeElement.querySelector('button').click();
		expect(search.submit).toHaveBeenCalledTimes(1);
		fixture.componentRef.setInput('inputs', { search: { ...search, text: 'Updated filters' } });
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Updated filters');
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('does not mount a stale form after its definition changes', async () => {
		let resolveFirst!: (component: Type<unknown>) => void;
		const first = new Promise<Type<unknown>>((resolve) => (resolveFirst = resolve));
		const fixture = TestBed.createComponent(SearchFormOutletComponent);
		fixture.componentRef.setInput('definition', {
			...REPOSITORY_SEARCH.trash,
			form: { ...REPOSITORY_SEARCH.trash.form, loadComponent: () => first },
		});
		fixture.detectChanges();
		fixture.componentRef.setInput('definition', {
			...REPOSITORY_SEARCH.trash,
			form: { ...REPOSITORY_SEARCH.trash.form, loadComponent: async () => OtherFormComponent },
		});
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Other form');
		resolveFirst(CustomFormComponent);
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('button')).toBeNull();
	});
});
