import { LocalizedUiError } from '@maretha/webui-sdk';
import { comparisonEntryLabel, nativeDirectoryLabel } from './document-comparison-resolver.service';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
	BlobValue,
	WebUiLocale,
	WebUiMessages,
	DocumentLayoutGateway,
	DocumentTypeMetadata,
	LayoutDocument,
	ReferenceValue,
	ResolvedLayoutField,
	DocumentFieldExtensionRegistry,
	DocumentLayoutMode,
	documentLayoutContext,
	SchemaMetadata,
} from '@maretha/webui-sdk';
import { catchError, firstValueFrom, map, Observable, of } from 'rxjs';
import { environment } from 'environments/environment';

@Injectable({ providedIn: 'root' })
export class DocumentLayoutGatewayService implements DocumentLayoutGateway {
	private readonly locale = inject(WebUiLocale);
	private readonly messages = inject(WebUiMessages);
	private readonly http = inject(HttpClient);
	private readonly fieldExtensions = inject(DocumentFieldExtensionRegistry);
	private readonly api = `${environment.nuxeoUrl}/api/v1`;
	private readonly headers = { properties: '*', 'enrichers-document': 'permissions' };
	/** Type definitions are server configuration: read once per type per session, shared by the
	 *  metadata layout and the editors' supplemental fields. A failed read is forgotten. */
	private readonly types = new Map<string, Promise<DocumentTypeMetadata>>();
	readType(type: string): Promise<DocumentTypeMetadata> {
		let pending = this.types.get(type);
		if (!pending) {
			pending = firstValueFrom(
				this.http.get<DocumentTypeMetadata>(`${this.api}/config/types/${encodeURIComponent(type)}`),
			);
			this.types.set(type, pending);
			pending.catch(() => {
				if (this.types.get(type) === pending) this.types.delete(type);
			});
		}
		return pending;
	}
	/** Fetch facet schemas only when the actual document carries registered fields. */
	async readDocumentType(
		type: string,
		document: unknown,
		mode: DocumentLayoutMode,
	): Promise<DocumentTypeMetadata> {
		const metadata = await this.readType(type);
		const context = documentLayoutContext({ documentType: type, document, mode });
		const missing = [
			...new Set(this.fieldExtensions.attached(context).map((extension) => extension.schema)),
		].filter((name) => !metadata.schemas.some((schema) => schema.name === name));
		if (!missing.length) return metadata;
		const schemas = await Promise.all(
			missing.map((name) =>
				firstValueFrom(
					this.http.get<SchemaMetadata>(`${this.api}/config/schemas/${encodeURIComponent(name)}`),
				),
			),
		);
		return { ...metadata, schemas: [...metadata.schemas, ...schemas] };
	}
	read(uid: string): Promise<LayoutDocument> {
		return firstValueFrom(
			this.http.get<LayoutDocument>(`${this.api}/id/${encodeURIComponent(uid)}`, {
				headers: this.headers,
			}),
		);
	}
	update(
		document: LayoutDocument,
		properties: Readonly<Record<string, unknown>>,
		repository?: string,
	): Promise<LayoutDocument> {
		if (!document.changeToken)
			return Promise.reject(
				new LocalizedUiError(
					'app.gateway.changeToken',
					'A change token is required to save safely.',
				),
			);
		return firstValueFrom(
			this.http.put<LayoutDocument>(
				`${this.api}${repository === undefined ? '' : `/repo/${encodeURIComponent(repository)}`}/id/${encodeURIComponent(document.uid)}`,
				{
					'entity-type': 'document',
					uid: document.uid,
					changeToken: document.changeToken,
					properties,
				},
				{ headers: this.headers },
			),
		);
	}
	create(
		parentId: string,
		type: string,
		name: string,
		properties: Readonly<Record<string, unknown>>,
	): Promise<LayoutDocument> {
		if (!parentId || !name.trim() || /[/\\]/.test(name))
			return Promise.reject(
				new LocalizedUiError(
					'app.gateway.createTarget',
					'A parent and valid document name are required.',
				),
			);
		return firstValueFrom(
			this.http.post<LayoutDocument>(
				`${this.api}/id/${encodeURIComponent(parentId)}`,
				{ 'entity-type': 'document', type, name, properties },
				{ headers: this.headers },
			),
		);
	}
	async uploadBlob(file: File): Promise<BlobValue> {
		let batchId: string | undefined;
		try {
			const batch = await firstValueFrom(
				this.http.post<{ batchId?: string }>(`${this.api}/upload`, null, {
					headers: new HttpHeaders({ properties: '*', 'X-NXRepository': 'default' }),
				}),
			);
			batchId = batch.batchId;
			if (!batchId)
				throw new LocalizedUiError(
					'app.gateway.uploadBatch',
					'The server did not return an upload batch.',
				);
			await firstValueFrom(
				this.http.post(`${this.api}/upload/${encodeURIComponent(batchId)}/0`, file, {
					headers: new HttpHeaders({
						'Content-Type': 'application/octet-stream',
						'X-File-Name': encodeURIComponent(file.name),
						'X-File-Size': String(file.size),
						'X-File-Type': file.type || 'application/octet-stream',
						'X-NXRepository': 'default',
					}),
				}),
			);
			return {
				'upload-batch': batchId,
				'upload-fileId': '0',
				_name: file.name,
				mimeType: file.type || undefined,
				length: file.size,
			};
		} catch (error) {
			if (batchId) await this.deleteBatch(batchId);
			throw error;
		}
	}
	async releaseBlob(blob: BlobValue): Promise<void> {
		const batchId = blob['upload-batch'];
		if (batchId) await this.deleteBatch(batchId);
	}
	async resolveReference(
		field: ResolvedLayoutField,
		value: string,
	): Promise<ReferenceValue | null> {
		return firstValueFrom(this.resolveReference$(field, value));
	}
	resolveReference$(field: ResolvedLayoutField, value: string): Observable<ReferenceValue | null> {
		if (field.type === 'directory') {
			if (!field.directoryName) return of(null);
			return this.http
				.get<{
					properties?: {
						id?: string;
						label?: string;
						label_en?: string;
						[key: `label_${string}`]: string | undefined;
					};
				}>(
					`${this.api}/directory/${encodeURIComponent(field.directoryName)}/${encodeURIComponent(value)}`,
				)
				.pipe(
					map((entry) =>
						entry.properties?.id
							? {
									id: entry.properties.id,
									label: nativeDirectoryLabel(
										comparisonEntryLabel(entry, this.locale.locale()),
										field.directoryName,
										this.messages,
									),
								}
							: null,
					),
					catchError(() => of(null)),
				);
		}
		return this.http
			.get<LayoutDocument>(`${this.api}/id/${encodeURIComponent(value)}`, {
				headers: this.headers,
			})
			.pipe(
				map((document) => ({
					id: document.uid,
					label:
						typeof document.properties['dc:title'] === 'string'
							? document.properties['dc:title']
							: undefined,
				})),
				catchError(() => of(null)),
			);
	}
	async searchReferences(
		field: ResolvedLayoutField,
		query: string,
	): Promise<readonly ReferenceValue[]> {
		if (field.type === 'directory') {
			if (!field.directoryName) return [];
			return this.searchDirectory(field.directoryName, query);
		}
		const escaped = query
			.replace(/\\/g, '\\\\')
			.replace(/%/g, '\\%')
			.replace(/_/g, '\\_')
			.replace(/'/g, "''");
		const response = await firstValueFrom(
			this.http.get<{ entries?: readonly LayoutDocument[] }>(
				`${this.api}/search/lang/NXQL/execute`,
				{
					params: new HttpParams()
						.set('pageSize', '20')
						.set('currentPageIndex', '0')
						.set(
							'query',
							`SELECT * FROM Document WHERE ecm:uuid LIKE '${escaped}%' OR dc:title ILIKE '${escaped}%'`,
						),
				},
			),
		);
		return (response.entries || []).slice(0, 20).map((document) => ({
			id: document.uid,
			label:
				typeof document.properties['dc:title'] === 'string'
					? document.properties['dc:title']
					: undefined,
		}));
	}
	/**
	 * The native bulk select needs the complete default-profile vocabulary, unlike the 20-item
	 * typeahead searchReferences result. Directory.SuggestEntries is the same hierarchical
	 * contract used by Nuxeo's directory suggestion widget: computedId is the submitted value
	 * and absoluteLabel is the human path.
	 */
	async bulkDirectoryChoices(
		directoryName: string,
		dbl10n: boolean,
	): Promise<readonly ReferenceValue[]> {
		const locale = this.locale.locale();
		const response = await firstValueFrom(
			this.http.post<readonly DirectorySuggestion[]>(
				`${this.api}/automation/Directory.SuggestEntries`,
				{
					context: {},
					params: {
						directoryName,
						dbl10n,
						localize: true,
						lang: locale.split('-')[0],
						canSelectParent: false,
						searchTerm: '',
						limit: 1000,
					},
				},
			),
		);
		const choices: ReferenceValue[] = [];
		const visit = (entries: readonly DirectorySuggestion[]) => {
			for (const entry of entries) {
				if (entry.id && !entry.children?.length)
					choices.push({
						id: entry.computedId || entry.id,
						label: nativeDirectoryLabel(
							entry.absoluteLabel ||
								entry.displayLabel ||
								comparisonEntryLabel(entry, locale) ||
								entry.id,
							directoryName,
							this.messages,
						),
					});
				if (entry.children?.length) visit(entry.children);
				if (choices.length > 1000)
					throw new LocalizedUiError(
						'app.gateway.directoryTooLarge',
						'The directory has more than 1000 selectable entries. Refine it before bulk editing.',
					);
			}
		};
		visit(response || []);
		// The automation operation has no continuation token. Treat a full server limit as
		// incomplete instead of presenting a select that silently omits later values.
		if (choices.length >= 1000)
			throw new LocalizedUiError(
				'app.gateway.directoryLimit',
				'The directory reached the 1000-entry bulk choice limit. Refine it before bulk editing.',
			);
		return choices;
	}
	private async searchDirectory(
		directoryName: string,
		query: string,
	): Promise<readonly ReferenceValue[]> {
		const locale = this.locale.locale();
		const pageSize = 100;
		const maxPages = 100;
		const matches: ReferenceValue[] = [];
		const matchedIds = new Set<string>();
		const pageSignatures = new Set<string>();
		const normalized = query.toLowerCase();
		let scanned = 0;
		for (
			let currentPageIndex = 0;
			currentPageIndex < maxPages && matches.length < 20;
			currentPageIndex++
		) {
			const response = await firstValueFrom(
				this.http.get<DirectoryEntries>(
					`${this.api}/directory/${encodeURIComponent(directoryName)}`,
					{
						params: new HttpParams()
							.set('currentPageIndex', currentPageIndex)
							.set('pageSize', pageSize),
					},
				),
			);
			const entries = response.entries || [];
			const signature = entries.map((entry) => entry.properties?.id || '').join('\u0000');
			if (response.isNextPageAvailable && (!entries.length || pageSignatures.has(signature)))
				throw new LocalizedUiError(
					'app.gateway.directoryRepeated',
					'The directory response repeated a page before lookup completed.',
				);
			pageSignatures.add(signature);
			scanned += entries.length;
			for (const entry of entries) {
				const id = entry.properties?.id || '';
				const label = nativeDirectoryLabel(
					entry.properties?.absoluteLabel || comparisonEntryLabel(entry, locale),
					directoryName,
					this.messages,
				);
				if (
					id &&
					!matchedIds.has(id) &&
					`${id} ${label || ''}`.toLowerCase().includes(normalized)
				) {
					matchedIds.add(id);
					// Hierarchical directory suggestion values use the server-computed path when it
					// is available. A plain REST directory response has no computed id, so retain
					// its stable entry id.
					matches.push({ id: entry.properties?.computedId || id, label });
					if (matches.length === 20) return matches;
				}
			}
			if (response.isNextPageAvailable) continue;
			const total = response.totalSize ?? response.resultsCount;
			if (total !== undefined && scanned < total)
				throw new LocalizedUiError(
					'app.gateway.directoryTruncated',
					'The directory response was truncated before all entries were searched.',
				);
			return matches;
		}
		throw new LocalizedUiError(
			'app.gateway.directoryPages',
			'The directory lookup exceeded its 100-page safety limit.',
		);
	}
	private async deleteBatch(batchId: string): Promise<void> {
		await firstValueFrom(this.http.delete(`${this.api}/upload/${encodeURIComponent(batchId)}`));
	}
}

interface DirectoryEntries {
	readonly entries?: readonly {
		readonly properties?: {
			readonly [key: `label_${string}`]: string | undefined;
			readonly id?: string;
			readonly label?: string;
			readonly label_en?: string;
			readonly absoluteLabel?: string;
			readonly computedId?: string;
		};
	}[];
	readonly isNextPageAvailable?: boolean;
	readonly resultsCount?: number;
	readonly totalSize?: number;
	readonly pageSize?: number;
}
interface DirectorySuggestion extends Readonly<Record<string, unknown>> {
	readonly [key: `label_${string}`]: string | undefined;
	readonly id?: string;
	readonly computedId?: string;
	readonly absoluteLabel?: string;
	readonly displayLabel?: string;
	readonly label?: string;
	readonly label_en?: string;
	readonly children?: readonly DirectorySuggestion[];
}
