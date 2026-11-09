import { TestBed } from '@angular/core/testing';
import { BlobActionContext, ExtensionRegistry } from '@maretha/webui-sdk';
import { blobAppLinks } from './blob-app-links';
import { BlobAppLinksComponent } from './blob-app-links.component';
import { provideDefaultFileActions } from './default-file-actions';

describe('Blob app links', () => {
	const context = (blob: Record<string, unknown>): BlobActionContext => ({
		document: { uid: 'doc', repository: 'default' },
		blob,
		xpath: 'file:content',
		draft: false,
		noEdit: true,
		allowedMimeTypes: [],
	});
	const drive = { appName: 'Drive', link: 'nxdrive://edit/doc', icon: '/icons/drive.png' };

	it('keeps entries with a link and an icon, as nuxeo-link-button does', () => {
		expect(
			blobAppLinks(
				context({
					appLinks: [drive, { appName: 'No icon', link: 'https://x' }, null, { icon: '/i.png' }],
				}),
			),
		).toEqual([drive]);
		expect(blobAppLinks(context({}))).toEqual([]);
		expect(blobAppLinks(context({ appLinks: 'not a list' }))).toEqual([]);
	});

	it('registers after the default blob actions only for blobs with app links', async () => {
		TestBed.configureTestingModule({ providers: [provideDefaultFileActions()] });
		const registry = TestBed.inject(ExtensionRegistry);
		const ids = (blob: Record<string, unknown>) =>
			registry.resolve('BLOB_ACTIONS', context(blob)).items.map((item) => item.id);
		expect(ids({ appLinks: [drive] }).at(-1)).toBe('maretha.blob.app-links');
		expect(ids({ appLinks: [] })).not.toContain('maretha.blob.app-links');
		const item = registry
			.resolve('BLOB_ACTIONS', context({ appLinks: [drive] }))
			.items.find((entry) => entry.id === 'maretha.blob.app-links');
		expect(await item!.loadComponent!()).toBe(BlobAppLinksComponent);
	});

	it('opens each link in a new tab with its icon and app name', () => {
		TestBed.configureTestingModule({ imports: [BlobAppLinksComponent] });
		const fixture = TestBed.createComponent(BlobAppLinksComponent);
		fixture.componentRef.setInput(
			'context',
			context({
				appLinks: [drive, { appName: 'Script', link: 'javascript:alert(1)', icon: '/s.png' }],
			}),
		);
		fixture.detectChanges();
		const [link, script] = Array.from(
			fixture.nativeElement.querySelectorAll('a'),
		) as HTMLAnchorElement[];
		expect(link.getAttribute('href')).toBe('nxdrive://edit/doc');
		expect(link.target).toBe('_blank');
		expect(link.rel).toBe('noopener noreferrer');
		expect(link.getAttribute('aria-label')).toBe('Drive');
		expect(link.querySelector('img')!.getAttribute('src')).toBe('/icons/drive.png');
		expect(script.getAttribute('href')).toBe('unsafe:javascript:alert(1)');
	});
});
