import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
	HTTP_INTERCEPTORS,
	provideHttpClient,
	withInterceptorsFromDi,
	withXhr,
} from '@angular/common/http';
import { HttpInterceptorService } from 'app/helpers/http-interceptor.service';
import { environment } from 'environments/environment';
import { EMPTY } from 'rxjs';
import { DocumentAttachmentsService } from 'app/modules/explorer/helpers/document-attachments.service';
import { MetadataPolicyService } from 'app/modules/explorer/helpers/metadata-policy.service';

import { ImageRendererComponent } from './image-renderer.component';

describe('ImageRendererComponent', () => {
	let component: ImageRendererComponent;
	let fixture: ComponentFixture<ImageRendererComponent>;
	let http: HttpTestingController;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				provideHttpClient(withXhr(), withInterceptorsFromDi()),
				provideHttpClientTesting(),
				{ provide: HTTP_INTERCEPTORS, useClass: HttpInterceptorService, multi: true },
				{
					provide: DocumentAttachmentsService,
					useValue: {
						downloadAttachment: () => EMPTY,
						downloadDocumentBlob: jasmine.createSpy('downloadDocumentBlob').and.returnValue(EMPTY),
					},
				},
				{
					provide: MetadataPolicyService,
					useValue: {
						userPreferences: () => ({ hiddenSchemas: [], hiddenFields: [] }),
						canRead: () => true,
					},
				},
			],
			imports: [ImageRendererComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(ImageRendererComponent);
		component = fixture.componentInstance;
		http = TestBed.inject(HttpTestingController);
		fixture.componentRef.setInput('document', fixtureDocument());
		fixture.detectChanges();
	});

	afterEach(() => {
		fixture.destroy();
		http.verify({ ignoreCancelled: true });
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
	it('offers the native viewer control order and pans the image through its directional buttons', () => {
		component.naturalWidth.set(480);
		fixture.detectChanges();
		const buttons = [
			...fixture.nativeElement.querySelectorAll('.viewer-toolbar button'),
		] as HTMLButtonElement[];
		expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
			'Zoom out',
			'Fit to real size',
			'Zoom in',
			'Rotate left',
			'Rotate right',
			'Pan left',
			'Pan up',
			'Pan down',
			'Pan right',
		]);
		buttons[5].click();
		expect(component.pan()).toEqual({ x: -20, y: 0 });
		buttons[8].click();
		expect(component.pan()).toEqual({ x: 0, y: 0 });
	});
	it('fits both image dimensions and recalculates the fit after rotation', () => {
		(component as any).stageSize.set({ width: 800, height: 600 });
		component.naturalWidth.set(1600);
		component.naturalHeight.set(400);
		expect(component.imageScale()).toBe(0.5);
		component.rotate(90);
		expect(component.imageScale()).toBe(0.375);
		expect(component.imageTransform()).toContain('rotate(90deg)');
		component.zoom.set(100);
		expect(component.imageScale()).toBe(1);
		component.fitImage();
		expect(component.imageScale()).toBe(0.375);
	});
	it('anchors controls to the visible image edge and keeps them reachable after zoom, rotation and panning', () => {
		(component as any).stageSize.set({ width: 800, height: 600 });
		(component as any).toolbarHeight.set(44);
		component.naturalWidth.set(1600);
		component.naturalHeight.set(400);
		// The fitted panorama is only 200px high inside a 600px stage.
		expect(component.toolbarBottom()).toBe(208);
		component.rotate(90);
		expect(component.toolbarBottom()).toBe(8);
		component.rotate(-90);
		component.zoom.set(100);
		expect(component.toolbarBottom()).toBe(108);
		component.panImage(0, -450);
		// Keep the full control strip inside the stage when only the image's bottom edge remains visible.
		expect(component.toolbarBottom()).toBe(548);
		(component as any).toolbarHeight.set(100);
		expect(component.toolbarBottom()).toBe(492);
		component.panImage(0, -100);
		expect(component.toolbarBottom()).toBe(8);
		component.fitImage();
		component.panImage(1300, 0);
		expect(component.toolbarBottom()).toBe(8);
	});
	it('keeps toolbar pointer and keyboard interactions separate from image panning', () => {
		component.naturalWidth.set(480);
		component.naturalHeight.set(640);
		fixture.detectChanges();
		const button: HTMLButtonElement = fixture.nativeElement.querySelector('.viewer-toolbar button');
		button.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }),
		);
		button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
		expect(component.dragging()).toBeFalse();
		expect(component.pan()).toEqual({ x: 0, y: 0 });
		button.click();
		expect(component.zoom()).not.toBeNull();
	});
	it('supports pointer and keyboard panning and resets pan when fitting or changing content', () => {
		component.naturalWidth.set(1600);
		const stage = fixture.nativeElement.querySelector('.image-preview');
		spyOn(stage, 'setPointerCapture');
		component.startPan(
			new PointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 20, button: 0 }),
		);
		component.movePan(new PointerEvent('pointermove', { pointerId: 2, clientX: 90, clientY: 90 }));
		expect(component.pan()).toEqual({ x: 0, y: 0 });
		component.movePan(new PointerEvent('pointermove', { pointerId: 1, clientX: 50, clientY: 80 }));
		expect(component.pan()).toEqual({ x: 40, y: 60 });
		component.endPan(new PointerEvent('pointerup', { pointerId: 1 }));
		expect(component.dragging()).toBeFalse();
		stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
		expect(component.pan()).toEqual({ x: 20, y: 60 });
		component.fitImage();
		expect(component.pan()).toEqual({ x: 0, y: 0 });
		component.rotate(90);
		fixture.componentRef.setInput('contentUrl', '/replacement');
		fixture.detectChanges();
		expect(component.rotation()).toBe(0);
		expect(component.pan()).toEqual({ x: 0, y: 0 });
		http.expectOne('/replacement');
	});
	it('passes saved original and rendition metadata to native downloads without using their URLs as authority', () => {
		const document: any = fixtureDocument('Picture');
		const main = { digest: 'original', name: 'image.png' };
		const rendition = { digest: 'rendition', name: 'small.png' };
		document.ng.attachment = main;
		document.properties['file:content'] = main;
		document.properties['picture:views'] = [null, { content: rendition }];
		component.document = document;
		component.downloadBlob(main);
		component.downloadBlob(rendition);
		const downloads = TestBed.inject(DocumentAttachmentsService)
			.downloadDocumentBlob as jasmine.Spy;
		expect(downloads.calls.allArgs()).toEqual([
			[document, main],
			[document, rendition],
		]);
	});

	it('loads protected renditions with bearer authentication without a Nuxeo browser cookie', () => {
		spyOn(URL, 'createObjectURL').and.returnValue('blob:protected-image');
		const url = environment.nuxeoUrl + '/nxfile/default/uid/file:content/photo.jpg';
		fixture.componentRef.setInput('contentUrl', url);
		fixture.detectChanges();
		const request = http.expectOne(url);

		expect(request.request.headers.get('Authorization')).toBe('Bearer fixture-token');
		request.flush(new Blob(['image'], { type: 'image/jpeg' }));
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(
			'blob:protected-image',
		);
	});

	it('loads the preferred rendition through HttpClient and binds its object URL', () => {
		spyOn(URL, 'createObjectURL').and.returnValue('blob:preview');
		const document: any = fixtureDocument('Picture');
		document.ng.attachment = { data: '/original', name: 'photo.jpg' };
		document.properties['picture:views'] = [
			{ title: 'Small', content: { data: '/small' }, info: {} },
			{ title: 'FullHD', content: { data: '/fullhd' }, info: {} },
		];
		fixture.componentRef.setInput('document', document);
		fixture.componentRef.setInput('contentUrl', '/original');
		fixture.detectChanges();
		http
			.match('/fullhd')
			.find((request) => !request.cancelled)!
			.flush(new Blob(['image'], { type: 'image/jpeg' }));
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe('blob:preview');
	});

	it('cancels the previous source and revokes its object URL when inputs change', () => {
		spyOn(URL, 'createObjectURL').and.returnValue('blob:first');
		const revoke = spyOn(URL, 'revokeObjectURL');
		fixture.componentRef.setInput('contentUrl', '/first');
		fixture.detectChanges();
		http.expectOne('/first').flush(new Blob(['first'], { type: 'image/jpeg' }));
		fixture.componentRef.setInput('contentUrl', '/second');
		fixture.detectChanges();
		expect(revoke).toHaveBeenCalledWith('blob:first');
		const pending = http.expectOne('/second');
		fixture.componentRef.setInput('contentUrl', '/third');
		fixture.detectChanges();
		expect(pending.cancelled).toBeTrue();
		http.expectOne('/third').flush(new Blob(['third'], { type: 'image/jpeg' }));
	});

	it('explains that placeholder-only HEIC renditions need server conversion after decode fails', () => {
		spyOn(URL, 'createObjectURL').and.returnValue('blob:heic');
		const document: any = fixtureDocument('Picture');
		document.ng.attachment = { data: '/heic', name: 'photo.heic' };
		document.properties['picture:views'] = [
			{ title: 'FullHD', content: { data: '/img/empty_picture.png' }, info: {} },
		];
		fixture.componentRef.setInput('document', document);
		fixture.componentRef.setInput('contentUrl', '/heic');
		fixture.detectChanges();
		http
			.match('/heic')
			.find((request) => !request.cancelled)!
			.flush(new Blob(['heic'], { type: 'image/heic' }));
		component.onImageError('blob:heic');
		expect(component.error()).toContain('server conversion');
	});

	it('ignores stale image events after selecting another rendition', () => {
		spyOn(URL, 'createObjectURL').and.returnValues('blob:fullhd', 'blob:small');
		const document: any = fixtureDocument('Picture');
		document.properties['picture:views'] = [
			{ title: 'FullHD', content: { data: '/fullhd' }, info: {} },
			{ title: 'Small', content: { data: '/small' }, info: {} },
		];
		fixture.componentRef.setInput('document', document);
		fixture.detectChanges();
		http.expectOne('/fullhd').flush(new Blob(['fullhd'], { type: 'image/jpeg' }));

		component.selectView(document.properties['picture:views'][1]);
		http.expectOne('/small').flush(new Blob(['small'], { type: 'image/jpeg' }));
		component.onImageError('blob:fullhd');

		expect(component.selectedUrl()).toBe('/small');
		expect(component.imageUrl()).toBe('blob:small');
		expect(component.loading()).toBeTrue();
		component.onImageLoad('blob:small');
		expect(component.loading()).toBeFalse();
	});
});
