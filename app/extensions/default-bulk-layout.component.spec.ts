import { TestBed } from '@angular/core/testing';
import { BulkUpdateMode } from './bulk-layout';
import { DefaultBulkLayoutComponent } from './default-bulk-layout.component';
import { WebUiMessages } from './webui-messages';

describe('Default bulk layout compatibility', () => {
	it('accepts existing field literals without translation metadata in fields and methods', () => {
		const component = TestBed.runInInjectionContext(() => new DefaultBulkLayoutComponent());
		const commit = jasmine.createSpy('commit');
		component.context = { documents: [], changes: [], commit };
		const field = {
			property: 'customer:category',
			label: 'sdk.bulk.nature',
			multiple: false,
			date: false,
			mode: 'keep' as BulkUpdateMode,
			value: '',
		};
		component.fields = [field];
		component.mode(field, 'replace');
		expect(component.fieldError(field)).toBe('Choose a value before applying this change.');
		component.value(field, 'Customer category');
		expect(component.fieldError(field)).toBe('');
		expect(commit).toHaveBeenCalledWith([
			{ property: 'customer:category', mode: 'replace', value: 'Customer category' },
		]);
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', { fr: { 'sdk.bulk.nature': 'Nature traduite' } });
		messages.locale.set('fr');
		expect(component.fieldLabel(field)).toBe('sdk.bulk.nature');
		expect(field.value).toBe('Customer category');
	});
	it('translates explicitly keyed defaults and retains list values while changing language', () => {
		const component = TestBed.runInInjectionContext(() => new DefaultBulkLayoutComponent());
		component.context = { documents: [], changes: [], commit: jasmine.createSpy('commit') };
		const field = component.fields.find((candidate) => candidate.property === 'dc:subjects')!;
		component.mode(field, 'addValues');
		component.value(field, 'customer-id');
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', { fr: { 'sdk.bulk.subjects': 'Sujets' } });
		messages.locale.set('fr');
		expect(component.fieldLabel(field)).toBe('Sujets');
		expect(field.value).toEqual(['customer-id']);
	});
});
