import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import { Subject } from 'rxjs';
import { AutomationsService } from '../../helpers/automations.service';
import { StandardDocumentPublicationViewComponent } from './standard-document-publication-view.component';

describe('Standard document publications', () => {
	const source = {
		uid: 'source',
		repository: 'other',
		properties: { 'uid:major_version': 1, 'uid:minor_version': 0 },
		contextParameters: { permissions: [] },
	};
	const publication = {
		uid: 'proxy',
		path: '/section/note',
		parentRef: 'section',
		properties: {
			'uid:major_version': 1,
			'uid:minor_version': 0,
			'dc:publishDate': '2026-09-01T12:00:00Z',
			'dc:created': '2026-08-01T12:00:00Z',
		},
		contextParameters: { permissions: [] },
	};
	beforeEach(() =>
		TestBed.configureTestingModule({
			imports: [StandardDocumentPublicationViewComponent],
			providers: [
				provideHttpClient(withXhr()),
				provideHttpClientTesting(),
				{ provide: AutomationsService, useValue: { documentPublished$: new Subject() } },
			],
		}).overrideComponent(StandardDocumentPublicationViewComponent, { set: { template: '' } }),
	);
	afterEach(() => TestBed.inject(HttpTestingController).verify());
	async function setup() {
		const fixture = TestBed.createComponent(StandardDocumentPublicationViewComponent);
		fixture.componentRef.setInput('context', { document: source, noEdit: false });
		fixture.detectChanges();
		const http = TestBed.inject(HttpTestingController);
		const get = http.expectOne((request) => request.url.endsWith('/id/source'));
		expect(get.request.headers.get('X-NXRepository')).toBe('other');
		get.flush(source);
		await Promise.resolve();
		const listing = http.expectOne((request) => request.url.endsWith('/nxql_search/execute'));
		expect(listing.request.headers.get('X-NXRepository')).toBe('other');
		listing.flush({ entries: [publication], isNextPageAvailable: false });
		await fixture.whenStable();
		return { fixture, http, component: fixture.componentInstance };
	}
	it('separates translated column headings from literal repository publication values', async () => {
		const { component } = await setup();
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			fr: { 'app.columns.path': 'Chemin', 'app.columns.rendition': 'Rendu' },
		});
		TestBed.inject(WebUiLocale).setLocale('fr');
		const path = component.columns.find((column) => column.id === 'path')!;
		const rendition = component.columns.find((column) => column.id === 'rendition')!;
		expect(messages.text(path.labelKey, path.label)).toBe('Chemin');
		expect(path.value!(publication)).toBe('/section/note');
		expect(messages.text(rendition.labelKey, rendition.label)).toBe('Rendu');
		expect(
			rendition.value!({
				...publication,
				properties: { ...publication.properties, 'rend:renditionName': 'Customer PDF' },
			}),
		).toBe('Customer PDF');
		expect(rendition.value!(publication)).toBe('');
		component.requestUnpublishAll();
		expect(component.confirm()?.row.uid).toBe('source');
		expect(component.confirm()?.action).toBe('unpublish-all');
	});
	it('does not infer query-wide unpublish eligibility from the first page row permissions', async () => {
		const { component, http } = await setup();
		expect(component.canChange(publication)).toBeFalse();
		expect(component.canUnpublishAll()).toBeTrue();
		await component.loadMore();
		http.expectNone((request) => request.url.endsWith('/nxql_search/execute'));
	});
	it('uses the source publish-date fallback before creation date', async () => {
		const { component } = await setup();
		expect(component.publishedDate(publication)).toBe('2026-09-01T12:00:00Z');
		expect(
			component.publishedDate({
				...publication,
				contextParameters: {
					audit: [
						{
							eventId: 'documentCreated',
							principalName: 'Administrator',
							eventDate: '2026-09-02T12:00:00Z',
						},
					],
				},
			}),
		).toBe('2026-09-02T12:00:00Z');
	});
	it('ignores repository-tagged publication events for another repository with the same UID', async () => {
		const { component } = await setup();
		const reload = spyOn(component, 'reload');
		const published = TestBed.inject(AutomationsService).documentPublished$;
		published.next({ documentUid: 'source', targetUid: 'section', repository: 'default' });
		published.next({ documentUid: 'another-source', targetUid: 'section', repository: 'other' });
		expect(reload).not.toHaveBeenCalled();
		published.next({ documentUid: 'source', targetUid: 'section', repository: 'other' });
		expect(reload).toHaveBeenCalledTimes(1);
		// Untagged legacy publishers retain their previous refresh behavior.
		published.next({ documentUid: 'source', targetUid: 'section' });
		expect(reload).toHaveBeenCalledTimes(2);
	});
	it('evaluates version, publisher, publishedDate and publicationActions column values', async () => {
		const { component } = await setup();
		const byId = Object.fromEntries(component.columns.map((c) => [c.id, c]));
		expect(byId['version'].value!(publication)).toBe('1.0');
		expect(byId['publisher'].value!(publication)).toBe('');
		expect(byId['published'].value!(publication)).toBe('2026-09-01T12:00:00Z');
		expect(byId['publicationActions'].value!(publication)).toBe('');
	});
});
