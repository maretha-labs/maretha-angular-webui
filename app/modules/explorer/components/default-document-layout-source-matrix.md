# Default document-layout source matrix

The registration manifest is [default-document-layouts.ts](./default-document-layouts.ts). Each entry below is an exact source resource, followed by the mounted Angular leaf that handles it. `Gap` is intentional evidence that the source is registered for extension replacement but has no specialized Angular leaf.

Every listed `*-metadata-layout.html` is handled by
`DefaultDocumentMetadataLayoutComponent`. The metadata caveats refer only to
source fields that do not exist in the pinned resource.

| Source type        | Source modes         | Existing mounted counterpart                                                                     | Gap                                                                                                   |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Audio              | create, edit         | `DocumentTypeEditorComponent` → `BinaryEditorComponent`                                          | Audio source-specific labels are schema-driven.                                                       |
| Audio              | import               | `DocumentImportHostComponent` → `StandardContentImportComponent`                                 | No audio-specific import form.                                                                        |
| Audio              | view                 | `GenericTypeViewerComponent` → `GenericNonFolderishViewerComponent` → `AudioRendererComponent`   | —                                                                                                     |
| Audio              | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| Collection         | create, edit         | `DocumentTypeEditorComponent` → `GenericEditorComponent`                                         | —                                                                                                     |
| Collection         | view                 | `GenericTypeViewerComponent`                                                                     | **Gap:** source collection member browser/action context has no dedicated leaf.                       |
| Collection         | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| Collections        | create, edit         | `DocumentTypeEditorComponent` → `GenericEditorComponent`                                         | —                                                                                                     |
| Collections        | view                 | `GenericTypeViewerComponent`                                                                     | **Gap:** source collections listing is not a dedicated leaf.                                          |
| Collections        | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| Domain             | create, edit         | `DocumentTypeEditorComponent` → `DomainEditorComponent`                                          | —                                                                                                     |
| Domain             | view                 | `GenericTypeViewerComponent` → `GenericFolderishViewerComponent`                                 | —                                                                                                     |
| Domain             | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| Favorites          | edit, view, metadata | `GenericEditorComponent`; `GenericTypeViewerComponent`; `DefaultDocumentMetadataLayoutComponent` | Favorites-specific source behavior is not specialized.                                                |
| File               | create, edit         | `DocumentTypeEditorComponent` → `BinaryEditorComponent`                                          | —                                                                                                     |
| File               | import               | `DocumentImportHostComponent` → `StandardContentImportComponent`                                 | —                                                                                                     |
| File               | view                 | `GenericTypeViewerComponent` → `GenericNonFolderishViewerComponent` → file/PDF renderers         | —                                                                                                     |
| File               | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| Folder             | create, edit         | `DocumentTypeEditorComponent` → `GenericEditorComponent`                                         | —                                                                                                     |
| Folder             | view                 | `GenericTypeViewerComponent` → `GenericFolderishViewerComponent`                                 | —                                                                                                     |
| Folder             | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| Note               | create, edit         | `DocumentTypeEditorComponent` → `NoteEditorComponent`                                            | —                                                                                                     |
| Note               | import               | `DocumentImportHostComponent` → `StandardContentImportComponent`                                 | `note:note` receives each uploaded blob; the optional source format is preserved as `note:mime_type`. |
| Note               | view                 | `GenericTypeViewerComponent` → `GenericNonFolderishViewerComponent` → `NoteRendererComponent`    | —                                                                                                     |
| Note               | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| OrderedFolder      | create, edit         | `DocumentTypeEditorComponent` → `GenericEditorComponent`                                         | —                                                                                                     |
| OrderedFolder      | view                 | `GenericTypeViewerComponent` → `GenericFolderishViewerComponent`                                 | **Gap:** source ordering controls are not a dedicated leaf.                                           |
| OrderedFolder      | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| Picture            | create, edit         | `DocumentTypeEditorComponent` → `BinaryEditorComponent`                                          | —                                                                                                     |
| Picture            | import               | `DocumentImportHostComponent` → `StandardContentImportComponent`                                 | —                                                                                                     |
| Picture            | view                 | `GenericTypeViewerComponent` → `GenericNonFolderishViewerComponent` → `ImageRendererComponent`   | —                                                                                                     |
| Picture            | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| PictureBook        | edit                 | `GenericEditorComponent`                                                                         | Implemented: source `dc:title` and `dc:description` fields only.                                      |
| PictureBook        | view                 | `GenericTypeViewerComponent`                                                                     | **Gap:** picturebook source view sections are not mounted.                                            |
| PictureBook        | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| Root               | edit, view           | `GenericEditorComponent`; `GenericFolderishViewerComponent`                                      | —                                                                                                     |
| Root               | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| Section            | create, edit         | `GenericEditorComponent`                                                                         | —                                                                                                     |
| Section            | view                 | `GenericFolderishViewerComponent`                                                                | —                                                                                                     |
| Section            | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| SectionRoot        | edit, view           | `GenericEditorComponent`; `GenericFolderishViewerComponent`                                      | —                                                                                                     |
| SectionRoot        | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| Template           | edit                 | `GenericEditorComponent`                                                                         | **Gap:** source template edit fields are not specialized.                                             |
| TemplateRoot       | edit, view           | `GenericEditorComponent`; `GenericFolderishViewerComponent`                                      | —                                                                                                     |
| TemplateRoot       | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| UserWorkspacesRoot | edit, view           | `GenericEditorComponent`; `GenericFolderishViewerComponent`                                      | —                                                                                                     |
| UserWorkspacesRoot | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| Video              | create, edit         | `DocumentTypeEditorComponent` → `BinaryEditorComponent`                                          | —                                                                                                     |
| Video              | import               | `DocumentImportHostComponent` → `StandardContentImportComponent`                                 | —                                                                                                     |
| Video              | view                 | `GenericTypeViewerComponent` → `GenericNonFolderishViewerComponent` → `VideoRendererComponent`   | **Gap:** conversion list is not a dedicated leaf.                                                     |
| Video              | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| Workspace          | create, edit         | `GenericEditorComponent`                                                                         | —                                                                                                     |
| Workspace          | view                 | `GenericFolderishViewerComponent`                                                                | —                                                                                                     |
| Workspace          | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |
| WorkspaceRoot      | create               | `EmptyDocumentLayoutComponent` → `BaseEditorComponent`                                           | Implemented: source-empty body with standard create/cancel host and generated server name.            |
| WorkspaceRoot      | edit                 | `GenericEditorComponent`                                                                         | Source common fields are rendered; tags are omitted.                                                  |
| WorkspaceRoot      | view                 | `GenericFolderishViewerComponent`                                                                | —                                                                                                     |
| WorkspaceRoot      | metadata             | `DefaultDocumentMetadataLayoutComponent`                                                         | —                                                                                                     |

