import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { environment } from 'environments/environment';
export interface SuggestionHighlight {
	readonly field: string;
	readonly segments: readonly { text: string; matched: boolean }[][];
}
export interface SearchSuggestion {
	id: string;
	path?: string;
	label: string;
	type: 'document' | 'user' | 'group';
	thumbnail: string | null;
	repository: string;
	highlights: readonly string[];
	highlightFields?: readonly SuggestionHighlight[];
}
@Injectable({ providedIn: 'root' })
export class QuickSearchService {
	private readonly http = inject(HttpClient);
	search(term: string): Observable<SearchSuggestion[]> {
		return this.http
			.post<unknown>(`${environment.nuxeoUrl}/api/v1/automation/Search.SuggestersLauncher`, {
				params: { searchTerm: term.replace(/"/g, '%22').trim() },
				context: {},
			})
			.pipe(
				map((data) => {
					if (!Array.isArray(data)) throw new Error('Invalid search response');
					return data
						.filter(
							(item) =>
								item &&
								typeof item.id === 'string' &&
								typeof item.label === 'string' &&
								['document', 'user', 'group'].includes(item.type),
						)
						.map(
							(item): SearchSuggestion => ({
								id: item.id,
								...(typeof item.path === 'string' && item.path.startsWith('/')
									? { path: item.path }
									: {}),
								highlightFields: parseSuggestionHighlights(item.highlights),
								label: item.label,
								type: item.type,
								thumbnail: this.thumbnail(item.thumbnailUrl),
								repository:
									typeof item.url === 'string' && /^nxdoc\/([^/]+)\//.test(item.url)
										? decodeURIComponent(item.url.split('/')[1])
										: 'default',
								highlights: Array.isArray(item.highlights)
									? item.highlights.flatMap((h: any) =>
											Array.isArray(h.segments)
												? h.segments
														.filter((s: unknown) => typeof s === 'string')
														.map((s: string) => s.replace(/<[^>]*>/g, ''))
												: [],
										)
									: [],
							}),
						);
				}),
				switchMap((suggestions) => this.resolveDocumentPaths(suggestions)),
			);
	}
	private resolveDocumentPaths(suggestions: SearchSuggestion[]): Observable<SearchSuggestion[]> {
		const byRepository = new Map<string, string[]>();
		for (const item of suggestions) {
			if (item.type !== 'document' || item.path || !/^[A-Za-z0-9_-]+$/.test(item.id)) continue;
			const list = byRepository.get(item.repository) ?? [];
			if (!list.includes(item.id)) list.push(item.id);
			byRepository.set(item.repository, list);
		}
		if (!byRepository.size) return of(suggestions);
		return forkJoin(
			Array.from(byRepository.entries(), ([repository, ids]) =>
				this.http
					.get<{ entries?: { uid?: unknown; path?: unknown }[] }>(
						`${environment.nuxeoUrl}/api/v1/search/lang/NXQL/execute`,
						{
							params: {
								query: `SELECT * FROM Document WHERE ecm:uuid IN (${ids.map((id) => `'${id}'`).join(', ')})`,
								pageSize: String(ids.length),
								currentPageIndex: '0',
							},
							headers: {
								'X-NXDocumentProperties': '',
								...(repository !== 'default' ? { 'X-NXRepository': repository } : {}),
							},
						},
					)
					.pipe(
						map((response) =>
							(response?.entries ?? [])
								.filter(
									(entry): entry is { uid: string; path: string } =>
										typeof entry?.uid === 'string' &&
										typeof entry?.path === 'string' &&
										entry.path.startsWith('/'),
								)
								.map((entry) => [`${repository}:${entry.uid}`, entry.path] as const),
						),
						catchError(() => of([] as const)),
					),
			),
		).pipe(
			map((groups) => {
				const paths = new Map<string, string>(groups.flat());
				return suggestions.map((item) => {
					const path =
						item.type === 'document' ? paths.get(`${item.repository}:${item.id}`) : undefined;
					return path && !item.path ? { ...item, path } : item;
				});
			}),
		);
	}
	private thumbnail(value: unknown): string | null {
		if (typeof value !== 'string' || !value) return null;
		try {
			const base = new URL(environment.nuxeoUrl + '/', document.baseURI);
			const url = new URL(value, base);
			return url.origin === base.origin &&
				url.pathname.startsWith(base.pathname) &&
				!url.username &&
				!url.password
				? url.href
				: null;
		} catch {
			return null;
		}
	}
}

/** Accept only the suggester's em delimiters. Every fragment is rendered as Angular text. */
export function parseSuggestionHighlights(value: unknown): SuggestionHighlight[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((h) => h && Array.isArray(h.segments))
		.map((h) => ({
			field: typeof h.field === 'string' ? h.field : 'dc:title',
			segments: h.segments
				.filter((s: unknown) => typeof s === 'string')
				.map((segment: string) => {
					const chunks: { text: string; matched: boolean }[] = [];
					let matched = false;
					for (const part of segment.split(/(<\/?em>)/gi)) {
						if (/^<em>$/i.test(part)) matched = true;
						else if (/^<\/em>$/i.test(part)) matched = false;
						else if (part) chunks.push({ text: part.replace(/<[^>]*>/g, ''), matched });
					}
					return chunks;
				}),
		}));
}
