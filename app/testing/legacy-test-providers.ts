import { NgxTranslateCutModule } from 'ngx-translate-cut';
import { TimeagoModule } from 'ngx-timeago';
import { importProvidersFrom, inject, provideEnvironmentInitializer, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { BsModalRef, ModalModule } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';
import { of } from 'rxjs';
import { registerApplicationIcons } from '../application-icons';
import { TokenService } from '../helpers/token.service';

export function legacyTestProviders() {
	return [
		provideRouter([]),
		provideHttpClient(),
		provideHttpClientTesting(),
		provideNoopAnimations(),
		importProvidersFrom(
			TranslateModule.forRoot(),
			NgxTranslateCutModule.forRoot({}),
			TimeagoModule.forRoot(),
			ToastrModule.forRoot(),
			ModalModule,
		),
		BsModalRef,
		{
			provide: TokenService,
			useFactory: () => ({
				accessToken: 'fixture-token',
				isAccessTokenValid: true,
				isAdministrator: true,
				tokenUpdated: signal('fixture-token'),
				tokenUpdated$: of('fixture-token'),
			}),
		},
		provideEnvironmentInitializer(() => registerApplicationIcons(inject(FaIconLibrary))),
	];
}

export function fixtureDocument(type = 'File') {
	return {
		uid: 'fixture-document',
		type,
		title: 'Fixture document',
		path: '/fixture',
		parentRef: 'fixture-parent',
		facets: [],
		schemas: [],
		properties: {
			'dc:title': 'Fixture document',
			'dc:contributors': [],
			'dc:created': '2026-09-15T00:00:00Z',
			'dc:modified': '2026-09-15T00:00:00Z',
			'note:mime_type': 'text/plain',
			'note:note': 'Fixture note',
			'dc:subjects': [],
			'files:files': [],
			'file:content': null,
		},
		contextParameters: {
			permissions: ['Read', 'WriteProperties'],
			acls: [],
			breadcrumb: { entries: [] },
			pendingTasks: [],
			runningWorkflows: [],
		},
		ng: {
			isFolder: false,
			canWrite: true,
			facets: {},
			collections: {},
			permissions: {},
			renditions: [],
			schemas: {},
			attachments: [],
			subTypes: [],
		},
	};
}
