import {
	DocumentLayoutContext,
	DocumentLayoutDefinition,
	DocumentLayoutExtension,
	DocumentLayoutMode,
	provideDocumentLayoutExtensions,
} from '@maretha/webui-sdk';
import {
	declaresNoLayout,
	FALLBACK_MEDIA_METADATA_LAYOUT_ID,
	FALLBACK_METADATA_LAYOUT_ID,
} from '../helpers/fallback-document-layouts';
export {
	FALLBACK_LAYOUT_IDS,
	LAYOUT_AUTHORING_DOC,
	isFallbackLayout,
	reportFallbackMetadataLayout,
	resetFallbackMetadataLayoutReports,
} from '../helpers/fallback-document-layouts';
import { EmptyDocumentLayoutComponent } from './empty-document-layout.component';
import { DefaultDocumentMetadataLayoutComponent } from './default-document-metadata-layout.component';
import { StandardContentLayoutComponent } from './viewers/standard-content-layout.component';
import { StandardContentMetadataComponent } from './viewers/standard-content-metadata.component';
import { FolderishDetailsLayoutComponent } from './viewers/folderish-details-layout.component';
import { PictureBookContentLayoutComponent } from './viewers/picturebook-content-layout.component';
import { StandardContentEditorComponent } from './editors/standard-content-editor.component';
import { StandardContentImportComponent } from './editors/standard-content-import.component';

const FOLDERISH_DETAILS_TYPES = new Set([
	'Folder',
	'Collection',
	'Favorites',
	'Workspace',
	'Domain',
	'Section',
	'OrderedFolder',
	'PictureBook',
	'Collections',
	'Root',
	'SectionRoot',
	'TemplateRoot',
	'UserWorkspacesRoot',
	'WorkspaceRoot',
]);

/**
 * Every pinned document layout resource.  This is deliberately a source manifest,
 * rather than a broad "generic" claim: a missing source resource has no default.
 */
