# DAM document view and metadata layouts

The binary document view uses a collapsible right inspector and a larger preview stage. Picture Info remains in the inspector. Renditions, EXIF, and IPTC are compact cards beneath the image. Default Nuxeo IPTC values come from the `picture` schema; custom `iptc` properties are also displayed. Empty sections report missing server metadata.

## Administrator configuration

Open **Administration → Metadata layouts**. Rules select a document type, schema name/prefix, users and/or groups, and Hidden, Read-only, or Editable access. An optional field allowlist restricts the schema's visible properties.

- Empty subject lists match everyone.
- User OR group matches either category; User AND group requires both populated categories (one listed user and one listed group).
- Matching user rules take precedence over group rules. Exact document types and schemas take precedence within that scope. Equally specific rules use the most restrictive access.
- Administrators retain visibility. Editing requires Nuxeo document write permission; generated technical fields remain read-only.
- Without a matching rule, Dublin Core is editable and other schemas are read-only, subject to document permissions.

Shared configuration is stored under `/default-domain/.maretha-ui-metadata-pol` in a hidden Note's `dc:description` field. Nuxeo shortens longer document names and escapes Note content, so the short name and plain string property are intentional. The configuration grants administrators write access and the standard `members` group read access, with inherited permissions blocked. Deployments with different repository roots or membership conventions need corresponding configuration changes.

## Personal customization

Choose **Customize** in Document metadata to hide schemas or fields and reorder fields within their schema. Users can only customize fields allowed by the administrator. Preferences are scoped to server, user, and document type in the current browser. Hiding the whole inspector retains pending metadata edits. One **Edit metadata** button opens every editable field together. **Save changes** persists the staged edits; **Cancel** discards them.

## Scope

These rules govern the metadata inspector's presentation and editing. They are not server-side field security, and do not constrain direct API clients or independently implemented custom editors. Nuxeo still enforces its document ACLs. Server-wide schema security and synchronized personal preferences are not provided.

## Asset view polish

Empty descriptive fields are hidden in read mode by default and can be shown with the checkbox. Edit in the inspector header exposes permitted fields together; the settings menu controls personal field visibility. The image toolbar provides Fit, Actual size (the selected rendition's intrinsic pixels), zoom, and fullscreen. Rendition selection uses radio controls, and empty technical cards start collapsed. EXIF dates use the browser's locale and timezone. The floating creation action is hidden on individual assets; it remains available on folders and the dashboard.
