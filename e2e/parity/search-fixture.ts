import { HttpRequest, HttpResponse } from '@angular/common/http';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	makeEnvironmentProviders,
	signal,
} from '@angular/core';
import { AuthService } from 'app/helpers/auth.service';
import { DocumentSearchService } from 'app/modules/search/helpers/document-search.service';
import { SearchComponent } from 'app/modules/search/components/search-pane/search-pane.component';
import { DefaultSearchResultsComponent } from 'app/modules/search/components/default-search-results/default-search-results.component';
import { RepositorySearchComponent } from 'app/modules/search/components/repository-search/repository-search.component';
import { REPOSITORY_SEARCH } from 'app/modules/search/helpers/repository-search-definitions';
import { ContentColumnHeaderComponent } from 'app/modules/explorer/components/viewers/content-column-header.component';
import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import {
	ResultsProjectionComponent,
	ResultsProjectionTemplateDirective,
	ResultsProjectionColumn,
} from '@maretha/webui-sdk';
import { provideDefaultToolbar } from 'app/modules/explorer/components/document-toolbar/default-toolbar';
import { of } from 'rxjs';

const user = {
	id: 'fixture-search',
	displayName: 'Fixture Search',
	firstName: 'Fixture',
	lastName: 'Search',
	isAdministrator: true,
	isAnonymous: false,
	groups: [],
};
const image = (width: number, height: number, index: number) =>
	'data:image/svg+xml;charset=utf-8,' +
	encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${['#315e72', '#e0ad65', '#668d72', '#a07186'][index % 4]}"/><circle cx="${width * 0.65}" cy="${height * 0.4}" r="${Math.min(width, height) * 0.22}" fill="#fff8"/><text x="20" y="${height - 25}" font-family="sans-serif" font-size="30" fill="white">Fixture ${index + 1}</text></svg>`,
	);
export const searchFixtureDocuments = Array.from({ length: 12 }, (_, index) => {
	const [width, height] = [
		[1200, 800],
		[600, 1000],
		[1600, 900],
		[900, 900],
	][index % 4];
	return {
		uid: `fixture-result-${index}`,
		title: `${index % 3 === 0 ? 'Birdy' : index % 3 === 1 ? 'Landscape' : 'Portrait'} ${index + 1}`,
		type: index > 8 ? 'Video' : 'Picture',
		repository: 'default',
		path: `/fixtures/result-${index}`,
		facets: [],
		isTrashed: false,
		properties: {
			'dc:title': `Fixture ${index + 1}`,
			'dc:description': 'Synthetic document metadata for local parity verification.',
			'dc:modified': '2026-10-23T12:30:00Z',
			'dc:created': '2026-10-20T12:30:00Z',
			'dc:lastContributor': index % 2 ? 'fixture-person' : 'fixture-service',
			'dc:creator': 'fixture-person',
			'picture:info': { width, height },
		},
		contextParameters: {
			thumbnail: { url: image(width, height, index) },
			permissions: ['Read', 'Write', 'Remove'],
			hasContent: true,
		},
	};
});
const bucket = (key: string, count = 12) => ({ key, docCount: count });
const aggregations = Object.fromEntries(
	Object.entries({
		dc_modified_agg: ['last24h', 'lastWeek', 'lastMonth'],
		dc_creator_agg: ['fixture-person', 'fixture-service'],
		dc_nature_agg: ['article', 'image'],
		dc_subjects_agg: ['art', 'science'],
		dc_coverage_agg: ['europe', 'north-america'],
		common_size_agg: ['tiny', 'small', 'medium'],
		system_primaryType_agg: ['Picture', 'Video'],
		system_mimetype_agg: ['image/jpeg', 'video/mp4'],
		asset_width_agg: ['to_500_px', 'from_500_to_1500_px'],
		asset_height_agg: ['to_500_px', 'from_500_to_1500_px'],
		color_profile_agg: ['sRGB', 'RGB'],
		color_depth_agg: ['8'],
		video_duration_agg: ['to_30_s', 'from_30_to_180_s'],
	}).map(([key, values]) => [
		key,
		{
			type: 'terms',
			field: key,
			selection: [],
			buckets: values.map((value) => bucket(value)),
			extendedBuckets: values.map((value) => bucket(value)),
		},
	]),
);

