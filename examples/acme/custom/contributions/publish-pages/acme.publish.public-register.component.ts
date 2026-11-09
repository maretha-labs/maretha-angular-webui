import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { PublishContext } from '@maretha/webui-sdk';

/** Publishing tab that explicitly excludes selections: it publishes the one shown document. */
@Component({
	selector: 'acme-publish-public-register',
	template: `
		<section>
			<h2>Public register</h2>
			@if (context().selectedDocuments) {
				<p>Publish documents to the public register one at a time.</p>
			} @else {
				<p>
					{{ context().document?.['title'] ?? 'This document' }} will appear in the public register.
				</p>
			}
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmePublishPublicRegisterComponent {
	readonly context = input.required<PublishContext>();
}
