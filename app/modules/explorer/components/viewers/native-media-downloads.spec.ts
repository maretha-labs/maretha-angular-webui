import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { BlobDeliveryService } from 'app/helpers/blob-delivery.service';
import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { DocumentAttachmentsService } from '../../helpers/document-attachments.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { MetadataPolicyService } from '../../helpers/metadata-policy.service';
import { VideoRendererComponent } from './video-renderer/video-renderer.component';
import { StandardContentLayoutComponent } from './standard-content-layout.component';
import { DocumentDetailsPanelComponent } from './document-details-panel.component';

describe('Native media download controls', () => {
	const original = {
		name: 'original.mp4',
		data: '/raw-original',
		digest: 'original',
		length: 100,
		'mime-type': 'video/mp4',
	};
	const converted = {
		name: 'converted.mp4',
		data: '/raw-converted',
		digest: 'converted',
		length: 50,
		'mime-type': 'video/mp4',
	};
	const info = { width: 100, height: 100, frameRate: 30, duration: 5, format: 'mp4' };
	let downloads: jasmine.Spy;
	beforeEach(() => {
		downloads = jasmine.createSpy('downloadDocumentBlob').and.returnValue(of(undefined));
		spyOn(HTMLMediaElement.prototype, 'load');
		spyOn(HTMLMediaElement.prototype, 'pause');
		TestBed.configureTestingModule({
			imports: [VideoRendererComponent, StandardContentLayoutComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: DocumentAttachmentsService, useValue: { downloadDocumentBlob: downloads } },
				{ provide: DocumentsManagerService, useValue: {} },
				{ provide: DocumentLayoutGatewayService, useValue: {} },
				{
					provide: MetadataPolicyService,
					useValue: {
						revision: signal(0),
						canRead: () => true,
						canWrite: () => false,
						userPreferences: () => ({ metadataHidden: false }),
					},
				},
				{
					provide: BlobDeliveryService,
					useValue: {
						createGrant: () =>
							of({
								id: 'grant',
								url: 'https://app.example/content/grant',
								expiresAt: Date.now() + 300_000,
							}),
						revokeGrant: () => of(undefined),
						sessionEnded$: new Subject<void>(),
					},
				},
			],
		}).overrideComponent(StandardContentLayoutComponent, {
			remove: { imports: [DocumentDetailsPanelComponent] },
			add: { schemas: [NO_ERRORS_SCHEMA] },
		});
	});
	for (const component of [VideoRendererComponent, StandardContentLayoutComponent])
		it(`${component.name} uses buttons so alternate link activation cannot bypass the grant`, () => {
			const doc: any = fixtureDocument('Video');
			doc.properties['file:content'] = original;
			doc.ng.attachment = original;
			doc.properties['vid:info'] = info;
			doc.properties['vid:transcodedVideos'] = [{ name: 'Conversion', content: converted, info }];
			const fixture = TestBed.createComponent<
				VideoRendererComponent | StandardContentLayoutComponent
			>(component);
			fixture.componentRef.setInput('document', doc);
			if (component === StandardContentLayoutComponent)
				fixture.componentRef.setInput('noEdit', true);
			fixture.detectChanges();
			expect(fixture.nativeElement.querySelectorAll('a[href]').length).toBe(0);
			const buttons = fixture.nativeElement.querySelectorAll(
				component === VideoRendererComponent ? 'button.btn-link' : 'button.download-link',
			) as NodeListOf<HTMLButtonElement>;
			expect(buttons.length).toBe(2);
			buttons.forEach((button) => {
				expect(button.type).toBe('button');
				button.click();
			});
			expect(downloads.calls.allArgs()).toContain([doc, original]);
			expect(downloads.calls.allArgs()).toContain([doc, converted]);
			expect(fixture.nativeElement.querySelector('video').src).toBe(
				'https://app.example/content/grant',
			);
			fixture.destroy();
		});
});
