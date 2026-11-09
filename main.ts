import { provideDefaultUiProviders } from './app/default-ui-providers';
import { provideSuggestionSettings } from './app/helpers/suggestion-settings-loader';
import { DocumentContentRendererComponent } from './app/helpers/document-content-renderer.component';
import { NativeResultsCommandGateway } from './app/helpers/results-command-gateway';
import { NativeSavedSearchGateway } from './app/helpers/saved-search-gateway';
import { provideCustomExtensions } from './custom/index';
import {
	ApplicationConfig,
	enableProdMode,
	importProvidersFrom,
	provideZoneChangeDetection,
} from '@angular/core';
import { HashLocationStrategy, LocationStrategy, registerLocaleData } from '@angular/common';
import localeRo from '@angular/common/locales/ro';
import localeAr from '@angular/common/locales/ar';
import {
	DOCUMENT_LAYOUT_GATEWAY,
	DOCUMENT_CONTENT_RENDERER,
	RESULTS_COMMAND_GATEWAY,
	SAVED_SEARCH_GATEWAY,
	NUXEO_ICONS,
	POLYMER_MESSAGES,
	provideWebUiIcons,
	provideWebUiMessages,
	provideWebUiThemeApplication,
} from '@maretha/webui-sdk';
import { DocumentLayoutGatewayService } from './app/modules/explorer/helpers/document-layout-gateway.service';
import { provideContractExample } from './examples/contract/contract-extension';
import localeEn from '@angular/common/locales/en';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import {
	FetchBackend,
	HttpClient,
	provideHttpClient,
	withInterceptors,
	withInterceptorsFromDi,
} from '@angular/common/http';
import { pdfRangeHttpInterceptor } from './app/helpers/pdf-range-http';
import { provideApplicationState } from './app/helpers/application-state';
import { GuardsCheckEnd } from '@angular/router';
import { TranslateCompiler, TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateFormatJsCompiler } from 'ngx-translate-formatjs-compiler';
import { progressInterceptor, provideNgProgressHttp } from 'ngx-progressbar/http';
import { provideNgProgressRouter } from 'ngx-progressbar/router';

import { AppComponent } from './app/app.component';
import { AppRoutingModule } from './app/app-routing.module';
import { SharedModule } from './app/modules/shared/shared.module';
import { WebpackTranslateLoaderService } from './app/helpers/webpack-translate-loader.service';
import { environment } from './environments/environment';

export function getBaseUrl() {
	return document.getElementsByTagName('base')[0].href;
}

registerLocaleData(localeRo, 'ro');
registerLocaleData(localeAr, 'ar');
registerLocaleData(localeEn, 'en-US');

if (environment.production) {
	enableProdMode();
}

/** Application providers; custom/ registrations apply after the first-party defaults. */
export const appConfig: ApplicationConfig = {
	providers: [
		provideWebUiIcons('maretha.polymer', NUXEO_ICONS),
		provideWebUiMessages('maretha.polymer', POLYMER_MESSAGES),
		provideApplicationState(),
		provideDefaultUiProviders(),
		provideSuggestionSettings(),
		provideCustomExtensions(),
		{ provide: DOCUMENT_LAYOUT_GATEWAY, useExisting: DocumentLayoutGatewayService },
		{ provide: DOCUMENT_CONTENT_RENDERER, useValue: DocumentContentRendererComponent },
		{ provide: RESULTS_COMMAND_GATEWAY, useExisting: NativeResultsCommandGateway },
		{ provide: SAVED_SEARCH_GATEWAY, useExisting: NativeSavedSearchGateway },
		...(environment.production ? [] : [provideContractExample()]),
		provideWebUiThemeApplication(),
		{ provide: 'BASE_URL', useFactory: getBaseUrl, deps: [] },
		{ provide: LocationStrategy, useClass: HashLocationStrategy },
		provideZoneChangeDetection(),
		FetchBackend,
		provideHttpClient(
			withInterceptorsFromDi(),
			withInterceptors([progressInterceptor, pdfRangeHttpInterceptor]),
		),
		provideNgProgressHttp({ silentApis: [`${environment.nuxeoUrl}/api/v1/repo`] }),
		provideNgProgressRouter({ startEvents: [GuardsCheckEnd] }),
		importProvidersFrom(
			BrowserAnimationsModule,
			BrowserModule,
			AppRoutingModule,
			SharedModule,
			TranslateModule.forRoot({
				loader: {
					provide: TranslateLoader,
					useFactory: (httpClient: HttpClient, moduleName?: string) =>
						new WebpackTranslateLoaderService(httpClient, moduleName),
					deps: [HttpClient],
				},
				compiler: {
					provide: TranslateCompiler,
					useClass: TranslateFormatJsCompiler,
				},
			}),
		),
	],
};

// Only the application page has the root element; main.spec.ts imports appConfig.
if (document.querySelector('nx-root'))
	bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
