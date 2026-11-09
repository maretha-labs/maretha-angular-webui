import { DocumentViewerRegistryService } from './document-viewer-registry.service';
import { GenericNonFolderishViewerComponent } from './generic-non-folderish-viewer/generic-non-folderish-viewer.component';

class CallerFallback {}

describe('DocumentViewerRegistryService', () => {
	const service = new DocumentViewerRegistryService();

	it('supplies the generic non-folderish viewer unless the caller names a fallback', () => {
		expect(service.getComponent()).toBe(GenericNonFolderishViewerComponent);
		expect(service.getComponent(CallerFallback)).toBe(CallerFallback);
	});
});
