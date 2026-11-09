import { WebUiLocale, type WebUiMessages } from '@maretha/webui-sdk';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from 'environments/environment';
import { ComparisonProperty } from './document-comparison.service';

@Injectable({ providedIn: 'root' })
export class DocumentComparisonResolverService {
	private readonly http = inject(HttpClient);
	private readonly locale = inject(WebUiLocale);
	private readonly api = `${environment.nuxeoUrl}/api/v1`;
	resolve(property: ComparisonProperty, value: unknown): Observable<string | undefined> {
		return this.resolveEntry(property, value).pipe(
			map((value) =>
				typeof value === 'string'
					? value
					: value
						? String(comparisonEntryLabel(value, this.locale.locale()) || value['id'] || '')
						: undefined,
			),
		);
	}
	/** Preserve directory label variants so a mounted comparison can change locale without another request. */
	resolveEntry(
		property: ComparisonProperty,
		value: unknown,
	): Observable<string | Readonly<Record<string, unknown>> | undefined> {
		const id = String(value);
		if (property.kind.startsWith('directoryEntry') && property.directoryName)
			return this.http
				.get<any>(
					`${this.api}/directory/${encodeURIComponent(property.directoryName)}/${encodeURIComponent(id)}`,
				)
				.pipe(
					map((entry) => entry.properties ?? entry),
					catchError(() => of(undefined)),
				);
		if (property.kind.startsWith('user'))
			return this.http.get<any>(`${this.api}/user/${encodeURIComponent(id)}`).pipe(
				map((user) =>
					user.properties?.firstName && user.properties?.lastName
						? `${user.properties.firstName} ${user.properties.lastName}`
						: user.properties?.username || user.id,
				),
				catchError(() => of(undefined)),
			);
		if (property.kind.startsWith('document'))
			return this.http
				.get<any>(`${this.api}/id/${encodeURIComponent(id)}`, {
					headers: { properties: 'dc:title' },
				})
				.pipe(
					map((document) => document.properties?.['dc:title'] || document.title || document.uid),
					catchError(() => of(undefined)),
				);
		return of(undefined);
	}
}

/** Select server-provided labels; never interpret a customer vocabulary value as an app message key. */
export function comparisonEntryLabel(
	entry: Readonly<Record<string, unknown>>,
	locale: string,
): string | undefined {
	const candidate = entry['properties'];
	const properties =
		candidate && typeof candidate === 'object' ? (candidate as Record<string, unknown>) : entry;
	return [
		properties[`label_${locale.replaceAll('-', '_')}`],
		properties[`label_${locale.split('-')[0]}`],
		properties['label_en'],
		entry['label'],
		properties['label'],
		properties['username'],
	].find((value): value is string => typeof value === 'string' && value.length > 0);
}

/** Nuxeo's built-in nature vocabulary stores explicit catalog references; customer labels stay literal. */
export function nativeDirectoryLabel(
	label: string | undefined,
	directoryName: string | undefined,
	messages: Pick<WebUiMessages, 'text'>,
): string | undefined {
	return directoryName === 'nature' && label?.startsWith('label.directories.nature.')
		? messages.text(label, label)
		: label;
}
