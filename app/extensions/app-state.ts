import { inject, Injectable, Signal, signal } from '@angular/core';
import { WebUiLocale } from './i18n/webui-locale';
import type { ApplicationUser } from './user-menu';
import type { WorkflowTask } from './workflow-layout';

function emptyAppState(): WebUiAppState {
	return {
		user: signal(null).asReadonly(),
		locale: inject(WebUiLocale).locale.asReadonly(),
		route: signal('').asReadonly(),
		query: signal({}).asReadonly(),
		clipboard: signal([]).asReadonly(),
		taskCount: signal(0).asReadonly(),
		currentTask: signal(null).asReadonly(),
		userWorkspace: signal(null).asReadonly(),
		nuxeoUrl: '',
	};
}

/**
 * Read-only application state, the model Polymer's nuxeo-app shares with its slots. Inject it
 * anywhere; slot contexts carry only what belongs to their host.
 */
@Injectable({ providedIn: 'root', useFactory: emptyAppState })
export abstract class WebUiAppState {
	/** Signed-in user; slot hosts also add it to plain contexts as `user`. */
	abstract readonly user: Signal<ApplicationUser | null>;
	abstract readonly locale: Signal<string>;
	/** Current URL after redirects, including the query string. */
	abstract readonly route: Signal<string>;
	abstract readonly query: Signal<Readonly<Record<string, string>>>;
	/** Documents on the user's clipboard. */
	abstract readonly clipboard: Signal<readonly Readonly<Record<string, unknown>>[]>;
	/** Open tasks assigned to the user. */
	abstract readonly taskCount: Signal<number>;
	/** Task shown on the tasks page, or null elsewhere. */
	abstract readonly currentTask: Signal<WorkflowTask | null>;
	/** Path of the user's personal workspace in the current repository. */
	abstract readonly userWorkspace: Signal<string | null>;
	/** Nuxeo server URL, without a trailing slash. */
	abstract readonly nuxeoUrl: string;
}

/**
 * Adds the shared `user` to a plain-object slot context. Polymer applies the shared model
 * before the host's model, so a host that sets its own `user` keeps it.
 */
export function withSharedSlotModel(context: unknown, user: ApplicationUser | null): unknown {
	if (!context || typeof context !== 'object' || 'user' in context) return context;
	const prototype = Object.getPrototypeOf(context);
	return prototype === Object.prototype || prototype === null ? { user, ...context } : context;
}
