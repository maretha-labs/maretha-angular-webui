import { InjectionToken } from '@angular/core';
import type { LayoutDocument } from './document-layout';

/**
 * Provided to a document layout that a host mounts in a dialog: the create, edit and
 * import editors and the metadata dialog. Inline hosts (document view, details panel)
 * provide none, so inject it with `{ optional: true }`.
 */
export interface DocumentLayoutHost {
	/** Reports documents the layout saved, syncs the host's listing and closes the dialog. */
	complete(documents: readonly LayoutDocument[]): void;
	/** Closes the dialog without reporting a save. */
	cancel(): void;
}

export const DOCUMENT_LAYOUT_HOST = new InjectionToken<DocumentLayoutHost>('DOCUMENT_LAYOUT_HOST');

/**
 * Provided to an import layout for one file. As in Polymer's `nuxeo-document-import`, the
 * import host owns the files, their upload and the document creation; the layout only edits
 * the properties of that file's document. The host mounts the layout again for each file.
 */
export interface DocumentImportDraft {
	readonly file: File;
	/** The properties when the layout was mounted; `dc:title` starts as the file name. */
	readonly properties: Readonly<Record<string, unknown>>;
	/** Merges edited properties into the ones the host creates the document with. */
	update(properties: Readonly<Record<string, unknown>>): void;
	/** The host creates no documents while a layout reports invalid values. */
	setValid(valid: boolean): void;
}

export const DOCUMENT_IMPORT_DRAFT = new InjectionToken<DocumentImportDraft>(
	'DOCUMENT_IMPORT_DRAFT',
);