const SOURCE_LAYOUT_PATHS = [
	'audio/nuxeo-audio-create-layout.html',
	'audio/nuxeo-audio-edit-layout.html',
	'audio/nuxeo-audio-import-layout.html',
	'audio/nuxeo-audio-metadata-layout.html',
	'audio/nuxeo-audio-view-layout.html',
	'collection/nuxeo-collection-create-layout.html',
	'collection/nuxeo-collection-edit-layout.html',
	'collection/nuxeo-collection-metadata-layout.html',
	'collection/nuxeo-collection-view-layout.html',
	'collections/nuxeo-collections-create-layout.html',
	'collections/nuxeo-collections-edit-layout.html',
	'collections/nuxeo-collections-metadata-layout.html',
	'collections/nuxeo-collections-view-layout.html',
	'domain/nuxeo-domain-create-layout.html',
	'domain/nuxeo-domain-edit-layout.html',
	'domain/nuxeo-domain-metadata-layout.html',
	'domain/nuxeo-domain-view-layout.html',
	'favorites/nuxeo-favorites-edit-layout.html',
	'favorites/nuxeo-favorites-metadata-layout.html',
	'favorites/nuxeo-favorites-view-layout.html',
	'file/nuxeo-file-create-layout.html',
	'file/nuxeo-file-edit-layout.html',
	'file/nuxeo-file-import-layout.html',
	'file/nuxeo-file-metadata-layout.html',
	'file/nuxeo-file-view-layout.html',
	'folder/nuxeo-folder-create-layout.html',
	'folder/nuxeo-folder-edit-layout.html',
	'folder/nuxeo-folder-metadata-layout.html',
	'folder/nuxeo-folder-view-layout.html',
	'note/nuxeo-note-create-layout.html',
	'note/nuxeo-note-edit-layout.html',
	'note/nuxeo-note-import-layout.html',
	'note/nuxeo-note-metadata-layout.html',
	'note/nuxeo-note-view-layout.html',
	'orderedfolder/nuxeo-orderedfolder-create-layout.html',
	'orderedfolder/nuxeo-orderedfolder-edit-layout.html',
	'orderedfolder/nuxeo-orderedfolder-metadata-layout.html',
	'orderedfolder/nuxeo-orderedfolder-view-layout.html',
	'picture/nuxeo-picture-create-layout.html',
	'picture/nuxeo-picture-edit-layout.html',
	'picture/nuxeo-picture-import-layout.html',
	'picture/nuxeo-picture-metadata-layout.html',
	'picture/nuxeo-picture-view-layout.html',
	'picturebook/nuxeo-picturebook-edit-layout.html',
	'picturebook/nuxeo-picturebook-metadata-layout.html',
	'picturebook/nuxeo-picturebook-view-layout.html',
	'root/nuxeo-root-edit-layout.html',
	'root/nuxeo-root-metadata-layout.html',
	'root/nuxeo-root-view-layout.html',
	'section/nuxeo-section-create-layout.html',
	'section/nuxeo-section-edit-layout.html',
	'section/nuxeo-section-metadata-layout.html',
	'section/nuxeo-section-view-layout.html',
	'sectionroot/nuxeo-sectionroot-edit-layout.html',
	'sectionroot/nuxeo-sectionroot-metadata-layout.html',
	'sectionroot/nuxeo-sectionroot-view-layout.html',
	'template/nuxeo-template-edit-layout.html',
	'templateroot/nuxeo-templateroot-edit-layout.html',
	'templateroot/nuxeo-templateroot-metadata-layout.html',
	'templateroot/nuxeo-templateroot-view-layout.html',
	'userworkspacesroot/nuxeo-userworkspacesroot-edit-layout.html',
	'userworkspacesroot/nuxeo-userworkspacesroot-metadata-layout.html',
	'userworkspacesroot/nuxeo-userworkspacesroot-view-layout.html',
	'video/nuxeo-video-create-layout.html',
	'video/nuxeo-video-edit-layout.html',
	'video/nuxeo-video-import-layout.html',
	'video/nuxeo-video-metadata-layout.html',
	'video/nuxeo-video-view-layout.html',
	'workspace/nuxeo-workspace-create-layout.html',
	'workspace/nuxeo-workspace-edit-layout.html',
	'workspace/nuxeo-workspace-metadata-layout.html',
	'workspace/nuxeo-workspace-view-layout.html',
	'workspaceroot/nuxeo-workspaceroot-create-layout.html',
	'workspaceroot/nuxeo-workspaceroot-edit-layout.html',
	'workspaceroot/nuxeo-workspaceroot-metadata-layout.html',
	'workspaceroot/nuxeo-workspaceroot-view-layout.html',
] as const;

const DOCUMENT_TYPES: Readonly<Record<string, string>> = {
	audio: 'Audio',
	collection: 'Collection',
	collections: 'Collections',
	domain: 'Domain',
	favorites: 'Favorites',
	file: 'File',
	folder: 'Folder',
	note: 'Note',
	orderedfolder: 'OrderedFolder',
	picture: 'Picture',
	picturebook: 'PictureBook',
	root: 'Root',
	section: 'Section',
	sectionroot: 'SectionRoot',
	template: 'Template',
	templateroot: 'TemplateRoot',
	userworkspacesroot: 'UserWorkspacesRoot',
	video: 'Video',
	workspace: 'Workspace',
	workspaceroot: 'WorkspaceRoot',
};

