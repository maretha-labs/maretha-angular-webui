import { WebUiLocale } from '@maretha/webui-sdk';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, signal, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { LayoutService } from 'app/modules/explorer/helpers/layout.service';
import { environment } from 'environments/environment';
import { forkJoin, map, Observable, of, skipWhile, Subject, switchMap, tap } from 'rxjs';
import { RetentionRule } from '../models/retention-rule';

@Injectable({
	providedIn: 'root',
})
export class RetentionService {
	private readonly locale = inject(WebUiLocale);
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;
	private readonly _parentUid = signal<string | undefined>(undefined);
	private readonly parentUid$ = toObservable(this._parentUid);
	private _docTypes: any[] = [];
	private _dateFields: any[] = [];

	fetchingDocuments$ = new Subject<boolean>();

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly layoutService: LayoutService,
		private readonly httpClient: HttpClient,
	) {
		this.getResources().subscribe((x: any) => this._parentUid.set(x.uid));
	}

	// --------------------------------------------------------------------------------------------------
	find(searchTerm?: string, documentType?: string): Observable<any[]> {
		const url = `${this.apiUrl}/automation/Repository.PageProvider`;

		const payload = {
			context: {},
			params: {
				documentSchemas: ['*'],
				repository: 'default',
				providerName: 'manual_retention_rule_suggestion',
				pageProviderName: 'manual_retention_rule_suggestion',
				page: 0,
				pageSize: 20,
				searchTerm,
			},
		};

		const headers = {
			headers: new HttpHeaders({
				properties: 'dublincore,common,retention_rule,retention_definition',
			}),
		};

		return this.httpClient
			.post(url, payload, headers)
			.pipe(
				map((x: any) =>
					documentType
						? x.entries.filter(
								(y: any) => y.properties['retention_rule:docTypes'].indexOf(documentType) >= 0,
							)
						: x.entries,
				),
			);
	}

	// --------------------------------------------------------------------------------------------------
	loadMore(currentPage = 0): Observable<RetentionRule[]> {
		if (!environment.addons.retention) throw 'Retention addon is not enabled';

		this.fetchingDocuments$.next(true);

		return this.parentUid$.pipe(
			skipWhile((x) => !x),
			switchMap(() => {
				const pageSize = this.layoutService.pageSize;

				let query = `?currentPageIndex=${currentPage}&pageSize=${pageSize}`;

				query += `&ecm_parentId=${this._parentUid()}`;

				if (this.layoutService.sortFields)
					query += `&sortBy=${encodeURIComponent('ecm:pos')}&sortOrder=${this.layoutService.sortAscending ? 'asc' : 'desc'}`;

				const url = `${this.apiUrl}/search/pp/advanced_document_content/execute${query}`;
				const headers = {
					headers: new HttpHeaders({
						'enrichers-document': 'thumbnail, permissions',
						properties: 'dublincore,common,retention_rule,retention_definition',
						'fetch-aggregate': 'key',
					}),
				};

				return this.httpClient.get(url, headers).pipe(
					map((x: any) => {
						return x.entries.map((y: any) => {
							return {
								uid: y.uid,
								creationDate: y.properties['dc:created'],
								createdBy: y.properties['dc:creator'],
								modificationDate: y.properties['dc:modified'],
								lastModifiedBy: y.properties['dc:lastContributor'],
								title: y.properties['dc:title'],
								description: y.properties['dc:description'],
								docTypes: y.properties['retention_rule:docTypes'],
								applicationPolicy: y.properties['retention_rule:applicationPolicy'],
								// beginActions: y.properties['retention_def:beginActions'],
								startingPointPolicy: y.properties['retention_def:startingPointPolicy'],
								startingPointEvent: y.properties['retention_def:startingPointEvent'],
								// startingPointExpression: y.properties['retention_def:startingPointExpression'],
								startingPointValue: y.properties['retention_def:startingPointValue'],
								metadataXPath: y.properties['retention_def:metadataXPath'],
								expression: y.properties['retention_def:expression'],
								durationYears: y.properties['retention_def:durationYears'],
								durationMonths: y.properties['retention_def:durationMonths'],
								durationDays: y.properties['retention_def:durationDays'],
								durationMillis: y.properties['retention_def:durationMillis'],
								endActions: y.properties['retention_def:endActions'],
								enabled: y.properties['retention_rule:enabled'],
							};
						});
					}),
					tap(() => this.fetchingDocuments$.next(false)),
				);
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	addRetentionRule(retentionRule: RetentionRule) {
		if (!environment.addons.retention) throw 'Retention addon is not enabled';

		const payload = {
			'entity-type': 'document',
			name: retentionRule.title,
			path: '/RetentionRules/',
			type: 'RetentionRule',
			properties: {
				'dc:title': retentionRule.title,
				'dc:description': retentionRule.description,
				'retention_rule:docTypes': retentionRule.docTypes,
				'retention_rule:applicationPolicy': retentionRule.applicationPolicy,
				'retention_rule:enabled': retentionRule.enabled,
				'retention_def:startingPointPolicy': retentionRule.startingPointPolicy,
				'retention_def:startingPointEvent': retentionRule.startingPointEvent,
				'retention_def:startingPointValue': retentionRule.startingPointValue,
				'retention_def:metadataXPath': retentionRule.metadataXPath,
				'retention_def:expression': retentionRule.expression,
				'retention_def:durationYears': retentionRule.durationYears,
				'retention_def:durationMonths': retentionRule.durationMonths,
				'retention_def:durationDays': retentionRule.durationDays,
				'retention_def:durationMillis': retentionRule.durationMillis,
				'retention_def:endActions': retentionRule.endActions,
			},
		};

		const headers = {
			headers: new HttpHeaders({
				properties: '*',
			}),
		};

		return this.httpClient.post(`${this.apiUrl}/path/RetentionRules`, payload, headers);
	}

	// --------------------------------------------------------------------------------------------------
	updateRetentionRule(retentionRule: RetentionRule) {
		if (!environment.addons.retention) throw 'Retention addon is not enabled';

		const payload = {
			'entity-type': 'document',
			uid: retentionRule.uid,
			properties: {
				'dc:title': retentionRule.title,
				'dc:description': retentionRule.description,
				'retention_rule:docTypes': retentionRule.docTypes,
				'retention_rule:applicationPolicy': retentionRule.applicationPolicy,
				'retention_rule:enabled': retentionRule.enabled,
				'retention_def:startingPointPolicy': retentionRule.startingPointPolicy,
				'retention_def:startingPointEvent': retentionRule.startingPointEvent,
				'retention_def:startingPointValue': retentionRule.startingPointValue,
				'retention_def:metadataXPath': retentionRule.metadataXPath,
				'retention_def:expression': retentionRule.expression,
				'retention_def:durationYears': retentionRule.durationYears,
				'retention_def:durationMonths': retentionRule.durationMonths,
				'retention_def:durationDays': retentionRule.durationDays,
				'retention_def:durationMillis': retentionRule.durationMillis,
				'retention_def:endActions': retentionRule.endActions,
			},
		};

		const headers = {
			headers: new HttpHeaders({
				properties: '*',
			}),
		};

		return this.httpClient.put(`${this.apiUrl}/id/${retentionRule.uid}`, payload, headers);
	}

	// --------------------------------------------------------------------------------------------------
	toggleRetentionRule(retentionRuleUid: string, enabled: boolean) {
		if (!environment.addons.retention) throw 'Retention addon is not enabled';

		const url = `${this.apiUrl}/id/${retentionRuleUid}`;

		const payload = {
			'entity-type': 'document',
			uid: retentionRuleUid,
			properties: {
				'retention_rule:enabled': enabled,
			},
		};

		return this.httpClient.put(url, payload);
	}

	// --------------------------------------------------------------------------------------------------
	getStartingPointEvents(searchTerm?: string): Observable<any[]> {
		if (!environment.addons.retention) throw 'Retention addon is not enabled';

		const url = `${this.apiUrl}/automation/Directory.SuggestEntries`;

		const payload = {
			params: {
				directoryName: 'RetentionEvent',
				dbl10n: false,
				localize: true,
				lang: this.locale.locale().split('-')[0],
				searchTerm: searchTerm,
			},
			context: {},
		};

		const headers = {
			headers: new HttpHeaders({
				properties: '*',
			}),
		};

		return this.httpClient.post<any[]>(url, payload, headers);
	}

	// --------------------------------------------------------------------------------------------------
	endActions(searchTerm?: string): Observable<any[]> {
		if (!environment.addons.retention) throw 'Retention addon is not enabled';

		const url = `${this.apiUrl}/automation/Directory.SuggestEntries`;

		const payload = {
			params: {
				directoryName: 'RetentionEnd',
				dbl10n: false,
				localize: true,
				lang: this.locale.locale().split('-')[0],
				searchTerm: searchTerm,
			},
			context: {},
		};

		const headers = {
			headers: new HttpHeaders({
				properties: '*',
			}),
		};

		return this.httpClient.post<any[]>(url, payload, headers);
	}

	// --------------------------------------------------------------------------------------------------
	attachRetentionRule(documentUid: string, retentionRuleUid: string) {
		const url = `${this.apiUrl}/automation/Retention.AttachRule`;

		const payload = {
			context: {},
			input: documentUid,
			params: {
				rule: retentionRuleUid,
			},
		};

		const headers = {
			headers: new HttpHeaders({
				properties: 'dublincore,common,retention_rule,retention_definition',
			}),
		};

		return this.httpClient.post(url, payload, headers);
	}

	// --------------------------------------------------------------------------------------------------
	extendRetention(documentUid: string, until: Date) {
		const url = `${this.apiUrl}/automation/Document.Retain`;

		const payload = {
			context: {},
			input: documentUid,
			params: {
				until: until.toISOString(),
			},
		};

		const headers = {
			headers: new HttpHeaders({
				properties: 'dublincore,common,retention_rule,retention_definition',
			}),
		};

		return this.httpClient.post(url, payload, headers);
	}

	// --------------------------------------------------------------------------------------------------
	get docTypes() {
		return this._docTypes;
	}

	// --------------------------------------------------------------------------------------------------
	get dateFields() {
		return this._dateFields;
	}

	// --------------------------------------------------------------------------------------------------
	private getResources() {
		return forkJoin([this.getRetentionRulesRoot(), this.getDocTypesAndSchemas()]).pipe(
			map((response) => response[0]),
		);
	}

	// --------------------------------------------------------------------------------------------------
	private getRetentionRulesRoot() {
		const url = `${this.apiUrl}/path/RetentionRules`;

		const headers = {
			headers: new HttpHeaders({
				'enrichers-blob': 'appLinks,preview,wopi',
				'enrichers-document': 'permissions,breadcrumb,preview,thumbnail',
				'fetch-directoryEntry': 'parent',
				'fetch-document': 'properties,lock',
				'fetch-task': 'actors',
			}),
		};

		return this.httpClient.get(url, headers);
	}

	// --------------------------------------------------------------------------------------------------
	private getDocTypesAndSchemas() {
		return this.httpClient.get(`${this.apiUrl}/config/types`).pipe(
			map((x: any) => {
				const docTypes = new Set<string>();
				const docTypesSchemas = new Set<string>();

				for (const docTypeName in x.doctypes) {
					if (!Object.prototype.hasOwnProperty.call(x.doctypes, docTypeName)) continue;

					const docType = x.doctypes[docTypeName];

					if (
						docType.schemas.indexOf('file') !== -1 &&
						docType.facets.indexOf('Folderish') === -1 &&
						docType.facets.indexOf('HiddenInNavigation') === -1 &&
						docType.facets.indexOf('SystemDocument') === -1
					) {
						docTypes.add(docTypeName);

						for (const schema of docType.schemas) docTypesSchemas.add(schema);
					}
				}

				this._docTypes = Array.from(docTypes).sort((a, b) => a.localeCompare(b));

				return docTypesSchemas;
			}),
			switchMap((docTypesSchemas) => {
				if (!docTypesSchemas.size) return of([]);

				return this.httpClient.get(`${this.apiUrl}/config/schemas`).pipe(
					tap((x: any) => {
						const schemas: string[] = [];

						for (const schema of x)
							if (docTypesSchemas.has(schema.name))
								for (const fieldName in schema.fields)
									if (
										Object.prototype.hasOwnProperty.call(schema.fields, fieldName) &&
										schema.fields[fieldName] === 'date'
									)
										schemas.push(`${schema['@prefix']}:${fieldName}`);

						this._dateFields = schemas.sort((a, b) => a.localeCompare(b));
					}),
				);
			}),
		);
	}
}
