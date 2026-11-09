import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Location } from '@angular/common';
import { Component, ChangeDetectionStrategy, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';

/** HTTP statuses the stock error page labels: 404 "Not Found" and 403 "Permission Denied". */
export type ErrorPageCode = 403 | 404;

/**
 * Navigation state an error redirect may carry: the status (404 when absent) and the document path
 * or id that failed to load.
 */
export interface ErrorPageState {
	readonly error?: { readonly code?: ErrorPageCode; readonly document?: string };
}

@Component({
	imports: [WebUiMessagePipe],
	selector: 'nx-not-found',
	templateUrl: './not-found.component.html',
	styleUrls: ['./not-found.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {
	private readonly router = inject(Router);
	private readonly location = inject(Location);
	/** A status the host page fixes, such as the unauthorized page's 403; the navigation state's otherwise. */
	readonly status = input<ErrorPageCode>();
	/**
	 * Stock nuxeo-error: a document that fails to load shows its path and "Could not load document.";
	 * any other route shows the route. Read per navigation: the route is reused between two error pages.
	 */
	readonly error = computed(() => {
		const state = this.router.lastSuccessfulNavigation()?.extras.state as
			| ErrorPageState
			| undefined;
		const document = state?.error?.document ?? null;
		const route = this.location
			.path()
			.replace(/[?#].*$/, '')
			.replace(/^\/+/, '');
		return {
			code: this.status() ?? state?.error?.code ?? 404,
			document,
			address: document ?? route,
		};
	});
	/** The status code, printed unchanged above its label as stock nuxeo-error does. */
	get code(): ErrorPageCode {
		return this.error().code;
	}
}
