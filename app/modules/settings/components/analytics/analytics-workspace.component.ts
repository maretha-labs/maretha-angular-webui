import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AdministrationContext, DocumentViewsComponent } from '@maretha/webui-sdk';
@Component({
	selector: 'nx-analytics-workspace',
	imports: [DocumentViewsComponent, WebUiMessagePipe],
	templateUrl: './analytics-workspace.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsWorkspaceComponent {
	readonly context = input.required<AdministrationContext>();
}