List and grid cards are not document layouts: Polymer hardcodes `nuxeo-document-grid-thumbnail` in folder view layouts, and the SDK replaces cards through `provideResultsProjections()`.

## Metadata resource profiles

`DefaultDocumentMetadataLayoutComponent` now mounts every metadata entry through
`DocumentInfoActionComponent` and the navigation-bar metadata action. It is
read-only and takes each modal's fresh `document`/`layoutContext` scope directly.
The exact source files below determine its profiles:

- Common Dublin Core (`dc:title`, optional `dc:description`, `dc:nature`,
  `dc:subjects`, `dc:coverage`, `dc:expired`):
  `audio/nuxeo-audio-metadata-layout.html`,
  `collection/nuxeo-collection-metadata-layout.html`,
  `collections/nuxeo-collections-metadata-layout.html`,
  `domain/nuxeo-domain-metadata-layout.html`,
  `favorites/nuxeo-favorites-metadata-layout.html`,
  `file/nuxeo-file-metadata-layout.html`,
  `folder/nuxeo-folder-metadata-layout.html`,
  `note/nuxeo-note-metadata-layout.html`,
  `orderedfolder/nuxeo-orderedfolder-metadata-layout.html`,
  `picture/nuxeo-picture-metadata-layout.html`,
  `root/nuxeo-root-metadata-layout.html`,
  `section/nuxeo-section-metadata-layout.html`,
  `sectionroot/nuxeo-sectionroot-metadata-layout.html`,
  `templateroot/nuxeo-templateroot-metadata-layout.html`,
  `userworkspacesroot/nuxeo-userworkspacesroot-metadata-layout.html`,
  `video/nuxeo-video-metadata-layout.html`,
  `workspace/nuxeo-workspace-metadata-layout.html`, and
  `workspaceroot/nuxeo-workspaceroot-metadata-layout.html`.
- PictureBook's exact two-field profile: `picturebook/nuxeo-picturebook-metadata-layout.html`.
- The source adds nested attachment rendering for File, Note, and Video only;
  their attachment links are emitted only for sanitized `http`/`https` URLs.
  Picture's pinned source has no EXIF/IPTC fields, so this implementation does
  not fabricate those fields.
