import { LocalizedUiError } from '@maretha/webui-sdk';
import { Injectable, inject } from '@angular/core';
import { BulkFieldChange, BulkValidationError, buildBulkDocumentChanges } from '@maretha/webui-sdk';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { canRunDocumentCommand } from '../viewers/document-actions-toolbar/document-command-policy';

export interface BulkSaveStatus {
	readonly uid: string;
	readonly state: 'saved' | 'skipped' | 'failed' | 'unknown';
	readonly error?: string;
	readonly validationError?: BulkValidationError;
	readonly localizedError?: LocalizedUiError;
	readonly errorCode?: 'write-unavailable' | 'save-failed';
}

/**
 * Saves an explicit, bounded selection.  Each document is re-read immediately
 * before its PUT, so list additions are projected from the current value and
 * the current change token is always sent.
 */
@Injectable({ providedIn: 'root' })
export class BulkEditorService {
	private readonly gateway = inject(DocumentLayoutGatewayService);
	async save(
		selectedIds: readonly string[],
		changes: readonly BulkFieldChange[],
		isCurrent: () => boolean,
		onStatus?: (status: BulkSaveStatus) => void,
	): Promise<readonly BulkSaveStatus[]> {
		const ids = [...new Set(selectedIds.filter(Boolean))];
		if (!ids.length || ids.length > 199)
			throw new LocalizedUiError(
				'bulk.selectionLimit',
				'Choose between one and 199 displayed documents.',
			);
		const statuses: BulkSaveStatus[] = [];
		for (const uid of ids) {
			if (!isCurrent()) break;
			let writing = false;
			try {
				const document = await this.gateway.read(uid);
				if (!isCurrent()) break;
				if (
					!canRunDocumentCommand(
						{ document: document as unknown as Readonly<Record<string, unknown>>, noEdit: false },
						'edit',
					)
				) {
					const status = {
						uid,
						state: 'skipped' as const,
						error: 'WriteProperties is no longer available.',
						errorCode: 'write-unavailable' as const,
					};
					statuses.push(status);
					onStatus?.(status);
					continue;
				}
				const projected = buildBulkDocumentChanges(
					[document as unknown as Readonly<Record<string, unknown>>],
					changes,
				)[0];
				if (!Object.keys(projected.properties).length) {
					const status = { uid, state: 'skipped' as const };
					statuses.push(status);
					onStatus?.(status);
					continue;
				}
				writing = true;
				await this.gateway.update(document, projected.properties);
				const status = { uid, state: 'saved' as const };
				statuses.push(status);
				onStatus?.(status);
			} catch (error) {
				const httpStatus = Number((error as { status?: unknown })?.status);
				// A dropped/5xx response can arrive after Nuxeo accepted the PUT. Never retry it blindly.
				const state =
					writing && (!httpStatus || httpStatus >= 500)
						? ('unknown' as const)
						: ('failed' as const);
				const status = {
					uid,
					state,
					error: error instanceof Error ? error.message : 'Unable to save this document.',
					...(error instanceof LocalizedUiError ? { localizedError: error } : {}),
					...(error instanceof BulkValidationError
						? { validationError: error }
						: !(error instanceof Error)
							? { errorCode: 'save-failed' as const }
							: {}),
				};
				statuses.push(status);
				onStatus?.(status);
			}
		}
		return statuses;
	}
}
