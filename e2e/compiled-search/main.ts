import {
	importProvidersFrom,
	inject,
	provideEnvironmentInitializer,
	provideZoneChangeDetection,
	signal,
} from '@angular/core';
import { HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef, ModalModule } from 'ngx-bootstrap/modal';
import { NgxTranslateCutModule } from 'ngx-translate-cut';
import { TimeagoModule } from 'ngx-timeago';
import { ToastrModule } from 'ngx-toastr';
import { of, throwError } from 'rxjs';
import {
	NUXEO_ICONS,
	POLYMER_MESSAGES,
	provideWebUiIcons,
	provideWebUiMessages,
	provideWebUiThemeApplication,
} from '@maretha/webui-sdk';
import { AppComponent } from 'app/app.component';
import { AppRoutingModule } from 'app/app-routing.module';
import { registerApplicationIcons } from 'app/application-icons';
import { provideDefaultUiProviders } from 'app/default-ui-providers';
import { provideRepositorySearches } from 'app/modules/search/helpers/repository-search-providers';
import { AuthService } from 'app/helpers/auth.service';
import { TokenService } from 'app/helpers/token.service';
import { WorkflowsService } from 'app/helpers/workflows.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { DocumentSearchService } from 'app/modules/search/helpers/document-search.service';
import { DocumentHistoryService } from 'app/modules/explorer/helpers/document-history.service';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { DocumentClipboardService } from 'app/modules/explorer/helpers/document-clipboard.service';
import { QuickSearchService } from 'app/components/quick-search/quick-search.service';
import { fixtureSearches } from './searches';

// This entry is a synthetic assembly. The production entry never imports it.
localStorage.setItem('lang', 'en-US');
const user = signal({
	id: 'fixture-reader',
	firstName: 'Fixture',
	lastName: 'Reader',
	groups: [],
	isAdministrator: false,
});

bootstrapApplication(AppComponent, {
	providers: [
		provideZoneChangeDetection(),
		provideNoopAnimations(),
		importProvidersFrom(
			AppRoutingModule,
			TranslateModule.forRoot(),
			NgxTranslateCutModule.forRoot({}),
			TimeagoModule.forRoot(),
			ToastrModule.forRoot(),
			ModalModule,
		),
		provideHttpClient(
			withInterceptors([
				(request, next) => {
					const svgPrefix = 'data:image/svg+xml;charset=utf-8,';
					if (request.responseType === 'blob' && request.url.startsWith(svgPrefix))
						return of(
							new HttpResponse({
								body: new Blob([decodeURIComponent(request.url.slice(svgPrefix.length))], {
									type: 'image/svg+xml',
								}),
							}),
						);
					const url = new URL(request.url, location.origin);
					if (
						url.pathname.startsWith('/nuxeo/api/v1/search/') ||
						url.pathname.startsWith('/nuxeo/api/v1/user/') ||
						url.pathname === '/nuxeo/api/v1/automation/User.GetCollections'
					) {
						// Playwright supplies synthetic Nuxeo responses on this fixture's origin.
						return next(request.clone({ url: url.pathname + url.search }));
					}
					if (request.url.includes('/assets/') || request.url.startsWith('assets/'))
						return of(new HttpResponse({ body: {} }));
					return throwError(
						() =>
							new Error(
								`Unexpected network dependency in compiled-search fixture: ${url.pathname}`,
							),
					);
				},
			]),
		),
		provideWebUiIcons('maretha.polymer', NUXEO_ICONS),
		provideWebUiMessages('maretha.polymer', POLYMER_MESSAGES),
		provideDefaultUiProviders(),
		provideRepositorySearches('fixture.compiled-search', fixtureSearches),
		provideWebUiThemeApplication(),
		provideEnvironmentInitializer(() => registerApplicationIcons(inject(FaIconLibrary))),
		{ provide: BsModalRef, useValue: { hide: () => undefined } },
		{
			provide: AuthService,
			useValue: { userInfo: user, userInfoUpdated$: of(user()), logOff: () => undefined },
		},
		{
			provide: TokenService,
			useValue: { isAccessTokenValid: false, isAdministrator: false, tokenUpdated$: of(null) },
		},
		{
			provide: DocumentsManagerService,
			useValue: { documentFetched: signal(null), documentFetched$: of(null) },
		},
		{
			provide: WorkflowsService,
			useValue: { getUserTasks: () => of({ entries: [], resultsCount: 0 }) },
		},
		{ provide: DocumentSearchService, useClass: DocumentSearchService },
		{
			provide: DocumentHistoryService,
			useValue: { documentHistory: signal([]), clear: () => undefined },
		},
		{
			provide: DocumentCollectionsService,
			useValue: { documentCollectionsList: signal([]), documentCollectionsUpdated$: of([]) },
		},
		{
			provide: DocumentClipboardService,
			useValue: { documentClipboard: signal([]), clear: () => undefined },
		},
		{ provide: QuickSearchService, useValue: { search: () => of([]) } },
	],
}).catch((error) => {
	console.error(error);
	document.body.dataset['fixtureError'] = String(error);
});