function manifestEntry(path: string): DocumentLayoutDefinition {
	const [folder, file] = path.split('/');
	const mode = file.match(
		/-(create|edit|import|metadata|view)-layout\.html$/,
	)?.[1] as DocumentLayoutMode;
	return Object.freeze({
		id: `default.document-layout.${folder}.${mode}`,
		documentType: DOCUMENT_TYPES[folder],
		mode,
		source: `elements/document/${path}`,
		// Nuxeo's WorkspaceRoot create resource is intentionally empty: mount no fields,
		// rather than substituting the generic editor or forbidding document creation.
		component:
			['create', 'edit'].includes(mode) &&
			[
				'audio',
				'folder',
				'file',
				'picture',
				'video',
				'note',
				'collection',
				'favorites',
				'orderedfolder',
				'workspace',
				'domain',
				'section',
				'picturebook',
				'root',
				'workspaceroot',
				'sectionroot',
				'templateroot',
				'template',
				'userworkspacesroot',
				'collections',
			].includes(folder) &&
			!(folder === 'workspaceroot' && mode === 'create')
				? StandardContentEditorComponent
				: mode === 'import' && ['audio', 'video', 'note'].includes(folder)
					? StandardContentImportComponent
					: mode === 'metadata'
						? ['audio', 'video', 'note', 'file', 'picture'].includes(folder)
							? StandardContentMetadataComponent
							: DefaultDocumentMetadataLayoutComponent
						: mode === 'view' && ['audio', 'video', 'note'].includes(folder)
							? StandardContentLayoutComponent
							: mode === 'view' && folder === 'picturebook'
								? PictureBookContentLayoutComponent
								: mode === 'view' && FOLDERISH_DETAILS_TYPES.has(DOCUMENT_TYPES[folder])
									? FolderishDetailsLayoutComponent
									: folder === 'workspaceroot' && mode === 'create'
										? EmptyDocumentLayoutComponent
										: undefined,
	});
}

/** Exact manifest of the 76 document resources pinned from Nuxeo Web UI. */
export const DEFAULT_DOCUMENT_LAYOUTS: readonly DocumentLayoutDefinition[] = Object.freeze(
	SOURCE_LAYOUT_PATHS.map(manifestEntry),
);

/** Metadata pane for any type without a pinned resource (Studio and other custom types): the native
 *  schema-driven layout, as stock Web UI falls back to its generic metadata view. Typed entries win. */
export const FALLBACK_METADATA_LAYOUT: DocumentLayoutDefinition = Object.freeze({
	id: FALLBACK_METADATA_LAYOUT_ID,
	mode: 'metadata',
	component: DefaultDocumentMetadataLayoutComponent,
	// Below the defaults (0), so the media wildcard and every typed entry outrank it.
	priority: -1,
	// Only for a known type that stock Web UI does not declare `no-layout`; anything else keeps the
	// legacy information dialog.
	when: (context: DocumentLayoutContext) =>
		!!context.documentType && !declaresNoLayout(context.documentType),
});

/** Custom types carrying the Picture, Video or Audio facet get the stock media metadata pane
 *  (renditions, technical cards) instead of the plain schema pane. Decided by facet, never by name. */
export const FALLBACK_MEDIA_METADATA_LAYOUT: DocumentLayoutDefinition = Object.freeze({
	id: FALLBACK_MEDIA_METADATA_LAYOUT_ID,
	mode: 'metadata',
	component: StandardContentMetadataComponent,
	// Default priority (0): a typed entry wins the tie, so the stock Picture, Video and Audio documents,
	// which carry these facets, keep their own layouts.
	when: (context: DocumentLayoutContext) => {
		const facets = context.document?.['facets'];
		return (
			!!context.documentType &&
			!declaresNoLayout(context.documentType) &&
			Array.isArray(facets) &&
			['Picture', 'Video', 'Audio'].some((facet) => facets.includes(facet))
		);
	},
});

export const FALLBACK_LAYOUTS: readonly DocumentLayoutDefinition[] = Object.freeze([
	FALLBACK_MEDIA_METADATA_LAYOUT,
	FALLBACK_METADATA_LAYOUT,
]);

export const DEFAULT_DOCUMENT_LAYOUT_EXTENSION: DocumentLayoutExtension = Object.freeze({
	id: 'maretha.default-document-layouts',
	layouts: [...DEFAULT_DOCUMENT_LAYOUTS, ...FALLBACK_LAYOUTS],
});

export function provideDefaultDocumentLayouts() {
	return provideDocumentLayoutExtensions(DEFAULT_DOCUMENT_LAYOUT_EXTENSION);
}
