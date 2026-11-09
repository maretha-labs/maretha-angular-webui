import { environment } from 'environments/environment';

/** The server's own type icon (`common:icon`, what stock Web UI shows beside titles), or null. */
export function documentTypeIconUrl(
	document: { properties?: Record<string, unknown> } | null | undefined,
): string | null {
	const icon = document?.properties?.['common:icon'];
	return typeof icon === 'string' && /^\/[\w./-]+\.(?:png|gif|svg|jpe?g)$/i.test(icon)
		? environment.nuxeoUrl + icon
		: null;
}

/** Core document type glyphs. Custom types can continue to supply their own icons. */
export function documentTypeIcon(
	document: { type?: string; facets?: readonly string[] } | string | null | undefined,
): string {
	const type = typeof document === 'string' ? document : document?.type;
	return (
		(
			{
				Audio: 'av:volume-up',
				Video: 'av:play-circle-outline',
				Picture: 'nuxeo:picture',
				Note: 'av:note',
				Folder: 'icons:folder',
				OrderedFolder: 'icons:folder-ordered',
				PictureBook: 'nuxeo:picture',
				Root: 'icons:folder',
				WorkspaceRoot: 'icons:folder',
				SectionRoot: 'icons:folder',
				TemplateRoot: 'icons:folder',
				UserWorkspacesRoot: 'icons:folder',
				Collections: 'nuxeo:collections',
				Section: 'icons:folder',
				Workspace: 'icons:folder',
				Domain: 'icons:folder',
				Collection: 'nuxeo:collections',
			} as Record<string, string>
		)[type ?? ''] ??
		(typeof document === 'object' && document?.facets?.includes('Folderish')
			? 'icons:folder'
			: 'icons:description')
	);
}

export function documentTypeLabel(type: string): { key: string; fallback: string } {
	return {
		key: `label.document.type.${type.toLowerCase()}`,
		fallback:
			(
				{
					OrderedFolder: 'Ordered Folder',
					NX3D: '3D Model',
					ThreeD: '3D Model',
					PictureBook: 'Picture Book',
					WorkspaceRoot: 'Workspaces',
					SectionRoot: 'Sections',
					TemplateRoot: 'Templates',
					UserWorkspacesRoot: 'Personal Workspaces',
					Root: 'Repository',
				} as Record<string, string>
			)[type] ?? type,
	};
}

export function documentStatePresentation(value: unknown): { key?: string; fallback: string } {
	const state = String(value ?? '');
	const names: Record<string, string> = {
		project: 'Project',
		approved: 'Approved',
		obsolete: 'Obsolete',
		deleted: 'Deleted',
	};
	return Object.hasOwn(names, state)
		? { key: `label.ui.state.${state}`, fallback: names[state] }
		: { fallback: state };
}
