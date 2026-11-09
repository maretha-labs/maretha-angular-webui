import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { Observable, Subject } from 'rxjs';
import { LayoutService } from './layout.service';

@Injectable({
	providedIn: 'root',
})
export class DocumentBrowserService {
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;

	fetchingDocuments$ = new Subject<boolean>();

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly layoutService: LayoutService,
		private readonly httpClient: HttpClient,
	) {}

	// --------------------------------------------------------------------------------------------------
	/** Fetch a single document by Nuxeo path (lightweight — dublincore only). */
	getTreeNode(path: string, repository = 'default'): Observable<any> {
		const encoded = path.split('/').map(encodeURIComponent).join('/');
		return this.httpClient.get(
			`${this.apiUrl}/repo/${encodeURIComponent(repository)}/path${encoded}`,
			{
				headers: new HttpHeaders({ properties: 'dublincore' }),
			},
		);
	}

	// --------------------------------------------------------------------------------------------------
	/**
	 * Direct navigable children for the tree panel through the stock `tree_children` page
	 * provider (Polymer `nuxeo-document-tree`), which only needs Read on the parent.
	 */
	getTreeChildren(parentUid: string, page = 0, repository = 'default'): Observable<any> {
		return this.httpClient.get(
			`${this.apiUrl}/repo/${encodeURIComponent(repository)}/search/pp/tree_children/execute?queryParams=${encodeURIComponent(parentUid)}&pageSize=100&currentPageIndex=${page}`,
			{
				headers: new HttpHeaders({
					properties: 'dublincore,common',
					'enrichers-document': 'hasFolderishChild',
				}),
			},
		);
	}

	// --------------------------------------------------------------------------------------------------
	loadMore(
		documentUid: string,
		currentPage = 0,
		ordered = false,
		repository = 'default',
		trashed = false,
	): Observable<any> {
		this.fetchingDocuments$.next(true);

		const pageSize = this.layoutService.pageSize;

		// The page provider field is boolean: `1` does not parse as true.
		let query = `?currentPageIndex=${currentPage}&pageSize=${pageSize}&ecm_trashed=${trashed ? 'true' : 'false'}`;

		if (documentUid) query += `&ecm_parentId=${encodeURIComponent(documentUid)}`;

		if (ordered) query += '&sortBy=ecm%3Apos&sortOrder=asc';
		else if (this.layoutService.sortFields)
			query += `&sortBy=${this.layoutService.sortFields.join(',')}&sortOrder=${this.layoutService.sortAscending ? 'asc' : 'desc'}`;

		// const searchFilters = this.layoutService.filters.map(x => `${x.fieldName}=${x.fieldValue}`).join('&');
		// query += searchFilters ? `&${searchFilters}` : '';

		const parent = documentUid.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
		const orderedQuery = `SELECT * FROM Document WHERE ecm:parentId='${parent}' AND ecm:isVersion=0 AND ecm:isTrashed=${trashed ? 1 : 0} AND ecm:mixinType!='HiddenInNavigation' ORDER BY ecm:pos`;
		const base = `${this.apiUrl}/repo/${encodeURIComponent(repository)}`;
		const url = ordered
			? `${base}/query?query=${encodeURIComponent(orderedQuery)}&currentPageIndex=${currentPage}&pageSize=${pageSize}`
			: `${base}/search/pp/advanced_document_content/execute${query}`;
		const headers = {
			headers: new HttpHeaders({
				'enrichers-blob': 'appLinks',
				'enrichers-document':
					'hasContent,permissions,subscribedNotifications,thumbnail,subtypes,renditions',
				properties: '*', // Change to something like 'dublincore,file,etc' to retrieve only certain schemas
				'fetch-document': 'properties,lock',
			}),
		};

		return this.httpClient.get(url, headers);
	}
}
