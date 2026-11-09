import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import {
	DocumentComparisonResolverService,
	nativeDirectoryLabel,
} from './document-comparison-resolver.service';
import { ComparisonProperty } from './document-comparison.service';

describe('Comparison metadata resolution', () => {
	let service: DocumentComparisonResolverService;
	let http: HttpTestingController;
	const property = (kind: string, directoryName?: string) =>
		({ name: 'custom', kind, directoryName }) as ComparisonProperty;
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		service = TestBed.inject(DocumentComparisonResolverService);
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => http.verify());
	it('translates explicit built-in nature catalog labels without interpreting customer labels', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('nature-label-test', {
			'en-US': { 'label.directories.nature.booklet': 'Booklet', Customer: 'Do not translate' },
		});
		expect(nativeDirectoryLabel('label.directories.nature.booklet', 'nature', messages)).toBe(
			'Booklet',
		);
		expect(
			nativeDirectoryLabel('label.directories.nature.booklet', 'customer-directory', messages),
		).toBe('label.directories.nature.booklet');
		expect(nativeDirectoryLabel('Customer', 'nature', messages)).toBe('Customer');
	});
	it('selects the current localized directory label while preserving catalog-like customer text', () => {
		TestBed.inject(WebUiLocale).setLocale('pt-PT');
		let label: string | undefined;
		service
			.resolve(property('directoryEntry', 'customer/name'), 'id/#')
			.subscribe((v) => (label = v));
		http
			.expectOne((r) => r.url.endsWith('/directory/customer%2Fname/id%2F%23'))
			.flush({
				properties: {
					label_pt_PT: 'command.retry',
					label_pt: 'Idioma genérico',
					label_en: 'English',
				},
			});
		expect(label).toBe('command.retry');
		service.resolve(property('directoryEntry', 'custom'), 'id').subscribe((v) => (label = v));
		http.expectOne((r) => r.url.endsWith('/directory/custom/id')).flush({ id: 'literal-id' });
		expect(label).toBe('literal-id');
	});
	it('uses identity fallbacks and contains inaccessible references without leaking server errors', () => {
		for (const [kind, response, expected] of [
			['user', { properties: { username: 'customer' } }, 'customer'],
			['user', { id: 'uid' }, 'uid'],
			['document', { properties: { 'dc:title': 'Customer {title}' } }, 'Customer {title}'],
			['document', { title: 'Legacy title' }, 'Legacy title'],
			['document', { uid: 'literal-id' }, 'literal-id'],
		] as const) {
			let label: string | undefined;
			service.resolve(property(kind), 'one').subscribe((v) => (label = v));
			http.expectOne((r) => r.url.endsWith('/one')).flush(response);
			expect(label).toBe(expected);
		}
		for (const kind of ['user', 'document', 'directoryEntry']) {
			let label: string | undefined = 'unchanged';
			service.resolve(property(kind, 'custom'), 'denied').subscribe((v) => (label = v));
			http
				.expectOne((r) => r.url.endsWith('/denied'))
				.flush('secret server detail', { status: 403, statusText: 'Forbidden' });
			expect(label).toBeUndefined();
		}
	});
});
