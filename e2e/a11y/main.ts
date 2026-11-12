import {
	SearchParityFixture,
	provideSearchFixture,
	searchFixtureResponse,
} from '../parity/search-fixture';
import {
	DocumentParityFixture,
	provideDocumentFixture,
	documentFixtureResponse,
} from '../parity/document-fixture';
import { MediaParityFixture } from '../parity/media-fixture';
import {
	AccountParityFixture,
	provideAccountFixture,
	accountFixtureResponse,
} from '../parity/account-fixture';
import { SaveFixture } from './save-fixture';
import { RuntimeTreeFixture } from './runtime-tree-fixture';
import { provideBrowseDrawerFixture } from '../parity/browse-drawer-fixture';
import { NavigationFixture } from './navigation-fixture';
import {
	ChangeDetectionStrategy,
	Component,
	importProvidersFrom,
	inject,
	provideEnvironmentInitializer,
	provideZoneChangeDetection,
	signal,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { HttpResponse, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef, BsModalService, ModalModule } from 'ngx-bootstrap/modal';
import { NgxTranslateCutModule } from 'ngx-translate-cut';
import { TimeagoModule } from 'ngx-timeago';
import { of, throwError } from 'rxjs';
import {
	NUXEO_ICONS,
	NuxeoActionsMenuComponent,
	NuxeoTooltipComponent,
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
import { StandardContentEditorComponent } from 'app/modules/explorer/components/editors/standard-content-editor.component';
import { DocumentAttachmentsService } from 'app/modules/explorer/helpers/document-attachments.service';
import { FileUploadComponent } from 'app/modules/shared/components/file-upload/file-upload.component';
import { provideDefaultFileActions } from 'app/modules/explorer/components/document-attachments/default-file-actions';
import { AutomationsService } from 'app/modules/explorer/helpers/automations.service';

const query = new URLSearchParams(location.search);
const signedOut = query.get('surface') === 'signed-out';
const locale = query.get('locale') === 'ar' ? 'ar' : 'en-US';
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
				firstName: 'Fixture',
				lastName: 'Reader',
				groups: [],
				isAdministrator: false,
			},
);
const documentState = signal(null);

