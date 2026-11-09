import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';
import { ResultsSortBarComponent } from './results-sort-bar.component';

describe('ResultsSortBarComponent', () => {
	it('shows the host sort and reports field and order changes, as stock nuxeo-sort-select', () => {
		TestBed.configureTestingModule({ providers: [...legacyTestProviders()] });
		const fixture = TestBed.createComponent(ResultsSortBarComponent);
		fixture.componentRef.setInput('options', [
			{ field: 'dc:title', label: 'Title' },
			{ field: 'dc:modified', label: 'Modified' },
		]);
		fixture.componentRef.setInput('field', 'dc:modified');
		fixture.componentRef.setInput('ascending', false);
		fixture.detectChanges();
		const root: HTMLElement = fixture.nativeElement;
		const select = root.querySelector('select')!;
		expect(root.querySelector('label')?.textContent).toContain('Sort by');
		expect(select.value).toBe('dc:modified');
		const fields: string[] = [];
		let toggles = 0;
		fixture.componentInstance.fieldChange.subscribe((field) => fields.push(field));
		fixture.componentInstance.orderToggle.subscribe(() => toggles++);
		select.value = 'dc:title';
		select.dispatchEvent(new Event('change'));
		root.querySelector<HTMLButtonElement>('.nx-sort-bar__order')!.click();
		expect(fields).toEqual(['dc:title']);
		expect(toggles).toBe(1);
		fixture.componentRef.setInput('disabled', true);
		fixture.detectChanges();
		expect(select.disabled).toBeTrue();
		expect(root.querySelector<HTMLButtonElement>('.nx-sort-bar__order')!.disabled).toBeTrue();
	});
});
