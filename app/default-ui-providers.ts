import { makeEnvironmentProviders } from '@angular/core';
import { DefaultBulkLayoutComponent, provideBulkLayouts } from '@maretha/webui-sdk';
import { provideDefaultShellActions } from './components/quick-search/default-shell-actions';
import { provideDefaultToolbar } from './modules/explorer/components/document-toolbar/default-toolbar';
import { provideDefaultFileActions } from './modules/explorer/components/document-attachments/default-file-actions';
import { provideDefaultPages } from './components/application-pages/default-pages';
import { provideDefaultAnalytics } from './modules/settings/default-analytics';
import { provideDefaultDrawer } from './modules/shared/components/sidebar/default-drawer';
import { provideDefaultAdministration } from './modules/settings/default-administration';
import { provideDefaultPublishViews } from './modules/explorer/components/viewers/default-publish-views';
import { provideDefaultDocumentInfoBar } from './modules/explorer/components/viewers/default-document-info-bar';
import { provideDefaultTrashActions } from './modules/explorer/components/viewers/default-trash-actions';
import { provideDefaultThemes } from './modules/shared/components/sidebar/user-menu/default-themes';
import { provideDefaultDocumentActions } from './modules/explorer/components/viewers/document-actions-toolbar/default-document-actions';
import { provideDefaultDocumentViews } from './modules/explorer/components/viewers/default-document-views';
import { provideDefaultUserMenu } from './modules/shared/components/sidebar/user-menu/default-user-menu';
import { provideDefaultDocumentLayouts } from './modules/explorer/components/default-document-layouts';

/** Canonical built-in providers shared by the application and catalog verification. */
export function provideDefaultUiProviders() {
	return makeEnvironmentProviders([
		provideDefaultDocumentActions(),
		provideDefaultDocumentViews(),
		provideDefaultDocumentLayouts(),
		provideDefaultTrashActions(),
		provideDefaultDocumentInfoBar(),
		provideDefaultPublishViews(),
		provideDefaultAdministration(),
		provideDefaultAnalytics(),
		provideDefaultDrawer(),
		provideDefaultPages(),
		provideDefaultShellActions(),
		provideDefaultFileActions(),
		provideDefaultToolbar(),
		...provideBulkLayouts({ name: 'default', component: DefaultBulkLayoutComponent }),
		provideDefaultUserMenu(),
		provideDefaultThemes(),
	]);
}
