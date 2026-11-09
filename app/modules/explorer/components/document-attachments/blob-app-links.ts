import { BlobActionContext } from '@maretha/webui-sdk';

export interface BlobAppLink {
	readonly appName: string;
	readonly link: string;
	readonly icon: string;
}

/** The blob's `appLinks` enricher entries that nuxeo-link-button would render: a link and an icon. */
export function blobAppLinks(context: BlobActionContext): readonly BlobAppLink[] {
	const links = context.blob['appLinks'];
	return Array.isArray(links)
		? links.flatMap((item: unknown) => {
				const entry = (item ?? {}) as Record<string, unknown>;
				const link = entry['link'];
				const icon = entry['icon'];
				return typeof link === 'string' && link && typeof icon === 'string' && icon
					? [{ appName: typeof entry['appName'] === 'string' ? entry['appName'] : '', link, icon }]
					: [];
			})
		: [];
}
