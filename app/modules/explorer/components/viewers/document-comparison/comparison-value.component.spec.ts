import { WebUiMessages } from '@maretha/webui-sdk';
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideComparisonLayout, ComparisonValueContext } from '@maretha/webui-sdk';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComparisonValueComponent } from './comparison-value.component';
import { ComparisonProperty } from '../../../helpers/document-comparison.service';

@Component({
	standalone: true,
	selector: 'nx-custom-comparison',
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '<span>custom {{ context.value }}</span>',
})
class CustomComparisonComponent {
	static instances = 0;
	@Input() context!: ComparisonValueContext;
	constructor() {
		CustomComparisonComponent.instances++;
	}
}

describe('ComparisonValueComponent', () => {
	let fixture: ComponentFixture<ComparisonValueComponent>;
	const property = (kind: ComparisonProperty['kind']): ComparisonProperty => ({
		name: 'properties.test:value',
		label: 'Test',
		kind,
	});
	const cell = (value: unknown) => ({
		value,
		baseline: undefined,
		changed: false,
		missing: value === undefined,
	});
	beforeEach(async () => {
		CustomComparisonComponent.instances = 0;
		await TestBed.configureTestingModule({
			imports: [ComparisonValueComponent],
			providers: [...legacyTestProviders()],
		}).compileComponents();
		fixture = TestBed.createComponent(ComparisonValueComponent);
		fixture.componentRef.setInput('document', { uid: 'one' });
	});
	function render(kind: ComparisonProperty['kind'], value: unknown): string {
		fixture.componentRef.setInput('property', property(kind));
		fixture.componentRef.setInput('cell', cell(value));
		fixture.detectChanges();
		return fixture.nativeElement.textContent;
	}
	it('renders all nine source categories with Nuxeo values', () => {
		expect(render('default', { nested: 'value' })).toContain('nested:');
		expect(render('blob', { name: 'file.pdf', digest: 'abc' })).toContain('file.pdf');
		expect(render('date', '2026-01-01T00:00:00Z').trim()).toBe(
			new Date('2026-01-01T00:00:00Z').toLocaleString('en-US'),
		);
		expect(render('directoryEntry', 'article')).toContain('article');
		expect(render('directoryEntry[]', ['one', 'two'])).toContain('two');
		expect(render('document', { uid: 'doc-id', title: 'Target' })).toContain('Target');
		expect(render('document[]', [{ uid: 'doc-id', title: 'Target' }])).toContain('Target');
		expect(render('user', 'Administrator')).toContain('Administrator');
		expect(render('user[]', ['Administrator'])).toContain('Administrator');
	});
	it('renders nested attachment filenames and links without blob internals', () => {
		render('default', [
			{
				file: {
					name: 'attachment.pdf',
					'mime-type': 'application/pdf',
					digest: 'secret-digest',
					data: '/nuxeo/nxfile/fixture',
				},
			},
		]);
		const link = fixture.nativeElement.querySelector('a');
		expect(link?.textContent).toBe('attachment.pdf');
		expect(link?.getAttribute('href')).toBe('/nuxeo/nxfile/fixture');
		expect(fixture.nativeElement.textContent).not.toContain('secret-digest');
		expect(fixture.nativeElement.textContent).not.toContain('mime-type');
	});
	it('marks both split sides as changed with accessible change text', () => {
		fixture.componentRef.setInput('property', property('default'));
		fixture.componentRef.setInput('cell', {
			value: 'old',
			baseline: 'new',
			changed: true,
			missing: false,
		});
		fixture.componentRef.setInput('mode', 'split-left');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.deletion')).not.toBeNull();
		expect(fixture.nativeElement.textContent).toContain('modification');
		fixture.componentRef.setInput('mode', 'split-right');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.addition')).not.toBeNull();
	});
	it('preserves a property override instance when its context changes', async () => {
		TestBed.resetTestingModule();
		await TestBed.configureTestingModule({
			imports: [ComparisonValueComponent],
			providers: [
				...legacyTestProviders(),
				provideComparisonLayout({
					id: 'custom',
					property: 'properties.test:value',
					component: CustomComparisonComponent,
				}),
			],
		}).compileComponents();
		fixture = TestBed.createComponent(ComparisonValueComponent);
		fixture.componentRef.setInput('document', { uid: 'one' });
		fixture.componentRef.setInput('property', property('default'));
		fixture.componentRef.setInput('cell', cell('first'));
		fixture.detectChanges();
		fixture.componentRef.setInput('cell', cell('second'));
		fixture.detectChanges();
		expect(CustomComparisonComponent.instances).toBe(1);
		expect(fixture.nativeElement.textContent).toContain('custom second');
	});
	it('drops a delayed user resolution after the target changes', async () => {
		const http = TestBed.inject(HttpTestingController);
		render('user', 'first');
		const first = http.expectOne((request) => request.url.endsWith('/user/first'));
		fixture.componentRef.setInput('cell', cell('second'));
		fixture.detectChanges();
		const second = http.expectOne((request) => request.url.endsWith('/user/second'));
		expect(first.cancelled).toBeTrue();
		second.flush({ properties: { username: 'Second resolved' } });
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Second resolved');
		expect(fixture.nativeElement.textContent).not.toContain('First resolved');
		http.verify();
	});
	it('cancels a resolver when its kind changes to a plain value', () => {
		const http = TestBed.inject(HttpTestingController);
		render('user', 'Administrator');
		const request = http.expectOne((item) => item.url.endsWith('/user/Administrator'));
		render('default', 'plain');
		expect(request.cancelled).toBeTrue();
		expect(fixture.nativeElement.textContent).toContain('plain');
		http.verify();
	});
	it('renders deleted baseline, additions, nested empties and duplicate lines', () => {
		fixture.componentRef.setInput('property', property('default'));
		fixture.componentRef.setInput('cell', {
			value: undefined,
			baseline: 'old',
			changed: true,
			missing: true,
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('old');
		expect(fixture.nativeElement.textContent).toContain('deletion');
		fixture.componentRef.setInput('cell', {
			value: { a: {}, b: [], c: ['same', 'same'] },
			baseline: undefined,
			changed: true,
			missing: false,
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('— empty object —');
		expect(fixture.nativeElement.textContent).toContain('— empty list —');
		expect(fixture.nativeElement.textContent).toContain('same');
	});
	it('resolves both baseline and current IDs and cancels baseline work when it changes', () => {
		const http = TestBed.inject(HttpTestingController);
		fixture.componentRef.setInput('property', property('user'));
		fixture.componentRef.setInput('cell', {
			value: 'current',
			baseline: 'old',
			changed: true,
			missing: false,
		});
		fixture.detectChanges();
		const old = http.expectOne((item) => item.url.endsWith('/user/old'));
		const current = http.expectOne((item) => item.url.endsWith('/user/current'));
		fixture.componentRef.setInput('cell', {
			value: 'current',
			baseline: 'older',
			changed: true,
			missing: false,
		});
		fixture.detectChanges();
		expect(old.cancelled).toBeTrue();
		expect(current.cancelled).toBeTrue();
		http
			.expectOne((item) => item.url.endsWith('/user/older'))
			.flush({ properties: { username: 'Older' } });
		http
			.expectOne((item) => item.url.endsWith('/user/current'))
			.flush({ properties: { username: 'Current' } });
		http.verify();
	});
	it('cancels the same directory ID when its directory target changes', () => {
		const http = TestBed.inject(HttpTestingController);
		fixture.componentRef.setInput('property', {
			...property('directoryEntry'),
			directoryName: 'one',
		});
		fixture.componentRef.setInput('cell', cell('id'));
		fixture.detectChanges();
		const first = http.expectOne((item) => item.url.includes('/directory/one/id'));
		fixture.componentRef.setInput('property', {
			...property('directoryEntry'),
			directoryName: 'two',
		});
		fixture.detectChanges();
		expect(first.cancelled).toBeTrue();
		http
			.expectOne((item) => item.url.includes('/directory/two/id'))
			.flush({ properties: { label: 'Two' } });
		http.verify();
	});
	it('keeps custom context values deeply immutable and detached', () => {
		const value = { nested: { value: 'new' } };
		const baseline = { nested: { value: 'old' } };
		fixture.componentRef.setInput('property', property('default'));
		fixture.componentRef.setInput('cell', { value, baseline, changed: true, missing: false });
		fixture.componentRef.setInput('document', { nested: { document: true } });
		fixture.detectChanges();
		const context = fixture.componentInstance.context;
		expect(Object.isFrozen(context.value)).toBeTrue();
		expect(Object.isFrozen((context.value as any).nested)).toBeTrue();
		expect((context.value as any).nested).not.toBe(value.nested);
		expect((context.document as any).nested).not.toBe(
			(fixture.componentInstance.document as any).nested,
		);
	});
	it('localizes default comparison markers and scalar formatting while preserving technical JSON and file names', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			ro: {
				'app.viewer.comparisonMissing': '— lipsă —',
				'app.viewer.comparisonEmpty': '— gol —',
				'app.viewer.unnamedFile': 'fișier fără nume',
				'app.viewer.comparisonEmptyList': '— listă goală —',
				'app.viewer.comparisonEmptyObject': '— obiect gol —',
				'sdk.dialog.yes': 'Da',
				'app.viewer.comparisonDeletion': 'ștergere',
			},
		});
		expect(render('default', undefined)).toContain('— missing —');
		messages.locale.set('ro');
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('— lipsă —');
		expect(render('default', null)).toContain('— gol —');
		expect(render('default', [])).toContain('— listă goală —');
		expect(render('default', {})).toContain('— obiect gol —');
		expect(render('default', true)).toContain('Da');
		expect(render('default', 1234.56789)).toContain('1.234,56789');
		expect(render('blob', { digest: 'abc' })).toContain('fișier fără nume');
		expect(render('blob', { name: 'Customer.pdf' })).toContain('Customer.pdf');
		expect(render('default', { a: true, b: null, list: [], count: 1234.5 })).toContain(
			'count: 1.234,5',
		);
		expect(fixture.nativeElement.textContent).toContain('a: Da');
		expect(render('date', '2026-01-01T00:00:00Z').trim()).toBe(
			new Date('2026-01-01T00:00:00Z').toLocaleString('ro'),
		);
	});
	it('reuses loaded directory language variants without refetching or changing the reference ID', async () => {
		const http = TestBed.inject(HttpTestingController);
		fixture.componentRef.setInput('property', {
			...property('directoryEntry'),
			directoryName: 'countries',
		});
		fixture.componentRef.setInput('cell', cell('entry'));
		fixture.detectChanges();
		http
			.expectOne((request) => request.url.includes('/directory/countries/entry'))
			.flush({
				properties: {
					id: 'entry',
					label_en: 'English label',
					label_fr: 'Libellé français',
					label_ro: 'Etichetă română',
				},
			});
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('English label');
		TestBed.inject(WebUiMessages).locale.set('fr');
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Libellé français');
		TestBed.inject(WebUiMessages).locale.set('ro');
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Etichetă română');
		expect(fixture.componentInstance.cell.value).toBe('entry');
		http.expectNone((request) => request.url.includes('/directory/'));
		http.verify();
	});
});
