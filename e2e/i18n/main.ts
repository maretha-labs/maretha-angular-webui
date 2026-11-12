import {
	ChangeDetectionStrategy,
	Component,
	importProvidersFrom,
	inject,
	provideEnvironmentInitializer,
	provideZoneChangeDetection,
	signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HomeComponent } from 'app/components/home/home.component';
import { WebUiMessages, WebUiMessagePipe } from '@maretha/webui-sdk';
import { loadWebUiCatalog } from 'app/helpers/webui-message-catalog';
import {
	WEB_UI_CATALOG_LOADER,
	WebUiTranslationBridge,
} from 'app/helpers/webui-translation-bridge.service';
import pseudoCatalog from '../../dist/verification/i18n/pseudo.json';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { HttpResponse, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalService, ModalModule } from 'ngx-bootstrap/modal';
import { NgxTranslateCutModule } from 'ngx-translate-cut';
import { TimeagoModule } from 'ngx-timeago';
import { of, throwError } from 'rxjs';
import {
	NUXEO_ICONS,
	POLYMER_MESSAGES,
	provideWebUiIcons,
	provideWebUiMessages,
	provideWebUiThemeApplication,
} from '@maretha/webui-sdk';
import { AppComponent } from 'app/app.component';
import { registerApplicationIcons } from 'app/application-icons';
import { AuthService } from 'app/helpers/auth.service';
import { TokenService } from 'app/helpers/token.service';
import { WorkflowsService } from 'app/helpers/workflows.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { DocumentSearchService } from 'app/modules/search/helpers/document-search.service';
import { DocumentHistoryService } from 'app/modules/explorer/helpers/document-history.service';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { DocumentClipboardService } from 'app/modules/explorer/helpers/document-clipboard.service';
import { CreationParentService } from 'app/modules/explorer/helpers/creation-parent.service';
import { QuickSearchService } from 'app/components/quick-search/quick-search.service';
import { provideDefaultShellActions } from 'app/components/quick-search/default-shell-actions';
import { provideDefaultDrawer } from 'app/modules/shared/components/sidebar/default-drawer';
import { provideDefaultUserMenu } from 'app/modules/shared/components/sidebar/user-menu/default-user-menu';
import { provideDefaultThemes } from 'app/modules/shared/components/sidebar/user-menu/default-themes';
import {
	ConfirmationDialogComponent,
	confirmationDialogOptions,
} from 'app/modules/shared/components/confirmation-dialog/confirmation-dialog.component';
import { UnauthorizedComponent } from 'app/components/unauthorized/unauthorized.component';

const query = new URLSearchParams(location.search);
const signedOut = query.get('surface') === 'signed-out';
const locale = ['en-US', 'es', 'fr', 'ar', 'ro', 'pt-PT', 'it'].includes(query.get('locale') ?? '')
	? query.get('locale')!
	: 'en-US';
const pseudo = query.get('pseudo') === 'true';
localStorage.setItem('lang', locale);
localStorage.setItem(
	'maretha.webui.theme',
	query.get('theme') === 'dark' ? 'maretha.theme.dark' : 'maretha.theme.default',
);
const user = signal(
	signedOut
		? null
		: {
				id: 'fixture-reader',
				firstName: 'Save.customer.literal',
				lastName: 'Name',
				groups: [],
				isAdministrator: false,
			},
);
const documentState = signal(null);

