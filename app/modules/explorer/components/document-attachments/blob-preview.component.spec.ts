import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { BlobPreviewComponent } from './blob-preview.component';
import { environment } from 'environments/environment';
import { BlobDeliveryService } from 'app/helpers/blob-delivery.service';
import { Subject, of } from 'rxjs';
describe('Blob preview', () => {
	beforeEach(() =>
		TestBed.configureTestingModule({
			imports: [BlobPreviewComponent],
			providers: [...legacyTestProviders()],
		}),
	);
	function render(blob: Record<string, unknown> | Blob) {
		const f = TestBed.createComponent(BlobPreviewComponent);
		f.componentRef.setInput('context', {
			document: { uid: 'doc', repository: 'default' },
			blob,
			xpath: 'files:files/0/file',
			draft: true,
			noEdit: true,
			allowedMimeTypes: [],
		});
		f.detectChanges();
		return f;
	}
	it('previews a local draft and revokes its object URL on close without closing itself during loading', async () => {
		const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:fixture');
		const revoke = spyOn(URL, 'revokeObjectURL');
		const f = render(new File(['image'], 'image.png', { type: 'image/png' }));
		await f.componentInstance.load();
		f.detectChanges();
		expect(create).toHaveBeenCalled();
		expect(f.componentInstance.kind()).toBe('image');
		expect(f.componentInstance.url()).toBe('blob:fixture');
		f.componentInstance.clear();
		expect(revoke).toHaveBeenCalledWith('blob:fixture');
		expect(f.componentInstance.url()).toBe('');
	});
	it('renders HTML as inert text and never interprets markup', async () => {
		const f = render(new File(['<script>alert(1)</script>'], 'x.html', { type: 'text/html' }));
		await f.componentInstance.load();
		f.detectChanges();
		expect(f.nativeElement.querySelector('pre').textContent).toContain('<script>');
		expect(f.nativeElement.querySelector('script')).toBeNull();
	});
	it('cancels an authenticated preview request when the dialog closes', async () => {
		const f = render({
			data: environment.nuxeoUrl + '/nxfile/default/doc/file:content/x.pdf',
			'mime-type': 'application/pdf',
		});
		const result = f.componentInstance.load();
		const http = TestBed.inject(HttpTestingController);
		const request = http.expectOne((req) => req.url.includes('/nxfile/'));
		expect(request.request.responseType).toBe('blob');
		f.componentInstance.clear();
		expect(request.cancelled).toBeTrue();
		await result;
		expect(f.componentInstance.error()).toBe('');
		expect(f.componentInstance.kind()).toBe('');
		http.verify();
	});
	it('does not request arbitrary external URLs supplied as blob metadata', async () => {
		const f = render({ data: 'https://untrusted.example/file', 'mime-type': 'image/png' });
		await f.componentInstance.load();
		expect(f.componentInstance.error()).toContain('unavailable');
		TestBed.inject(HttpTestingController).expectNone(() => true);
	});
	it('does not convert a draft XPath that may now identify another saved attachment', async () => {
		const f = render({
			data: environment.nuxeoUrl + '/nxfile/default/doc/files:files/0/file/x.docx',
			'mime-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			digest: 'saved-blob',
		});
		await f.componentInstance.load();
		expect(f.componentInstance.error()).toContain('unavailable');
		TestBed.inject(HttpTestingController).expectNone(() => true);
	});
	it('streams saved media through a typed grant instead of requesting the complete blob', async () => {
		const grant = {
			id: 'media',
			url: 'https://app.example/content/media',
			expiresAt: Date.now() + 300_000,
		};
		const createGrant = jasmine.createSpy('createGrant').and.returnValue(of(grant));
		const revokeGrant = jasmine.createSpy('revokeGrant').and.returnValue(of(undefined));
		TestBed.overrideProvider(BlobDeliveryService, {
			useValue: { createGrant, revokeGrant, sessionEnded$: new Subject<void>() },
		});
		spyOn(HTMLMediaElement.prototype, 'load');
		spyOn(HTMLMediaElement.prototype, 'pause');
		const blob = { digest: 'saved', data: 'https://unused.example/blob', 'mime-type': 'video/mp4' };
		const f = render(blob);
		f.componentRef.setInput('context', {
			document: { uid: 'doc', properties: { 'files:files': [null, { file: blob }] } },
			blob,
			xpath: 'files:files/0/file',
			draft: true,
			noEdit: true,
			allowedMimeTypes: [],
		});
		f.detectChanges();
		await f.componentInstance.load();
		f.detectChanges();
		expect(f.componentInstance.kind()).toBe('stream-video');
		expect(createGrant).toHaveBeenCalledWith(
			{
				repository: 'default',
				documentId: 'doc',
				xpath: 'files:files/1/file',
				expectedDigest: 'saved',
			},
			'inline',
		);
		expect(f.nativeElement.querySelector('video').src).toBe(grant.url);
		TestBed.inject(HttpTestingController).expectNone(() => true);
		f.componentInstance.clear();
		f.detectChanges();
		expect(revokeGrant).toHaveBeenCalledWith(grant);
	});
});
