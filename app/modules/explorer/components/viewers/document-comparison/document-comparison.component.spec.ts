import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WebUiMessages } from '@maretha/webui-sdk';
import { Router, provideRouter } from '@angular/router';
import { ComparisonPageComponent } from 'app/components/application-pages/comparison-page.component';

import { DocumentComparisonComponent } from './document-comparison.component';

describe('DocumentComparisonComponent', () => {
	let component: DocumentComparisonComponent;
	let fixture: ComponentFixture<DocumentComparisonComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [DocumentComparisonComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(DocumentComparisonComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('documents', [
			fixtureDocument(),
			{ ...fixtureDocument(), uid: 'fixture-second' },
		]);
		fixture.detectChanges();
	});

	it('changes the comparison baseline from the keyboard', () => {
		const buttons = fixture.nativeElement.querySelectorAll(
			'thead button',
		) as NodeListOf<HTMLButtonElement>;
		expect(buttons.length).toBe(2);
		expect(buttons[1].type).toBe('button');
		buttons[1].focus();
		buttons[1].dispatchEvent(
			new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
		);
		fixture.detectChanges();
		expect(component.pivot?.['uid']).toBe('fixture-second');
		expect(buttons[1].getAttribute('aria-checked')).toBe('true');
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});

describe('Comparison page source rendering', () => {
	it('uses common schema order and date metadata, filters equal-content blobs, and labels checked-in versions', () => {
		TestBed.configureTestingModule({
			imports: [ComparisonPageComponent],
			providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
		}).overrideComponent(ComparisonPageComponent, { set: { template: '', imports: [] } });
		const fixture = TestBed.createComponent(ComparisonPageComponent);
		fixture.componentRef.setInput('context', {
			pageId: 'compare',
			query: { left: 'left', right: 'right', ids: 'left,right' },
		});
		fixture.detectChanges();
		const http = TestBed.inject(HttpTestingController);
		const schemas = [
			{ name: 'note', prefix: 'note', fields: { note: 'string' } },
			{ name: 'uid', prefix: 'uid', fields: { major_version: 'long', minor_version: 'long' } },
			{ name: 'dublincore', prefix: 'dc', fields: { eventDate: 'date', title: 'string' } },
			{ name: 'file', prefix: 'file', fields: { content: 'blob' } },
		];
		http.expectOne((request) => request.url.endsWith('/config/schemas')).flush(schemas);
		const doc = (uid: string, version: boolean, minor: number) => ({
			uid,
			title: 'Note',
			isVersion: version,
			isCheckedOut: false,
			schemas: schemas.map(({ name, prefix }) => ({ name, prefix })),
			properties: {
				'note:note': uid,
				'uid:major_version': 0,
				'uid:minor_version': minor,
				'dc:eventDate': `2026-09-${version ? '16' : '17'}T12:00:00.000Z`,
				'dc:title': 'Same title',
				'file:content': { name: `${uid}.txt`, digest: 'same', data: `https://example.test/${uid}` },
			},
		});
		const left = doc('left', true, 5);
		const right = doc('right', false, 6);
		http.expectOne((request) => request.url.endsWith('/id/left')).flush(left);
		http.expectOne((request) => request.url.endsWith('/id/right')).flush(right);
		const component = fixture.componentInstance;
		expect(component.groups().map((group: any) => group.name)).toEqual([
			'note',
			'uid',
			'dublincore',
		]);
		const date = component.groups()[2].properties[0];
		expect(date.kind).toBe('date');
		expect(component.displayCell(right, date).value).toBe('September 17, 2026');
		expect(component.title(right)).toBe('Note (v0.6)');
		expect(component.title({ ...right, isCheckedOut: true })).toBe('Note');
		component.showAll.set(true);
		expect(component.groups().map((group: any) => group.name)).toEqual([
			'note',
			'uid',
			'dublincore',
			'file',
		]);
		expect(
			component
				.groups()[2]
				.properties.some((property: any) => property.name === 'properties.dc:title'),
		).toBeTrue();
		const blob = component.groups()[3].properties[0];
		expect(component.cell(right, blob, left).changed).toBeFalse();
		const messages = TestBed.inject(WebUiMessages);
		messages.register('comparison-test', {
			fr: {
				'app.viewer.documentType': 'Type de document',
				'diffObject.property.label.dc:eventDate': 'Date client',
			},
		});
		messages.locale.set('fr');
		expect(
			component.fieldLabel({
				...date,
				name: 'type',
				label: 'Document type',
				labelKey: 'app.viewer.documentType',
			}),
		).toBe('Type de document');
		expect(component.fieldLabel({ ...date, name: 'customer', label: 'Customer literal' })).toBe(
			'Customer literal',
		);
		expect(component.fieldLabel(date)).toBe('Date client');
		expect(
			component.fieldLabel({
				...date,
				name: 'properties.custom:label',
				label: 'custom:Client: name',
			}),
		).toBe('Client: name');
		expect(component.displayCell(right, date).value).toBe('17 septembre 2026');
		expect(
			component.displayCell({ ...right, properties: { 'dc:eventDate': 'customer-invalid' } }, date)
				.value,
		).toBe('customer-invalid');
		expect(
			component.displayCell({ ...right, properties: { 'dc:eventDate': '' } }, date).value,
		).toBe('');
		expect(component.displayProperty(date).kind).toBe('default');
		expect(component.displayProperty(blob)).toBe(blob);
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		component.select('left', 'right');
		expect(navigate.calls.mostRecent().args[1]?.queryParams).toEqual({
			left: 'right',
			right: 'left',
			ids: 'left,right',
		});
		component.select('right', 'left');
		expect(navigate.calls.mostRecent().args[1]?.queryParams).toEqual({
			left: 'right',
			right: 'left',
			ids: 'left,right',
		});
		component.swap();
		expect(navigate.calls.mostRecent().args[1]?.queryParams).toEqual({
			left: 'right',
			right: 'left',
			ids: 'left,right',
		});
		http.verify();
		fixture.destroy();
	});

	it('formats complex objects, blobs, dates, booleans, numbers and document references in ComparisonValueComponent', async () => {
		const { ComparisonValueComponent } = await import('./comparison-value.component');
		const valFixture = TestBed.createComponent(ComparisonValueComponent);
		const comp = valFixture.componentInstance;
		comp.document = { uid: 'right', type: 'Note', properties: {} };
		comp.property = { name: 'dc:contributors', label: 'Contributors', kind: 'document[]' } as any;
		comp.cell = {
			value: [{ uid: 'doc-a', title: 'Doc A' }],
			baseline: null,
			changed: true,
			missing: false,
		};
		expect(comp.documentIds).toEqual(['doc-a']);
		expect(comp.lines).toEqual(['Doc A']);
		expect(comp.baselineLines).toEqual(['— empty —']);
		expect(comp.changeKind).toBe('addition');

		comp.property = { name: 'file:content', label: 'File', kind: 'blob' } as any;
		comp.cell = {
			value: { name: 'spec.pdf', 'mime-type': 'application/pdf', data: '/nuxeo/files/spec.pdf' },
			baseline: { _name: 'old.pdf' },
			changed: true,
			missing: false,
		};
		expect(comp.lines).toEqual(['spec.pdf']);
		expect(comp.baselineLines).toEqual(['old.pdf']);
		expect(comp.isBlob(comp.cell.value)).toBeTrue();
		expect(comp.blobName(comp.cell.value)).toBe('spec.pdf');
		expect(comp.blobHref(comp.cell.value)).toBe('/nuxeo/files/spec.pdf');

		comp.property = { name: 'complex:item', label: 'Complex', kind: 'default' } as any;
		comp.cell = {
			value: { nested: [1, { a: null, b: [], c: {} }] },
			baseline: {},
			changed: true,
			missing: false,
		};
		expect(comp.lines.length).toBeGreaterThan(0);
		expect(comp.baselineLines).toEqual(['— empty object —']);
		expect(comp.leaf([], 'list')).toBe('— empty list —');
		expect(comp.leaf({}, 'obj')).toBe('— empty object —');
		expect(comp.leaf(true, 'flag')).toBe('Yes');
		expect(comp.leaf(42, 'count')).toBe('42');
		expect(comp.leaf('2026-10-01T00:00:00Z', 'dc:created')).toBeTruthy();
		expect(comp.leaf({ title: 'Named' }, 'ref')).toBe('Named');
		expect(comp.leaf(null, 'empty')).toBe('— empty —');

		comp.property = { name: 'dc:valid', label: 'Valid', kind: 'default' } as any;
		comp.cell = { value: undefined, baseline: false, changed: true, missing: true };
		expect(comp.lines).toEqual(['— missing —']);
		expect(comp.baselineLines).toEqual(['No']);
		expect(comp.changeKind).toBe('deletion');
		expect(comp.documentIds).toEqual([]);
		comp.cell = { value: [], baseline: 123, changed: false, missing: false };
		expect(comp.lines).toEqual(['— empty list —']);
		expect(comp.baselineLines).toEqual(['123']);
		expect(comp.changeKind).toBe('unchanged');
		expect(comp.leaf(false, 'flag')).toBe('No');
		expect(comp.leaf({ id: 'only-id' }, 'ref')).toBe('only-id');
		expect(comp.leaf({ foo: 'bar' }, 'ref')).toBe('');
		comp.property = { name: 'file:content', label: 'File', kind: 'blob' } as any;
		comp.cell = { value: {}, baseline: null, changed: true, missing: false };
		expect(comp.lines).toEqual(['unnamed file']);
	});
});
