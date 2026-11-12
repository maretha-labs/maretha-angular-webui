import { ToastService } from 'app/helpers/toast.service';
import { PdfLocaleAdapter } from './pdf-locale-adapter';
import { TemplateRef } from '@angular/core';
import { WebUiMessages } from '@maretha/webui-sdk';
import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, fakeAsync, flushMicrotasks, tick, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
	HTTP_INTERCEPTORS,
	provideHttpClient,
	withInterceptorsFromDi,
	withXhr,
} from '@angular/common/http';
import { HttpInterceptorService } from 'app/helpers/http-interceptor.service';
import { TokenService } from 'app/helpers/token.service';
import { environment } from 'environments/environment';

import { PdfRendererComponent, PDF_VIEWER_READY_TIMEOUT_MS } from './pdf-renderer.component';
import { PdfRangeBridge, PdfRangeTransport } from './pdf-range-bridge';
import { PDF_INITIAL_RANGE_BYTES } from './pdf-range-source';

describe('PdfRendererComponent', () => {
	let component: PdfRendererComponent;
	let fixture: ComponentFixture<PdfRendererComponent>;
	let http: HttpTestingController;
	let bridge: jasmine.SpyObj<PdfRangeBridge>;
	let transport: jasmine.SpyObj<PdfRangeTransport>;
	let requestRange: (begin: number, end: number) => void;
	const url = environment.nuxeoUrl + '/api/v1/id/uid/@rendition/pdf';

	beforeEach(async () => {
		transport = jasmine.createSpyObj<PdfRangeTransport>('transport', [
			'requestDataRange',
			'onDataRange',
			'onDataProgress',
			'abort',
		]);
		bridge = jasmine.createSpyObj<PdfRangeBridge>('bridge', ['create']);
		bridge.create.and.callFake(async (_length, _bytes, read, abort) => {
			requestRange = read;
			transport.abort.and.callFake(abort);
			return transport;
		});
		await TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				provideHttpClient(withXhr(), withInterceptorsFromDi()),
				provideHttpClientTesting(),
				{ provide: HTTP_INTERCEPTORS, useClass: HttpInterceptorService, multi: true },
				{ provide: PdfRangeBridge, useValue: bridge },
			],
			imports: [PdfRendererComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(PdfRendererComponent);
		component = fixture.componentInstance;
		http = TestBed.inject(HttpTestingController);
		fixture.componentRef.setInput('document', fixtureDocument());
		fixture.detectChanges();
	});

	afterEach(() => {
		fixture.destroy();
		http.verify({ ignoreCancelled: true });
	});

	it('formats the complete 150 percent zoom label in Arabic', fakeAsync(() => {
		TestBed.inject(WebUiMessages).locale.set('ar');
		fixture.detectChanges();
		expect(component.percent(150)).toBe(
			new Intl.NumberFormat('ar', { style: 'percent' }).format(1.5),
		);
		const percent = spyOn(component, 'percent').and.callThrough();
		const template = fixture.debugElement.queryAllNodes(
			(node) => !!node.references['customPdfViewerToolbar'],
		)[0].references['customPdfViewerToolbar'] as TemplateRef<unknown>;
		const view = template.createEmbeddedView({});
		view.detectChanges();
		const host = document.createElement('div');
		view.rootNodes.forEach((node) => host.appendChild(node));
		document.body.appendChild(host);
		(host.querySelector('.dropdown-toggle') as HTMLButtonElement).click();
		tick();
		view.detectChanges();
		const labels = [...document.querySelectorAll('.dropdown-item')].map((button: any) =>
			button.textContent.trim(),
		);
		expect(labels).toContain(component.percent(150));
		expect(percent).toHaveBeenCalledWith(150);
		view.destroy();
		host.remove();
	}));

	it('updates retained viewer locale notices and ignores obsolete adapter completions', async () => {
		const root = document.createElement('ngx-extended-pdf-viewer');
		fixture.nativeElement.appendChild(root);
		const update = spyOn(PdfLocaleAdapter.prototype, 'update').and.resolveTo({
			applied: false,
			directionDeferred: false,
		});
		await (component as any).refreshLocale('en-US');
		expect(component.localeNotice()).toBe('unsupported');
		update.and.resolveTo({ applied: true, directionDeferred: true });
		await (component as any).refreshLocale('en-US');
		expect(component.localeNotice()).toBe('direction');
		update.and.resolveTo({ applied: true, directionDeferred: false });
		await (component as any).refreshLocale('en-US');
		expect(component.localeNotice()).toBeNull();
		let finish!: (value: { applied: boolean; directionDeferred: boolean }) => void;
		update.and.returnValue(new Promise((resolve) => (finish = resolve)));
		const pending = (component as any).refreshLocale('en-US');
		component.loadPdf();
		finish({ applied: false, directionDeferred: false });
		await pending;
		expect(component.localeNotice()).toBeNull();
		const oldLocale = (component as any).refreshLocale('en-US');
		component.locale.set('fr');
		finish({ applied: false, directionDeferred: false });
		await oldLocale;
		expect(component.localeNotice()).toBeNull();
		root.remove();
		await (component as any).refreshLocale('fr');
	});
	it('keeps print progress and customer filenames while relocalizing and clearing the active toast', fakeAsync(() => {
		const node = document.createElement('div');
		node.id = 'printServiceDialog';
		document.body.appendChild(node);
		const toast: any = {
			toastId: 42,
			message: '',
			title: '',
			update(message: string, title?: string) {
				toast.message = message;
				if (title !== undefined) toast.title = title;
			},
		};
		const toastr = TestBed.inject(ToastService);
		const info = spyOn(toastr, 'info').and.returnValue(toast);
		const remove = spyOn(toastr, 'remove');
		const print = spyOn((component as any).pdfService, 'print');
		component.document = { ng: { attachment: { name: 'Customer {file}.pdf' } } };
		component.print();
		expect(print).toHaveBeenCalledTimes(1);
		component.beforePrint();
		tick();
		expect(info.calls.mostRecent().args[0]).toContain('Customer {file}.pdf');
		component.onPrint({ percent: 42 } as any);
		expect(component.printProgress).toBe(42);
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			fr: { 'pdf.printing': 'Impression de {name}…', 'pdf.printTitle': 'Imprimer' },
		});
		messages.locale.set('fr');
		fixture.detectChanges();
		expect(toast.message).toBe('Impression de Customer {file}.pdf…');
		expect(toast.title).toBe('Imprimer');
		expect(component.printProgress).toBe(42);
		component.afterPrint();
		expect(remove).toHaveBeenCalledWith(42);
		expect(component.printProgressToastr).toBeNull();
		expect(node.hasAttribute('style')).toBeFalse();
		component.onPrint({ percent: 99 } as any);
		expect(component.printProgress).toBe(0);
		component.afterPrint();
		node.remove();
		component.document = {};
		component.beforePrint();
		tick();
		fixture.destroy();
		expect(remove).toHaveBeenCalledTimes(2);
	}));
	it('suppresses stale loading events and cancels queued print UI after destruction', fakeAsync(() => {
		const loading = spyOn(component.loading, 'emit');
		const info = spyOn(TestBed.inject(ToastService), 'info');
		component.pdfLoading(null, -1);
		expect(loading).not.toHaveBeenCalled();
		component.pdfLoading(null);
		expect(loading).toHaveBeenCalledWith(true);
		component.zoomChanged(1.5);
		expect(component.zoom).toBe('150');
		component.beforePrint();
		fixture.destroy();
		tick();
		expect(info).not.toHaveBeenCalled();
	}));
	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('leaves the typed page number to PDF.js so only the committed page is requested', () => {
		const template = fixture.debugElement.queryAllNodes(
			(node) => !!node.references['customPdfViewerToolbar'],
		)[0].references['customPdfViewerToolbar'] as TemplateRef<unknown>;
		const view = template.createEmbeddedView({});
		view.detectChanges();
		const host = document.createElement('div');
		view.rootNodes.forEach((node) => host.appendChild(node));
		const input = host.querySelector<HTMLInputElement>('#pageNumber')!;
		expect(input.getAttribute('aria-label')).toBe('Current page');
		for (const value of ['2', '23', '239', '2398']) {
			input.value = value;
			input.dispatchEvent(new Event('input'));
			view.detectChanges();
		}
		expect(component.currentPage).toBe(1);
		view.destroy();
	});

	it('loads PDF bytes with the Nuxeo bearer token instead of relying on a browser cookie', () => {
		component.contentUrl = url;
		component.loadPdf();
		const request = http.expectOne(url);

		expect(request.request.headers.get('Authorization')).toBe('Bearer fixture-token');
		expect(request.request.responseType).toBe('arraybuffer');
		expect(request.request.headers.get('Range')).toBe('bytes=0-65535');
		request.flush(new Uint8Array([1, 2, 3]).buffer, { headers: { 'Content-Length': '3' } });
		expect(component.pdfData()).toEqual(new Uint8Array([1, 2, 3]));
		expect(component.fetching()).toBeFalse();
	});

	it('cancels a previous PDF load and cancels the active load on destruction', () => {
		component.contentUrl = url;
		component.loadPdf();
		const first = http.expectOne(url);

		component.contentUrl = url + '?version=2';
		component.loadPdf();
		const second = http.expectOne(component.contentUrl);
		expect(first.cancelled).toBeTrue();
		fixture.destroy();
		expect(second.cancelled).toBeTrue();
	});

	it('retries a failed PDF using the current token and clears the error', () => {
		component.contentUrl = url;
		component.loadPdf();
		http.expectOne(url).flush(null, { status: 404, statusText: 'Not Found' });
		expect(component.error()).toContain('Unable to display');

		TestBed.inject(TokenService).accessToken = 'refreshed-token';
		component.loadPdf();
		const retry = http.expectOne(url);
		expect(retry.request.headers.get('Authorization')).toBe('Bearer refreshed-token');
		retry.flush(new Uint8Array([1]).buffer, { headers: { 'Content-Length': '1' } });
		expect(component.error()).toBe('');
		expect(component.pdfData()).toEqual(new Uint8Array([1]));
	});

	it('offers retry when bytes arrive but the PDF engine never becomes ready', fakeAsync(() => {
		component.contentUrl = url;
		component.loadPdf();
		http.expectOne(url).flush(new Uint8Array([1]).buffer, { headers: { 'Content-Length': '1' } });
		tick(PDF_VIEWER_READY_TIMEOUT_MS);
		expect(component.pdfData()).toBeUndefined();
		expect(component.error()).toContain('Unable to display');
		expect(component.showToolbar()).toBeFalse();
	}));

	it('clears the readiness deadline once PDF.js reports a loaded document', fakeAsync(() => {
		component.contentUrl = url;
		component.loadPdf();
		http.expectOne(url).flush(new Uint8Array([1]).buffer, { headers: { 'Content-Length': '1' } });
		component.pdfLoaded(null);
		tick(PDF_VIEWER_READY_TIMEOUT_MS);
		expect(component.error()).toBe('');
		expect(component.showToolbar()).toBeTrue();
	}));

	function loadPartialPdf() {
		component.contentUrl = url;
		component.loadPdf();
		http.expectOne(url).flush(new Uint8Array(PDF_INITIAL_RANGE_BYTES).buffer, {
			status: 206,
			statusText: 'Partial Content',
			headers: { 'Content-Range': 'bytes 0-65535/131072', ETag: '"version-1"' },
		});
		flushMicrotasks();
	}

	it('keeps a rendered range-backed PDF usable without waiting for the full download', fakeAsync(() => {
		loadPartialPdf();
		const data = component.pdfData();
		component.pdfPageRendered({ pageNumber: 1 });
		tick(PDF_VIEWER_READY_TIMEOUT_MS);
		expect(component.pdfData()).toBe(data);
		expect(component.error()).toBe('');
		expect(component.showToolbar()).toBeTrue();
	}));

	it('does not treat a failed first-page render as a ready PDF', fakeAsync(() => {
		loadPartialPdf();
		component.pdfPageRendered({ pageNumber: 1, error: new Error('Render failed') });
		expect(component.pdfData()).toBeUndefined();
		expect(component.error()).toContain('Unable to display');
		expect(component.showToolbar()).toBeFalse();
	}));

	it('uses the current token for later ranges without giving PDF.js a URL or bearer token', fakeAsync(() => {
		loadPartialPdf();
		expect(component.pdfData()).toEqual({ range: transport });
		expect(bridge.create.calls.mostRecent().args[0]).toBe(131072);
		expect(component.fetching()).toBeFalse();

		TestBed.inject(TokenService).accessToken = 'next-token';
		requestRange(65536, 131072);
		const request = http.expectOne(url);
		expect(request.request.headers.get('Authorization')).toBe('Bearer next-token');
		expect(request.request.headers.get('Range')).toBe('bytes=65536-131071');
		const bytes = new Uint8Array(65536);
		bytes[0] = 42;
		request.flush(bytes.buffer, {
			status: 206,
			statusText: 'Partial Content',
			headers: { 'Content-Range': 'bytes 65536-131071/131072', ETag: '"version-1"' },
		});
		expect(transport.onDataRange).toHaveBeenCalledWith(65536, bytes);
	}));

	it('unmounts a failed range viewer and cancels its other requests', fakeAsync(() => {
		loadPartialPdf();
		requestRange(65536, 98304);
		requestRange(98304, 131072);
		const pending = http.match(url);
		pending[0].flush(null, { status: 404, statusText: 'Not Found' });
		expect(pending[1].cancelled).toBeTrue();
		expect(transport.abort).toHaveBeenCalled();
		expect(component.pdfData()).toBeUndefined();
		expect(component.error()).toContain('Unable to display');
		expect(component.fetching()).toBeFalse();
	}));

	it('cancels range requests and ignores stale callbacks after changing source', fakeAsync(() => {
		loadPartialPdf();
		requestRange(65536, 131072);
		const pending = http.expectOne(url);
		component.contentUrl = '';
		component.loadPdf();
		expect(pending.cancelled).toBeTrue();
		expect(transport.abort).toHaveBeenCalled();
		requestRange(65536, 131072);
		http.expectNone(url);
		expect(component.pdfData()).toBeUndefined();
	}));

	it('discards a transport initialized after a newer PDF has started', fakeAsync(() => {
		let resolve!: (value: PdfRangeTransport) => void;
		bridge.create.and.returnValue(new Promise((done) => (resolve = done)));
		loadPartialPdf();
		component.contentUrl = url + '?new=true';
		component.loadPdf();
		http.expectOne(component.contentUrl).flush(new Uint8Array([2]).buffer, {
			headers: { 'Content-Length': '1' },
		});
		resolve(transport);
		flushMicrotasks();
		expect(transport.abort).toHaveBeenCalled();
		expect(component.pdfData()).toEqual(new Uint8Array([2]));
	}));

	it('clears loading when the PDF.js scripts cannot initialize', fakeAsync(() => {
		bridge.create.and.rejectWith(new Error('Scripts unavailable'));
		loadPartialPdf();
		expect(component.pdfData()).toBeUndefined();
		expect(component.error()).toContain('Unable to display');
		expect(component.fetching()).toBeFalse();
	}));

	it('ignores loading events from a viewer replaced by a newer source', fakeAsync(() => {
		loadPartialPdf();
		const oldGeneration = component.pdfViews()[0].generation;
		component.contentUrl = url + '?new=true';
		component.loadPdf();
		const pending = http.expectOne(component.contentUrl);
		component.pdfLoadingFailed(null, oldGeneration);
		expect(pending.cancelled).toBeFalse();
		expect(component.error()).toBe('');
		const shown = component.pdfData();
		(component as any).displayPdf(
			null,
			{ complete: true, bytes: new Uint8Array([9]) },
			oldGeneration,
		);
		tick();
		expect(component.pdfData()).toBe(shown);
		pending.flush(new Uint8Array([2]).buffer, { headers: { 'Content-Length': '1' } });
		component.pdfLoaded(null, oldGeneration);
		expect(component.showToolbar()).toBeFalse();
		component.pdfLoaded(null, component.pdfViews()[0].generation);
		expect(component.showToolbar()).toBeTrue();
		const loading = spyOn(component.loading, 'emit');
		component.pdfLoading(null, oldGeneration);
		expect(loading).not.toHaveBeenCalled();
	}));

	it('handles range transport onDataRange throws by failing the active PDF load', fakeAsync(() => {
		loadPartialPdf();
		transport.onDataRange.and.throwError('corrupt range');
		requestRange(65536, 131072);
		const req = http.expectOne(url);
		req.flush(new Uint8Array(65536).buffer, {
			status: 206,
			statusText: 'Partial Content',
			headers: { 'Content-Range': 'bytes 65536-131071/131072', ETag: '"version-1"' },
		});
		expect(component.error()).toContain('Unable to display');
	}));
	it('requests only the declared blob length for a small file and ignores unrelated input changes', () => {
		fixture.componentRef.setInput('document', {
			...fixtureDocument(),
			properties: { 'file:content': { length: '1000' } },
		});
		component.ngOnChanges({});
		http.expectNone(url);
		expect(component.fetching()).toBeFalse();
		fixture.componentRef.setInput('contentUrl', url);
		fixture.detectChanges();
		expect(http.expectOne(url).request.headers.get('Range')).toBe('bytes=0-999');
		expect(component.fetching()).toBeTrue();
		fixture.componentRef.setInput('document', { ...fixtureDocument(), properties: {} });
		component.loadPdf();
		expect(http.expectOne(url).request.headers.get('Range')).toBe('bytes=0-65535');
		component.contentUrl = '';
		component.loadPdf();
		http.expectNone(url);
		expect(component.fetching()).toBeFalse();
		expect(component.pdfData()).toBeUndefined();
	});

	it('does not announce a print once the viewer is gone before the toast is due', fakeAsync(() => {
		const info = spyOn(TestBed.inject(ToastService), 'info');
		// A repeated print request leaves the first announcement timer running past destruction.
		component.beforePrint();
		component.beforePrint();
		component.ngOnDestroy();
		tick();
		expect(info).not.toHaveBeenCalled();
		component.afterPrint();
	}));
});
