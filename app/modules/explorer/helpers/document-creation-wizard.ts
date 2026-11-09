import { InjectionToken } from '@angular/core';

/** Optional shell used by the stock Create / Import wizard. */
export const DOCUMENT_CREATION_WIZARD = new InjectionToken<{ back(): void }>(
	'DOCUMENT_CREATION_WIZARD',
);
