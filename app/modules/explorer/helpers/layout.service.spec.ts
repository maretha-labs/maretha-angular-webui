import { WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';

import { LayoutService } from './layout.service';

describe('LayoutService', () => {
	let service: LayoutService;
	let previousSortFields: string | null;

	beforeEach(() => {
		previousSortFields = localStorage.getItem('availableSortFields');
		localStorage.removeItem('availableSortFields');
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(LayoutService);
	});

	afterEach(() => {
		if (previousSortFields === null) localStorage.removeItem('availableSortFields');
		else localStorage.setItem('availableSortFields', previousSortFields);
	});
	it('should be created', () => {
		expect(service).toBeTruthy();
	});
	it('localizes stock sort labels while retaining explicitly customized labels and unknown fields', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('sort-test', {
			es: { 'app.columns.title': 'Título' },
			ar: { 'app.columns.title': 'العنوان' },
		});
		const locale = TestBed.inject(WebUiLocale);
		locale.setLocale('es');
		expect(service.sortLabel('dc:title', 'Title')).toBe('Título');
		locale.setLocale('ar');
		expect(service.sortLabel('dc:title', 'Title')).toBe('العنوان');
		expect(service.sortLabel(undefined, undefined)).toBe('');
		expect(service.sortLabel('custom:field', 'app.columns.title')).toBe('app.columns.title');
		service.availableSortFields = { 'dc:title': 'Customer {title}' };
		expect(service.sortLabel('dc:title', 'Customer {title}')).toBe('Customer {title}');
	});
});
