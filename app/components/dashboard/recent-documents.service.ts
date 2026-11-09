import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { forkJoin, map, Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class RecentDocumentsService {
	private readonly http = inject(HttpClient);
	resolve(history: readonly any[]): Observable<any[]> {
		const repos = new Map<string, any[]>();
		for (const doc of history) {
			const repo = doc.repository ?? 'default';
			repos.set(repo, [...(repos.get(repo) ?? []), doc]);
		}
		if (!repos.size) return of([]);
		return forkJoin(
			[...repos].map(([repo, docs]) => {
				const ids = docs
					.map((d) => `'${String(d.uid).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
					.join(',');
				return this.http
					.get<{ entries: any[] }>(
						`${environment.nuxeoUrl}/api/v1/repo/${encodeURIComponent(repo)}/query`,
						{
							params: {
								query: `SELECT * FROM Document WHERE ecm:uuid IN (${ids}) AND ecm:isTrashed=0`,
								pageSize: String(docs.length),
							},
							headers: { properties: 'dublincore', 'enrichers-document': 'thumbnail' },
						},
					)
					.pipe(map((r) => r.entries.map((d) => ({ ...d, repository: repo }))));
			}),
		).pipe(
			map((groups) => {
				const fresh = groups.flat();
				return history.flatMap((old) => {
					const doc = fresh.find(
						(d) => d.uid === old.uid && d.repository === (old.repository ?? 'default'),
					);
					return doc ? [{ ...doc, lastViewed: old.lastViewed }] : [];
				});
			}),
		);
	}
}
