import { makeEnvironmentProviders } from '@angular/core';
import {
	provideDocumentLayoutExtensions,
	provideResultsProjections,
	provideWebUiExtensions,
} from '@maretha/webui-sdk';
// <custom:imports>

/**
 * The only file core imports from custom/. Registrations apply after the default
 * application extensions. `npm run new:contribution` and `npm run new:layout` insert
 * entries above the marker comments; keep the markers.
 */
export function provideCustomExtensions() {
	return makeEnvironmentProviders([
		provideWebUiExtensions({
			id: 'custom.webui',
			contributions: [
				// <custom:contributions>
			],
			overrides: [],
		}),
		provideDocumentLayoutExtensions({
			id: 'custom.layouts',
			layouts: [
				// <custom:layouts>
			],
		}),
		// Result cards and cells, such as a grid card per document type: see "Result
		// projections" in the SDK README.
		provideResultsProjections(),
	]);
}
