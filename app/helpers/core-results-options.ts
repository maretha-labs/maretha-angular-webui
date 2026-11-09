import { InjectionToken } from '@angular/core';

/** Stock optional result actions stay disabled unless a deployment explicitly enables them. */
export interface CoreResultsOptions {
	readonly spreadsheet: boolean;
	readonly bulkEdit: boolean;
}
export const CORE_RESULTS_OPTIONS = new InjectionToken<CoreResultsOptions>('Core result actions', {
	providedIn: 'root',
	factory: () => ({ spreadsheet: false, bulkEdit: false }),
});