@Component({
	selector: 'nx-i18n-page',
	imports: [UnauthorizedComponent, HomeComponent, FormsModule, WebUiMessagePipe],
	template: `<main
		id="fixture-content"
		[attr.data-i18n-ready]="!bridge.loading() && !bridge.failedLocale()"
		[attr.data-catalog-failed]="bridge.failedLocale()"
		[attr.data-pseudo]="pseudo"
	>
		@if (signedOut) {
			<nx-unauthorized />
		} @else {
			<nx-home />
			<label for="customer-draft">{{ 'label.dublincore.title' | webuiMessage: 'Title' }}</label>
			<input id="customer-draft" [(ngModel)]="draft" />
			<button data-confirm-trigger type="button" (click)="confirm()">
				{{ 'command.confirm' | webuiMessage: 'Confirm' }}
			</button>
		}
	</main>`,
	styles:
		':host{display:block;padding:24px;color:var(--nuxeo-text-default)} main{max-width:60rem;} button,input{padding:8px;color:var(--nuxeo-text-default);background:var(--nuxeo-box);border:1px solid var(--nuxeo-border)}',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class FixturePage {
	readonly signedOut = signedOut;
	readonly pseudo = pseudo;
	readonly bridge = inject(WebUiTranslationBridge);
	readonly messages = inject(WebUiMessages);
	draft = 'Save.customer.literal';
	private readonly modals = inject(BsModalService);
	confirm(): void {
		this.modals.show(
			ConfirmationDialogComponent,
			confirmationDialogOptions({
				initialState: {
					titleKey: 'command.confirm',
					messageKey: 'command.confirm',
					confirmButtonTitleKey: 'command.confirm',
					declineButtonTitleKey: 'command.cancel',
				},
			}),
		);
	}
}

bootstrapApplication(AppComponent, {
	providers: [
		provideZoneChangeDetection(),
		{
			provide: WEB_UI_CATALOG_LOADER,
			useValue: (selected: string) =>
				pseudo ? Promise.resolve(pseudoCatalog) : loadWebUiCatalog(selected),
		},
		provideNoopAnimations(),
		provideRouter([{ path: '**', component: FixturePage }]),
		provideHttpClient(
			withXhr(),
			withInterceptors([
				(request) => {
					if (request.url.includes('/assets/') || request.url.startsWith('assets/'))
						return of(new HttpResponse({ body: {} }));
					return throwError(
						() =>
							new Error(
								`Unexpected network dependency in internationalization fixture: ${request.method} ${request.url}`,
							),
					);
				},
			]),
		),
		importProvidersFrom(
			TranslateModule.forRoot(),
			NgxTranslateCutModule.forRoot({}),
			TimeagoModule.forRoot(),
			ModalModule,
		),
		provideWebUiIcons('maretha.polymer', NUXEO_ICONS),
		provideWebUiMessages('maretha.polymer', POLYMER_MESSAGES),
		provideDefaultDrawer(),
		provideDefaultShellActions(),
		provideDefaultUserMenu(),
		provideDefaultThemes(),
		provideWebUiThemeApplication(),
		provideEnvironmentInitializer(() => registerApplicationIcons(inject(FaIconLibrary))),
		{
			provide: AuthService,
			useValue: { userInfo: user, userInfoUpdated$: of(user()), logOff: () => user.set(null) },
		},
		{
			provide: TokenService,
			useValue: { isAccessTokenValid: false, isAdministrator: false, tokenUpdated$: of(null) },
		},
		{
			provide: DocumentsManagerService,
			useValue: { documentFetched: documentState, documentFetched$: of(null) },
		},
		{
			provide: WorkflowsService,
			useValue: { getUserTasks: () => of({ entries: [], resultsCount: 0 }) },
		},
		{
			provide: DocumentSearchService,
			useValue: {
				showSearchPaneVisibility: () => undefined,
				hideSearchPaneVisibility: () => undefined,
			},
		},
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
		{
			provide: CreationParentService,
			useValue: {
				load: () =>
					of({
						document: { uid: 'fixture-folder', path: '/', facets: ['Folderish'] },
						types: [],
						allowed: false,
					}),
			},
		},
		{
			provide: QuickSearchService,
			useValue: {
				search: () =>
					of([
						{
							id: 'fixture-document',
							label: 'Save.customer.literal',
							type: 'document',
							repository: 'default',
							thumbnail: null,
							highlights: [],
						},
					]),
			},
		},
	],
}).catch((error) => {
	console.error(error);
	document.body.dataset['fixtureError'] = String(error);
});