@Component({
	selector: 'nx-a11y-page',
	imports: [
		UnauthorizedComponent,
		NuxeoActionsMenuComponent,
		NuxeoTooltipComponent,
		StandardContentEditorComponent,
		FileUploadComponent,
		NavigationFixture,
		RuntimeTreeFixture,
		SaveFixture,
		AccountParityFixture,
		MediaParityFixture,
		SearchParityFixture,
		DocumentParityFixture,
	],
	template: `<main
		id="fixture-content"
		tabindex="-1"
		[class.parity-fixture]="surface?.endsWith('-parity')"
	>
		<h1>{{ arabic ? 'مساحة عمل الاختبار' : 'Component accessibility fixture' }}</h1>
		<p data-fixture-notice>
			Deterministic local component fixture. No Nuxeo connection; this is not installed-package
			acceptance.
		</p>
		@if (signedOut) {
			<nx-unauthorized />
			<p>
				Nuxeo owns the OAuth login form. Its accessibility scan requires a configured local Nuxeo.
			</p>
		} @else if (surface === 'actions-menu') {
			<button type="button" data-before-menu>{{ arabic ? 'قبل القائمة' : 'Before menu' }}</button>
			<nx-actions-menu [label]="arabic ? 'إجراءات الوثيقة' : 'Document actions'">
				<ng-template #dropdown>
					<button type="button" (click)="outcome.set('First action')">
						{{ arabic ? 'الإجراء الأول' : 'First action' }}
					</button>
					<button type="button" disabled>{{ arabic ? 'غير متاح' : 'Unavailable' }}</button>
					<button type="button" hidden>Hidden action</button>
					<button type="button" (click)="outcome.set('Last action')">
						{{ arabic ? 'الإجراء الأخير' : 'Last action' }}
					</button>
				</ng-template>
			</nx-actions-menu>
			<button type="button" data-after-menu>{{ arabic ? 'بعد القائمة' : 'After menu' }}</button>
			<p role="status">{{ outcome() }}</p>
		} @else if (surface === 'tooltip') {
			<p id="fixture-help">{{ arabic ? 'وصف موجود للزر.' : 'Existing button description.' }}</p>
			<nx-tooltip>
				<ng-template #trigger
					><button type="button" aria-describedby="fixture-help" data-tooltip-trigger>
						{{ arabic ? 'مساعدة' : 'Help' }}
					</button></ng-template
				>
				<ng-template #content>{{
					arabic ? 'معلومات إضافية' : 'Additional information'
				}}</ng-template>
			</nx-tooltip>
			<button type="button" data-after-tooltip>{{ arabic ? 'بعد المساعدة' : 'After help' }}</button>
		} @else if (surface === 'search-parity') {
			<nx-search-parity-fixture />
		} @else if (surface === 'document-parity') {
			<nx-document-parity-fixture />
		} @else if (surface === 'media-parity') {
			<nx-media-parity-fixture />
		} @else if (surface === 'account-parity') {
			<nx-account-parity-fixture />
		} @else if (surface === 'save-lifecycle') {
			<nx-save-a11y-fixture />
		} @else if (surface === 'runtime-document-tree') {
			<nx-runtime-tree-fixture />
		} @else if (surface === 'document-tabs' || surface === 'sdk-tree') {
			<nx-navigation-fixture [surface]="surface" />
		} @else if (surface === 'content-editors') {
			<section aria-labelledby="first-editor-heading">
				<p id="first-editor-heading">{{ arabic ? 'المحرر الأول' : 'First editor' }}</p>
				<nx-standard-content-editor documentType="Note" [parentDocument]="parentDocument" />
			</section>
			<section aria-labelledby="second-editor-heading">
				<p id="second-editor-heading">{{ arabic ? 'المحرر الثاني' : 'Second editor' }}</p>
				<nx-standard-content-editor documentType="Note" [parentDocument]="parentDocument" />
			</section>
		} @else if (surface === 'file-upload') {
			<nx-file-upload [autoFocus]="true" (update)="selectedFiles($event)" />
			<button type="button" data-after-upload>
				{{ arabic ? 'بعد اختيار الملف' : 'After file picker' }}
			</button>
			<p role="status">{{ outcome() }}</p>
		} @else {
			<p>
				{{
					arabic
						? 'اختبار التنقل ولوحات الحوار باستخدام لوحة المفاتيح.'
						: 'Use the real navigation, user menu, quick search and confirmation dialog.'
				}}
			</p>
			<button type="button" (click)="confirm()">
				{{ arabic ? 'فتح مربع التأكيد' : 'Open confirmation dialog' }}
			</button>
			<p role="status">{{ outcome() }}</p>
		}
	</main>`,
	styles:
		':host {display:block;padding:24px;color:var(--nuxeo-text-default);} main {max-width:60rem;} main.parity-fixture {max-width:none;} h1 {color:inherit;} button {padding:8px 16px;color:var(--nuxeo-text-default);background:var(--nuxeo-box);border:1px solid var(--nuxeo-border);}',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class FixturePage {
	readonly surface = query.get('surface');
	readonly parentDocument = { uid: 'fixture-folder' };
	readonly signedOut = signedOut;
	readonly arabic = locale === 'ar';
	readonly outcome = signal('');
	private readonly modals = inject(BsModalService);
	selectedFiles(files: File[]): void {
		this.outcome.set(files.map((file) => file.name).join(', '));
	}
	confirm(): void {
		const modal = this.modals.show(
			ConfirmationDialogComponent,
			confirmationDialogOptions({
				initialState: {
					title: this.arabic ? 'تأكيد الإجراء' : 'Confirm action',
					message: this.arabic ? 'هل تريد المتابعة؟' : 'Continue with this fixture action?',
					confirmButtonTitle: this.arabic ? 'تأكيد' : 'Confirm',
					declineButtonTitle: this.arabic ? 'إلغاء' : 'Cancel',
				},
			}),
		);
		modal.content!.confirm$.subscribe(() => this.outcome.set('Confirmed fixture action.'));
		modal.content!.decline$.subscribe(() => this.outcome.set('Cancelled fixture action.'));
	}
}

bootstrapApplication(AppComponent, {
	providers: [
		...(query.get('surface') === 'browse-drawer' ? [provideBrowseDrawerFixture()] : []),
		provideZoneChangeDetection(),
		provideNoopAnimations(),
		provideRouter([{ path: '**', component: FixturePage }]),
		provideHttpClient(
			withXhr(),
			withInterceptors([
				(request) => {
					if (query.get('surface') === 'search-parity') {
						const response = searchFixtureResponse(request);
						if (response) return of(response);
					}
					if (query.get('surface') === 'document-parity') {
						const response = documentFixtureResponse(request);
						if (response) return of(response);
					}
					if (query.get('surface') === 'account-parity') {
						const response = accountFixtureResponse(request);
						if (response) return of(response);
					}
					if (request.url.includes('/assets/') || request.url.startsWith('assets/'))
						return of(new HttpResponse({ body: {} }));
					return throwError(
						() =>
							new Error(
								`Unexpected network dependency in accessibility fixture: ${request.method} ${request.url}`,
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
		provideDefaultFileActions(),
		{ provide: BsModalRef, useValue: { hide: () => undefined } },
		{ provide: DocumentAttachmentsService, useValue: {} },
		{
			provide: AutomationsService,
			useValue: {
				getDirectoryEntries: () => of([{ id: 'customer', displayLabel: 'Customer {label}' }]),
			},
		},
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
							label: locale === 'ar' ? 'وثيقة الاختبار' : 'Fixture document',
							type: 'document',
							repository: 'default',
							thumbnail: null,
							highlights: [],
						},
					]),
			},
		},
		...(query.get('surface') === 'account-parity' ? [provideAccountFixture()] : []),
		...(query.get('surface') === 'search-parity' ? [provideSearchFixture()] : []),
		...(query.get('surface') === 'document-parity' ? [provideDocumentFixture()] : []),
	],
}).catch((error) => {
	console.error(error);
	document.body.dataset['fixtureError'] = String(error);
});
