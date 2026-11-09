import { computed, inject, Provider } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { WebUiAppState, WebUiLocale } from '@maretha/webui-sdk';
import { DocumentClipboardService } from 'app/modules/explorer/helpers/document-clipboard.service';
import { environment } from 'environments/environment';
import { filter, map } from 'rxjs';
import { toApplicationUser } from './application-user';
import { AuthService } from './auth.service';
import { PersonalWorkspaceService } from './personal-workspace.service';
import { WorkflowInboxService } from './workflow-inbox.service';

/** Backs the SDK's read-only `WebUiAppState`, the model Polymer's nuxeo-app shares with slots. */
export function provideApplicationState(): Provider {
	return {
		provide: WebUiAppState,
		useFactory: (): WebUiAppState => {
			const auth = inject(AuthService);
			const router = inject(Router);
			const inbox = inject(WorkflowInboxService);
			const workspace = inject(PersonalWorkspaceService);
			const route = toSignal(
				router.events.pipe(
					filter((event): event is NavigationEnd => event instanceof NavigationEnd),
					map((event) => event.urlAfterRedirects),
				),
				{ initialValue: router.url },
			);
			return {
				user: computed(() => toApplicationUser(auth.userInfo())),
				locale: inject(WebUiLocale).locale.asReadonly(),
				route,
				query: computed(() =>
					Object.fromEntries(
						Object.entries(router.parseUrl(route()).queryParams).map(([key, value]) => [
							key,
							String(Array.isArray(value) ? value[0] : value),
						]),
					),
				),
				clipboard: inject(DocumentClipboardService).documentClipboard,
				taskCount: inbox.count,
				currentTask: inbox.current,
				userWorkspace: computed(() => workspace.workspace()?.path ?? null),
				nuxeoUrl: String(environment.nuxeoUrl ?? '').replace(/\/+$/, ''),
			};
		},
	};
}
