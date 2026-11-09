import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { ExtensionRegistry, PageContext, WebUiPageComponent } from '@maretha/webui-sdk';
import { NotFoundComponent } from 'app/components/not-found/not-found.component';
import { AuthService } from 'app/helpers/auth.service';
import { toApplicationUser } from 'app/helpers/application-user';
import { TranslateService } from '@ngx-translate/core';
@Component({
	selector: 'nx-application-page',
	imports: [WebUiPageComponent, WebUiMessagePipe, NotFoundComponent],
	// An unknown page id opens the stock 404 error page, as stock nuxeo-app does for a page it lacks.
	template:
		'@if (!context().user) { <p role="status">{{ \'app.components.application-page.loading-your-session-2478e4\' | webuiMessage:\'Loading your session…\' }}</p> } @else if (registered()) { <nx-webui-page [context]="context()" /> } @else { <nx-not-found /> }',
	styles: ':host { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplicationPageComponent {
	private readonly auth = inject(AuthService);
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly translate = inject(TranslateService);
	private readonly registry = inject(ExtensionRegistry);
	private readonly data = toSignal(this.route.data, { initialValue: this.route.snapshot.data });
	private readonly params = toSignal(this.route.params, {
		initialValue: this.route.snapshot.params,
	});
	private readonly query = toSignal(this.route.queryParams, {
		initialValue: this.route.snapshot.queryParams,
	});
	private readonly url = toSignal(
		this.router.events.pipe(
			filter((event): event is NavigationEnd => event instanceof NavigationEnd),
			map((event) => event.urlAfterRedirects),
		),
		{ initialValue: this.router.url },
	);
	private readonly locale = toSignal(this.translate.onLangChange.pipe(map((event) => event.lang)), {
		initialValue: this.translate.getCurrentLang() || 'en-US',
	});
	readonly context = computed<PageContext>(() => {
		const user = this.auth.userInfo();
		return {
			document: null,
			noEdit: false,
			pageId: String(this.data()['pageId'] ?? this.params()['pageId'] ?? ''),
			params: this.params(),
			query: this.query(),
			route: this.url(),
			locale: this.locale(),
			user: toApplicationUser(user),
		};
	});
	/** Whether exactly one page contribution answers this page id for the current context. */
	readonly registered = computed(() => {
		const context = this.context();
		return (
			this.registry
				.resolve('PAGES', context)
				.items.filter((page) => page.pairKey === context.pageId).length === 1
		);
	});
}
