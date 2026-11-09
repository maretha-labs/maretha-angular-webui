import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DocumentViewContext } from '@maretha/webui-sdk';
import { DocumentActivityComponent } from '../document-activity/document-activity.component';

@Component({
	selector: 'nx-document-history-view',
	imports: [DocumentActivityComponent],
	template: '<nx-document-activity [document]="context().document" />',
	styles: ':host { display: block; min-width: 0; padding: 20px; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentHistoryViewComponent {
	readonly context = input.required<DocumentViewContext>();
}
