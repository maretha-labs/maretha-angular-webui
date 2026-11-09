import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { BlobActionContext, WebUiMessages } from '@maretha/webui-sdk';
import { BlobAppLink, blobAppLinks } from './blob-app-links';

/** Polymer's blobAppLinks: one nuxeo-link-button per app link, opened in a new tab. */
@Component({
	selector: 'nx-blob-app-links',
	template: `@for (item of links(); track item.link) {
		<a
			[href]="item.link"
			target="_blank"
			rel="noopener noreferrer"
			[attr.aria-label]="label(item)"
			[title]="label(item)"
			><img [src]="item.icon" alt=""
		/></a>
	}`,
	styles:
		':host { display:inline-flex; align-items:center; } a { display:flex; padding:8px; color:inherit; } img { width:24px; height:24px; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlobAppLinksComponent {
	private readonly messages = inject(WebUiMessages);
	readonly context = input.required<BlobActionContext>();
	readonly links = computed(() => blobAppLinks(this.context()));

	label(item: BlobAppLink): string {
		return this.messages.text(item.appName || undefined, item.appName);
	}
}
