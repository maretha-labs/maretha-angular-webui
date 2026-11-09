import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { StandardVersionNoticeComponent } from './standard-version-notice.component';
import { ExtensionRegistry, WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import { provideDefaultDocumentInfoBar } from './default-document-info-bar';
import { DocumentInfoBarComponent } from './document-info-bar.component';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

describe('Document information contributions', () => {
	it('qualifies notices in stock order and supports independently disabling them', () => {
		TestBed.configureTestingModule({ providers: [provideDefaultDocumentInfoBar()] });
		const registry = TestBed.inject(ExtensionRegistry);
		const context = {
			document: {
				uid: 'doc',
				isTrashed: true,
				hasLegalHold: true,
				isUnderRetentionOrLegalHold: true,
			},
			noEdit: false,
			loading: false,
			searchActive: false,
		};
		const ids = (value: typeof context = context) =>
			registry.resolve('DOCUMENT_INFO_BAR', value).items.map((item) => item.id);
		// Stock order: workflow and task bars, then the record bar, then the trash bar.
		expect(ids()).toEqual([
			'maretha.document.notice.workflow',
			'maretha.document.notice.retention',
			'maretha.document.notice.trash',
		]);
		// Stock has no lock notice.
		expect(
			ids({ ...context, document: { uid: 'doc', ng: { lockedBy: 'Administrator' } } as any }),
		).toEqual(['maretha.document.notice.workflow']);
		const restore = registry.register({
			id: 'client.notices',
			overrides: [
				{ slot: 'DOCUMENT_INFO_BAR', id: 'maretha.document.notice.retention', disabled: true },
			],
		});
		expect(ids()).not.toContain('maretha.document.notice.retention');
		expect(ids({ ...context, searchActive: true })).not.toContain(
			'maretha.document.notice.workflow',
		);
		restore();
		expect(ids()).toContain('maretha.document.notice.retention');
	});
	it('shows no notice without a document and lazily loads the notice components', async () => {
		TestBed.configureTestingModule({ providers: [provideDefaultDocumentInfoBar()] });
		const registry = TestBed.inject(ExtensionRegistry);
		const empty = { document: null, noEdit: false, loading: false, searchActive: false };
		expect(registry.resolve('DOCUMENT_INFO_BAR', empty).items).toEqual([]);
		const items = registry.resolve('DOCUMENT_INFO_BAR', {
			document: { uid: 'doc', type: 'File', isVersion: true, isTrashed: true },
			noEdit: false,
			loading: false,
			searchActive: false,
		}).items;
		const components = await Promise.all(items.map((item) => item.loadComponent!()));
		expect(items.map((item) => item.id)).toEqual([
			'maretha.document.notice.workflow',
			'maretha.document.notice.trash',
			'maretha.document.notice.standard-version',
		]);
		expect(components).toEqual([
			DocumentInfoBarComponent,
			DocumentInfoBarComponent,
			StandardVersionNoticeComponent,
		]);
	});
});

describe('Scoped version information', () => {
	const version = {
		uid: 'version-1',
		repository: 'other',
		path: '/Workspace/Note',
		type: 'Note',
		isVersion: true,
		properties: { 'uid:major_version': 1, 'uid:minor_version': 0 },
	};
	const source = {
		uid: 'live',
		repository: 'other',
		path: '/Workspace/Note',
		type: 'Note',
		isCheckedOut: false,
		properties: { 'uid:major_version': 2, 'uid:minor_version': 0 },
		contextParameters: { permissions: ['WriteVersion'] },
	};
	const context = (document: any) => ({
		document,
		noEdit: false,
		loading: false,
		searchActive: false,
	});
	function setup() {
		const router = { navigateByUrl: jasmine.createSpy().and.resolveTo(true) };
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: Router, useValue: router },
			],
		});
		const fixture = TestBed.createComponent(StandardVersionNoticeComponent);
		const http = TestBed.inject(HttpTestingController);
		fixture.componentRef.setInput('context', context(version));
		fixture.detectChanges();
		return { fixture, http, router, component: fixture.componentInstance };
	}
	function sourceRequest(http: HttpTestingController) {
		return http.expectOne((request) => request.url.endsWith('/Proxy.GetSourceDocument'));
	}
	it('translates a retained source lookup failure without offering restore', fakeAsync(() => {
		const { component, http } = setup();
		sourceRequest(http).flush({}, { status: 503, statusText: 'Offline' });
		flushMicrotasks();
		expect(component.error()).toContain('Unable to check');
		TestBed.inject(WebUiMessages).register('test', {
			fr: {
				'app.state.unable-to-check-whether-this-version-can-be-r-dc052f': 'Version inaccessible.',
			},
		});
		TestBed.inject(WebUiLocale).setLocale('fr');
		expect(component.error()).toBe('Version inaccessible.');
		expect(component.canRestore()).toBeFalse();
		http.verify();
	}));
	it('registers version notices for every typed document, custom types included', () => {
		TestBed.configureTestingModule({ providers: [provideDefaultDocumentInfoBar()] });
		const registry = TestBed.inject(ExtensionRegistry);
		const visible = (doc: any) =>
			registry
				.resolve('DOCUMENT_INFO_BAR', context(doc))
				.items.some((item) => item.id === 'maretha.document.notice.standard-version');
		for (const type of [
			'Note',
			'Audio',
			'Video',
			'File',
			'Picture',
			'Workspace',
			'Collection',
			'Folder',
			'Custom',
		])
			expect(visible({ ...version, type }))
				.withContext(type)
				.toBeTrue();
		expect(visible({ ...version, type: '' })).toBeFalse();
		expect(visible({ ...version, isVersion: false })).toBeFalse();
	});
	it('requires a different version or checked-out source and respects source retention and write permission', fakeAsync(() => {
		const { component, fixture, http } = setup();
		sourceRequest(http).flush({ ...source, properties: version.properties });
		flushMicrotasks();
		expect(component.canRestore()).toBeFalse();
		component.latest.set({ ...source, properties: version.properties, isCheckedOut: true });
		expect(component.canRestore()).toBeTrue();
		for (const patch of [
			{ isRecord: true },
			{ hasLegalHold: true },
			{ retainUntil: '2099-01-01' },
			{ contextParameters: { permissions: ['Read'] } },
		]) {
			component.latest.set({ ...source, ...patch });
			expect(component.canRestore()).toBeFalse();
		}
		component.latest.set(source);
		fixture.componentRef.setInput('context', { ...context(version), noEdit: true });
		expect(component.canRestore()).toBeFalse();
		http.verify();
	}));
	it('does nothing when the restore confirmation is declined', fakeAsync(() => {
		const { component, http, router } = setup();
		spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(false);
		sourceRequest(http).flush(source);
		flushMicrotasks();
		void component.restore();
		flushMicrotasks();
		http.expectNone(() => true);
		expect(router.navigateByUrl).not.toHaveBeenCalled();
		expect(component.busy()).toBeFalse();
		http.verify();
	}));
	it('rechecks permissions immediately before restore and prevents a revoked source mutation', fakeAsync(() => {
		const { component, http, router } = setup();
		spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(true);
		sourceRequest(http).flush(source);
		flushMicrotasks();
		void component.restore();
		flushMicrotasks();
		sourceRequest(http).flush({ ...source, contextParameters: { permissions: ['Read'] } });
		flushMicrotasks();
		http.expectNone((request) => request.url.endsWith('/Document.RestoreVersion'));
		expect(router.navigateByUrl).not.toHaveBeenCalled();
		expect(component.canRestore()).toBeFalse();
		expect(component.busy()).toBeFalse();
		http.verify();
	}));
	it('restores the version in its repository with checkout false then navigates to the source', fakeAsync(() => {
		const { component, http, router } = setup();
		const initial = sourceRequest(http);
		expect(initial.request.headers.get('X-NXRepository')).toBe('other');
		expect(initial.request.headers.get('enrichers-document')).toBe('permissions');
		initial.flush(source);
		flushMicrotasks();
		spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(true);
		void component.restore();
		flushMicrotasks();
		const preflight = sourceRequest(http);
		expect(preflight.request.body).toEqual({ input: 'version-1', params: {} });
		expect(preflight.request.headers.get('X-NXRepository')).toBe('other');
		preflight.flush(source);
		flushMicrotasks();
		void component.restore();
		flushMicrotasks();
		const restore = http.expectOne((request) => request.url.endsWith('/Document.RestoreVersion'));
		expect(restore.request.body).toEqual({ input: 'version-1', params: { checkout: false } });
		expect(restore.request.headers.get('X-NXRepository')).toBe('other');
		expect(restore.request.headers.get('X-NXES-SYNC')).toBe('true');
		restore.flush({});
		flushMicrotasks();
		expect(router.navigateByUrl).toHaveBeenCalledOnceWith(
			'/browse/Workspace/Note?repository=other',
		);
		expect(component.busy()).toBeFalse();
		http.verify();
	}));
	it('ignores a source response from the previous repository even when the version UID matches', fakeAsync(() => {
		const { component, fixture, http } = setup();
		const obsolete = sourceRequest(http);
		fixture.componentRef.setInput('context', context({ ...version, repository: 'new-repo' }));
		fixture.detectChanges();
		const current = sourceRequest(http);
		obsolete.flush(source);
		flushMicrotasks();
		expect(component.latest()).toBeNull();
		current.flush({ ...source, repository: 'new-repo' });
		flushMicrotasks();
		expect(component.latest().repository).toBe('new-repo');
		http.verify();
	}));
	it('does not restore after navigation changes during the fresh source check', fakeAsync(() => {
		const { component, fixture, http, router } = setup();
		sourceRequest(http).flush(source);
		flushMicrotasks();
		spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(true);
		void component.restore();
		flushMicrotasks();
		const obsolete = sourceRequest(http);
		fixture.componentRef.setInput('context', context({ ...version, uid: 'version-2' }));
		fixture.detectChanges();
		sourceRequest(http).flush(source);
		obsolete.flush(source);
		flushMicrotasks();
		http.expectNone((request) => request.url.endsWith('/Document.RestoreVersion'));
		expect(router.navigateByUrl).not.toHaveBeenCalled();
		http.verify();
	}));
	it('does not navigate when restoration completes after the notice is destroyed', fakeAsync(() => {
		const { component, fixture, http, router } = setup();
		sourceRequest(http).flush(source);
		flushMicrotasks();
		spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(true);
		void component.restore();
		flushMicrotasks();
		sourceRequest(http).flush(source);
		flushMicrotasks();
		const restore = http.expectOne((request) => request.url.endsWith('/Document.RestoreVersion'));
		fixture.destroy();
		restore.flush({});
		flushMicrotasks();
		expect(router.navigateByUrl).not.toHaveBeenCalled();
		http.verify();
	}));
});
