import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type ResultsToolbarContext, WebUiMessagePipe } from '@maretha/webui-sdk';

/**
 * Results toolbar action over the complete query. `queryScope` is the applied query (provider,
 * parameters, filters); hosts omit it when they cannot describe every active filter, and the
 * button is disabled then. `columns` lists the visible document fields, when the host knows them.
 */
@Component({
	selector: 'acme-results-export-register',
	imports: [WebUiMessagePipe],
	template: `<button type="button" [disabled]="!context().queryScope" (click)="run()">
		Export register ({{ context().totalCount ?? 0 }})
	</button>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeResultsExportRegisterComponent {
	readonly context = input.required<ResultsToolbarContext>();

	run(): void {
		const context = this.context();
		if (!context.queryScope) return;
		// Submit `context.queryScope` and the field names of `context.columns` to a server export
		// operation with HttpClient here, then offer the file link when it completes.
		context.reportMessage?.('acme.results.export-register.started', 'Register export started');
	}
}
