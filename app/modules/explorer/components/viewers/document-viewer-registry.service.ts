import { Injectable, Type } from '@angular/core';
import { GenericNonFolderishViewerComponent } from './generic-non-folderish-viewer/generic-non-folderish-viewer.component';

/** Supplies the built-in viewer for a non-folderish document that no view layout claims. */
@Injectable({
	providedIn: 'root',
})
export class DocumentViewerRegistryService {
	readonly defaultComponent = GenericNonFolderishViewerComponent;

	// --------------------------------------------------------------------------------------------------
	getComponent(fallback: Type<unknown> = this.defaultComponent): Type<unknown> {
		return fallback;
	}
}
