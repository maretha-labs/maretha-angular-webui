import { WebUiMessages } from '@maretha/webui-sdk';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AutomationsService } from '../../helpers/automations.service';
import { DocumentPublicationViewComponent } from './document-publication-view.component';

describe('Publication view', () => {
	const source = {
		uid: 'source-id',
		path: '/source',
		parentRef: 'parent',
		properties: { 'uid:major_version': 1, 'uid:minor_version': 0 },
		contextParameters: { permissions: ['Read'] },
	};
	const publication = {
		uid: 'proxy-id',
		path: '/section/publication',
		parentRef: 'section',
		properties: { 'uid:major_version': 0, 'uid:minor_version': 1 },
		contextParameters: { permissions: ['WriteVersion'] },
	};
	async function loaded(noEdit = false) {
		TestBed.configureTestingModule({
			imports: [DocumentPublicationViewComponent],
			providers: [
				provideRouter([]),
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: AutomationsService, useValue: { documentPublished$: new Subject() } },
			],
		});
		const fixture = TestBed.createComponent(DocumentPublicationViewComponent);
		const http = TestBed.inject(HttpTestingController);
		fixture.componentRef.setInput('context', { document: source, noEdit });
		fixture.detectChanges();
		http.expectOne((req) => req.url.endsWith('/id/source-id')).flush(source);
		await new Promise((resolve) => setTimeout(resolve, 0));
		const request = http.expectOne((req) => req.url.endsWith('/search/pp/nxql_search/execute'));
		expect(request.request.params.get('queryParams')).toContain(
			"ecm:proxyVersionableId = 'source-id'",
		);
		request.flush({ entries: [publication], isNextPageAvailable: false });
		await fixture.whenStable();
		fixture.detectChanges();
		return { fixture, http };
	}
	it('loads source-linked publications and honors noEdit', async () => {
		const { fixture, http } = await loaded(true);
		expect(fixture.componentInstance.rows().length).toBe(1);
		expect(fixture.componentInstance.canChange(publication)).toBeFalse();
		expect(fixture.nativeElement.textContent).not.toContain('Unpublish');
		http.verify();
	});
	it('relocalizes source load failure and exposes the resolved source to publication contributions', async () => {
		const { fixture, http } = await loaded();
		expect(fixture.componentInstance.publishContext().document?.['uid']).toBe('source-id');
		fixture.componentInstance.reload();
		http
			.expectOne((req) => req.url.endsWith('/id/source-id'))
			.flush({}, { status: 403, statusText: 'Forbidden' });
		await fixture.whenStable();
		const messages = TestBed.inject(WebUiMessages);
		messages.register('publication-test', {
			fr: { 'app.state.publications-could-not-be-loaded-4e082f': 'Publications indisponibles.' },
		});
		messages.locale.set('fr');
		expect(fixture.componentInstance.error()).toBe('Publications indisponibles.');
		expect(fixture.componentInstance.loading()).toBeFalse();
		expect(fixture.componentInstance.rows()).toEqual([]);
		http.verify();
	});

	it('does not perform destructive actions without an explicit confirmation', async () => {
		const { fixture, http } = await loaded();
		await fixture.componentInstance.runAction();
		http.expectNone((req) => req.method === 'POST');
		http.verify();
	});
	it('preserves a retryable action state on a server refusal', async () => {
		const { fixture, http } = await loaded();
		fixture.componentInstance.confirm.set({ row: publication, action: 'unpublish' });
		const result = fixture.componentInstance.runAction();
		expect(
			fixture.componentInstance.canDeactivate({ reason: 'tab', nextViewId: 'view' }),
		).toBeFalse();
		const request = http.expectOne((req) => req.url.endsWith('/automation/Document.Delete'));
		expect(request.request.body.input).toBe('proxy-id');
		request.flush({}, { status: 403, statusText: 'Forbidden' });
		await result;
		expect(fixture.componentInstance.error()).toContain('failed');
		expect(fixture.componentInstance.confirm()).not.toBeNull();
		expect(
			fixture.componentInstance.canDeactivate({ reason: 'tab', nextViewId: 'view' }),
		).toBeTrue();
		http.verify();
	});
	it('binds unpublish-all confirmation to the source and reports publications left by server permissions', async () => {
		const { fixture, http } = await loaded();
		fixture.componentInstance.requestUnpublishAll();
		expect(fixture.componentInstance.confirm()?.action).toBe('unpublish-all');
		const result = fixture.componentInstance.runAction();
		const request = http.expectOne((req) => req.url.endsWith('/automation/Document.UnpublishAll'));
		expect(request.request.body).toEqual({ input: 'source-id', params: {} });
		expect(request.request.headers.get('nx-es-sync')).toBe('true');
		request.flush({});
		await new Promise((resolve) => setTimeout(resolve, 0));
		http.expectOne((req) => req.url.endsWith('/id/source-id')).flush(source);
		await new Promise((resolve) => setTimeout(resolve, 0));
		http
			.expectOne((req) => req.url.endsWith('/search/pp/nxql_search/execute'))
			.flush({ entries: [publication], isNextPageAvailable: false });
		await result;
		expect(fixture.componentInstance.actionMessage()).toContain('Some publications remain');
		expect(fixture.componentInstance.confirm()).toBeNull();
		http.verify();
	});
	it('refuses unpublish-all for an obsolete confirmed source or read-only context', async () => {
		const { fixture, http } = await loaded();
		fixture.componentInstance.confirm.set({
			row: { ...source, uid: 'obsolete' },
			action: 'unpublish-all',
		});
		await fixture.componentInstance.runAction();
		http.expectNone((req) => req.method === 'POST');
		fixture.componentRef.setInput('context', { document: source, noEdit: true });
		expect(fixture.componentInstance.canUnpublishAll()).toBeFalse();
		http.verify();
	});
	it('appends the next page on load more and keeps the loaded rows when a page fails', async () => {
		const { fixture, http } = await loaded();
		const component = fixture.componentInstance;
		const execute = (req: { url: string }) => req.url.endsWith('/search/pp/nxql_search/execute');
		const more = component.loadMore();
		expect(component.loading()).toBeTrue();
		await component.loadMore();
		const request = http.expectOne(execute);
		expect(request.request.params.get('currentPageIndex')).toBe('1');
		request.flush({ entries: [{ ...publication, uid: 'proxy-2' }], isNextPageAvailable: true });
		await more;
		expect(component.rows().map((row) => row.uid)).toEqual(['proxy-id', 'proxy-2']);
		expect(component.hasMore()).toBeTrue();
		expect(component.loading()).toBeFalse();
		const failed = component.loadMore();
		http.expectOne(execute).flush({}, { status: 500, statusText: 'Error' });
		await failed;
		expect(component.error()).toContain('More publications could not be loaded');
		expect(component.rows().length).toBe(2);
		expect(component.loading()).toBeFalse();
		http.verify();
	});
	it('resolves a version to its live source in its repository and clears without a document', async () => {
		TestBed.configureTestingModule({
			imports: [DocumentPublicationViewComponent],
			providers: [
				provideRouter([]),
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: AutomationsService, useValue: { documentPublished$: new Subject() } },
			],
		});
		const fixture = TestBed.createComponent(DocumentPublicationViewComponent);
		const http = TestBed.inject(HttpTestingController);
		const version = { uid: 'version-1', isVersion: true, repository: 'other' };
		fixture.componentRef.setInput('context', { document: version, noEdit: false });
		fixture.detectChanges();
		const lookup = http.expectOne((req) => req.url.endsWith('/automation/Proxy.GetSourceDocument'));
		expect(lookup.request.body).toEqual({ input: 'version-1', params: {} });
		lookup.flush(source);
		await new Promise((resolve) => setTimeout(resolve, 0));
		http
			.expectOne((req) => req.url.endsWith('/search/pp/nxql_search/execute'))
			.flush({ entries: [publication], isNextPageAvailable: false });
		await fixture.whenStable();
		expect(fixture.componentInstance.source()?.uid).toBe('source-id');
		expect(fixture.componentInstance.rows().length).toBe(1);
		fixture.componentRef.setInput('context', { document: null, noEdit: false });
		fixture.detectChanges();
		await fixture.whenStable();
		expect(fixture.componentInstance.source()).toBeNull();
		expect(fixture.componentInstance.rows()).toEqual([]);
		expect(fixture.componentInstance.loading()).toBeFalse();
		http.verify();
	});
	it('offers republish only for outdated publications and reads publisher and date from the audit', async () => {
		const { fixture } = await loaded();
		const component = fixture.componentInstance;
		const at = (major: number, minor: number) => ({
			...publication,
			properties: { 'uid:major_version': major, 'uid:minor_version': minor },
		});
		expect(component.canRepublish(at(0, 1))).toBeTrue();
		expect(component.canRepublish(at(1, 0))).toBeFalse();
		expect(component.canRepublish(at(2, 0))).toBeFalse();
		expect(component.canRepublish(at(1, 1))).toBeFalse();
		component.source.set({ ...source, isCheckedOut: true });
		expect(component.canRepublish(at(1, 0))).toBeTrue();
		expect(
			component.canRepublish({ ...at(0, 1), contextParameters: { permissions: ['Read'] } }),
		).toBeFalse();
		component.source.set(null);
		expect(component.canRepublish(at(0, 1))).toBeFalse();
		const audited = {
			...publication,
			contextParameters: {
				...publication.contextParameters,
				audit: [
					{ eventId: 'documentModified', principalName: 'editor', eventDate: '2026-02-01' },
					{ eventId: 'documentCreated', principalName: 'alice', eventDate: '2026-01-02' },
				],
			},
		};
		expect(component.publisher(audited)).toBe('alice');
		expect(component.publishedDate(audited)).toBe('2026-01-02');
		const properties = { ...publication.properties, 'dc:created': '2025-12-31' };
		expect(
			component.publisher({ ...publication, properties: { ...properties, 'dc:publisher': 'bob' } }),
		).toBe('bob');
		expect(
			component.publisher({
				...publication,
				properties: { ...properties, 'dc:lastContributor': 'carol' },
			}),
		).toBe('carol');
		expect(component.publishedDate({ ...publication, properties })).toBe('2025-12-31');
		expect(component.columns.find((column) => column.id === 'publisher')?.value?.(audited)).toBe(
			'alice',
		);
	});
});
