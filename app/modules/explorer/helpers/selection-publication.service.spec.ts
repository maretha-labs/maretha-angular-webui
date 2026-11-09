import { LocalizedUiError, localizedState } from '@maretha/webui-sdk';
import { WebUiMessages } from 'app/extensions/webui-messages';
import { WebUiLocale } from 'app/extensions/i18n/webui-locale';
import { loadWebUiCatalog } from 'app/helpers/webui-message-catalog';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { AutomationsService } from './automations.service';
import {
	isPublishableDocument,
	SelectionPublicationService,
} from './selection-publication.service';

describe('Selection publication transport', () => {
	const document = {
		uid: 'one',
		facets: ['Publishable'],
		contextParameters: { permissions: ['WriteVersion'] },
	};
	beforeEach(() =>
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{ provide: AutomationsService, useValue: { documentPublished$: new Subject() } },
			],
		}),
	);
	it('requires the reference facet, permission and non-proxy/non-record/non-trashed state', () => {
		expect(isPublishableDocument(document)).toBeTrue();
		for (const change of [
			{ facets: [] },
			{ contextParameters: {} },
			{ isProxy: true },
			{ isRecord: true },
			{ isTrashed: true },
		])
			expect(isPublishableDocument({ ...document, ...change })).toBeFalse();
	});
	it('rechecks source permissions in the selected repository before publishing and emits only after success', async () => {
		const http = TestBed.inject(HttpTestingController);
		const emitted = jasmine.createSpy('published');
		TestBed.inject(AutomationsService).documentPublished$.subscribe(emitted);
		const done = TestBed.inject(SelectionPublicationService).publish(
			'one',
			'other',
			'section',
			false,
		);
		const get = http.expectOne((req) => req.url.endsWith('/repo/other/id/one'));
		expect(get.request.headers.get('enrichers-document')).toBe('permissions');
		get.flush(document);
		await new Promise((resolve) => setTimeout(resolve, 0));
		const post = http.expectOne((req) => req.url.endsWith('/Document.PublishToSection'));
		expect(post.request.headers.get('X-NXRepository')).toBe('other');
		expect(post.request.body).toEqual({
			input: 'one',
			params: { target: 'section', override: false, renditionName: undefined },
		});
		expect(emitted).not.toHaveBeenCalled();
		post.flush({});
		await done;
		expect(emitted).toHaveBeenCalledWith({ documentUid: 'one', targetUid: 'section' });
		http.verify();
	});
	it('never publishes when a fresh permission read refuses the document', async () => {
		const http = TestBed.inject(HttpTestingController);
		const done = TestBed.inject(SelectionPublicationService).publish(
			'one',
			'default',
			'section',
			true,
		);
		http
			.expectOne((req) => req.method === 'GET')
			.flush({ ...document, contextParameters: { permissions: [] } });
		const error: unknown = await done.catch((error) => error);
		expect(error instanceof LocalizedUiError).toBeTrue();
		expect((error as Error).message).toContain('no longer publishable');
		TestBed.inject(WebUiMessages).register('publication-test', {
			es: await loadWebUiCatalog('es'),
			ar: await loadWebUiCatalog('ar'),
		});
		const state = TestBed.runInInjectionContext(() => localizedState(''));
		state.setError(error, 'unused', 'Unused fallback');
		TestBed.inject(WebUiLocale).locale.set('es');
		expect(state()).toBe(
			'El documento ya no se puede publicar. Actualice la selección y compruebe los permisos.',
		);
		TestBed.inject(WebUiLocale).locale.set('ar');
		expect(state()).toBe('لم يعد من الممكن نشر المستند. حدّث التحديد وتحقّق من الأذونات.');

		http.expectNone((req) => req.method === 'POST');
		http.verify();
	});
});
