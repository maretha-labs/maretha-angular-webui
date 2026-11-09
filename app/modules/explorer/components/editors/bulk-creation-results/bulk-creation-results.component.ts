import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BulkDocumentCreation, ImportState } from '../../../helpers/bulk-document-creation.service';
import { DocumentLinkPipe } from 'app/helpers/document-route';
@Component({
	selector: 'nx-bulk-creation-results',
	imports: [RouterLink, DocumentLinkPipe, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	templateUrl: './bulk-creation-results.component.html',
	styles: `
		section {
			padding: 16px;
		}
		ol {
			padding-inline-start: 24px;
			max-height: 40vh;
			overflow: auto;
		}
		li {
			padding: 8px 0;
			overflow-wrap: anywhere;
		}
		li span {
			display: block;
		}
		li p {
			margin: 4px 0;
		}
	`,
})
export class BulkCreationResultsComponent {
	private readonly uiLabels = injectUiMessages(RuntimeUiMessages);
	readonly batch = input.required<BulkDocumentCreation>();
	get labels(): Record<ImportState, string> {
		return {
			pending: this.uiLabels.text('app.labels.pending-331551', 'Pending'),
			checking: this.uiLabels.text(
				'app.labels.checking-destination-885a56',
				'Checking destination',
			),
			reading: this.uiLabels.text('app.labels.reading-text-10c504', 'Reading text'),
			uploading: this.uiLabels.text('app.labels.uploading-8b898c', 'Uploading'),
			creating: this.uiLabels.text('app.labels.creating-3b951e', 'Creating'),
			created: this.uiLabels.text('app.labels.created-d70b9e', 'Created'),
			failed: this.uiLabels.text('app.labels.needs-attention-c1ebc7', 'Needs attention'),
			unknown: this.uiLabels.text('app.labels.outcome-unknown-164557', 'Outcome unknown'),
		};
	}
}