export function searchFixtureResponse(request: HttpRequest<unknown>): HttpResponse<unknown> | null {
	// Native img elements consume these data URLs directly. LazyLoadDirective fetches them
	// through HttpClient, so the deliberately closed fixture transport must return the Blob too.
	const svgPrefix = 'data:image/svg+xml;charset=utf-8,';
	if (request.responseType === 'blob' && request.url.startsWith(svgPrefix))
		return new HttpResponse({
			body: new Blob([decodeURIComponent(request.url.slice(svgPrefix.length))], {
				type: 'image/svg+xml',
			}),
		});
	const url = new URL(request.urlWithParams, location.origin);
	let body: unknown;
	if (url.pathname.includes('/search/pp/')) {
		let entries = searchFixtureDocuments;
		const text = url.searchParams.get('ecm_fulltext') ?? url.searchParams.get('title') ?? '';
		if (text)
			entries = entries.filter((row) => row.title.toLowerCase().includes(text.toLowerCase()));
		if (url.search.includes('Video')) entries = entries.filter((row) => row.type === 'Video');
		if (url.search.includes('expired_search')) entries = [];
		body = {
			entries,
			resultsCount: entries.length,
			currentPageIndex: 0,
			isNextPageAvailable: false,
			aggregations,
			quickFilters: [
				{ name: 'noFolder', active: false },
				{ name: 'mostRecent', active: false },
				{ name: 'onlyValidated', active: false },
			],
		};
	} else if (url.pathname.includes('/api/v1/user/')) {
		const id = decodeURIComponent(url.pathname.split('/').at(-1)!);
		body = {
			id,
			properties:
				id === 'fixture-service'
					? { email: 'service@example.invalid' }
					: { firstName: 'Fixture', lastName: 'Contributor', email: 'fixture@example.invalid' },
		};
	} else if (url.pathname.includes('/search/saved'))
		body =
			request.method === 'GET'
				? {
						entries: [
							{
								id: 'fixture-saved',
								title: 'Fixture saved search',
								params: { ecm_fulltext: 'Birdy' },
							},
						],
					}
				: { id: 'fixture-saved-new', title: 'New fixture saved search', params: {} };
	else if (url.pathname.endsWith('/automation/User.GetCollections'))
		body = { entries: [{ uid: 'fixture-collection', title: 'Fixture Collection' }] };
	else if (url.pathname.includes('/automation/')) body = [];
	else if (url.pathname.includes('/config/types')) body = { doctypes: {} };
	else return null;
	return new HttpResponse({ body });
}
export function provideSearchFixture() {
	return makeEnvironmentProviders([
		{
			provide: AuthService,
			useValue: { userInfo: signal(user), userInfoUpdated$: of(user), logOff: () => undefined },
		},
		{ provide: DocumentSearchService, useClass: DocumentSearchService },
		provideDefaultToolbar(),
	]);
}

@Component({
	selector: 'nx-search-parity-fixture',
	imports: [
		SearchComponent,
		DefaultSearchResultsComponent,
		RepositorySearchComponent,
		ResultsProjectionComponent,
		ResultsProjectionTemplateDirective,
		UserTagComponent,
	],
	template: `<nav class="fixture-tabs">
			<button type="button" (click)="view.set('default')">Default search</button
			><button type="button" (click)="view.set('assets')">Assets</button
			><button type="button" (click)="view.set('expired')">Expired</button
			><button type="button" (click)="view.set('headers')">Shared content headers</button>
		</nav>
		@if (view() === 'default') {
			<div class="default">
				<aside><nx-search /></aside>
				<nx-default-search-results />
			</div>
		} @else if (view() === 'headers') {
			<nx-results-projection
				[rows]="headerRows()"
				[columns]="columns"
				[columnLayoutEnabled]="true"
				[remoteSort]="false"
				><ng-template nxResultsTemplate="cell:lastContributor" let-row="row"
					><nx-user-tag [user]="row.properties?.['dc:lastContributor']" /></ng-template
			></nx-results-projection>
		} @else {
			<nx-repository-search
				[context]="context"
				[definition]="view() === 'expired' ? searches.expired : searches.assets"
			/>
		}`,
	styles:
		':host{display:block;width:calc(100vw - 120px);max-width:1440px;min-height:600px}.fixture-tabs{display:flex;gap:8px;padding:12px}.default{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:680px}.default aside{height:680px;overflow:auto;background:var(--nuxeo-box)}nx-repository-search{height:720px}nx-results-projection{display:block;padding:24px} @media(max-width:700px){:host{width:100%}.default{grid-template-columns:1fr}.default aside{height:auto}}',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchParityFixture {
	readonly searches = REPOSITORY_SEARCH;
	readonly view = signal(new URLSearchParams(location.search).get('view') ?? 'default');
	readonly context = { document: null, noEdit: false, user };
	readonly title = signal('');
	readonly headerRows = computed(() =>
		searchFixtureDocuments.filter((row) =>
			row.title.toLowerCase().includes(this.title().toLowerCase()),
		),
	);
	readonly headerHost = {
		titleFilter: this.title,
		busy: () => false,
		setTitleFilter: (value: string) => this.title.set(value),
		aggregateBuckets: () => ({
			dc_modified_agg: [{ key: 'lastWeek', label: 'Last week', count: 12 }],
			dc_last_contributor_agg: [{ key: 'fixture-person', label: 'Fixture Contributor', count: 6 }],
		}),
		aggregateFilters: () => ({ dc_modified_agg: [], dc_last_contributor_agg: [] }),
		toggleAggregate: () => undefined,
	};
	readonly columns: readonly ResultsProjectionColumn<any>[] = [
		{ id: 'title', label: 'Title', value: (row: any) => row.title },
		{ id: 'modified', label: 'Modified', value: (row: any) => row.properties['dc:modified'] },
		{
			id: 'lastContributor',
			label: 'Last Contributor',
			value: (row: any) => row.properties['dc:lastContributor'],
		},
	].map((column) => ({
		...column,
		headerComponent: ContentColumnHeaderComponent,
		headerComponentParams: { content: this.headerHost, id: column.id },
	}));
}
