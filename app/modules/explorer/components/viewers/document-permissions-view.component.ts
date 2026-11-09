import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DocumentViewContext } from '@maretha/webui-sdk';
import { DocumentPermissionsComponent } from '../document-permissions/document-permissions.component';

@Component({
	selector: 'nx-document-permissions-view',
	imports: [DocumentPermissionsComponent],
	template:
		'<nx-document-permissions [document]="context().document" [noEdit]="context().noEdit" />',
	styles: ':host { display: block; min-width: 0; padding: 0 20px 20px; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentPermissionsViewComponent {
	readonly context = input.required<DocumentViewContext>();
}
