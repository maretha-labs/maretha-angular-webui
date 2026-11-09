import { inject, Injectable, InjectionToken, signal } from '@angular/core';

/** Application-level settings; scroll fetching requires an explicit opt-in. */
export interface ResultsPagingOptions {
	readonly scrollPagingEnabled?: boolean;
}

/** Optional bootstrap configuration. Omission keeps folder/search paging manual. */
export const RESULTS_PAGING_OPTIONS = new InjectionToken<ResultsPagingOptions>(
	'RESULTS_PAGING_OPTIONS',
	{ providedIn: 'root', factory: () => ({ scrollPagingEnabled: false }) },
);

/**
 * Shared configuration boundary for result views and their navigation queues.
 * A future administrative settings loader can apply a resolved snapshot here.
 * This service does not load, persist, or expose an administrative settings UI.
 */
@Injectable({ providedIn: 'root' })
export class ResultsPagingSettings {
	private readonly enabled = signal(inject(RESULTS_PAGING_OPTIONS)?.scrollPagingEnabled === true);
	readonly scrollPagingEnabled = this.enabled.asReadonly();

	/** Replace the setting; missing/invalid values reset to manual paging. */
	apply(options?: ResultsPagingOptions | null): void {
		this.enabled.set(options?.scrollPagingEnabled === true);
	}
}
