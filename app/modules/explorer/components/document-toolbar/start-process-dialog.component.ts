import { ChangeDetectionStrategy, Component, Input, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ResultsToolbarContext, WebUiMessagePipe, WebUiMessages } from '@maretha/webui-sdk';
import { localizedText, messageText } from 'app/helpers/localized-message';

@Component({
	host: { '(keydown.escape)': 'escape($event)' },
	selector: 'nx-start-process-dialog',
	imports: [FormsModule, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<div class="modal-header">
			<h2 class="h5">{{ 'workflowButton.dialog.heading' | webuiMessage: 'Start Process' }}</h2>
		</div>
		<form (ngSubmit)="start()">
			<div class="modal-body">
				<label for="process-model">{{
					'workflowButton.dialog.process' | webuiMessage: 'Process'
				}}</label
				><select
					id="process-model"
					name="model"
					[(ngModel)]="selected"
					[disabled]="busy()"
					required
				>
					<option value="">
						{{ 'workflowButton.dialog.selectProcess' | webuiMessage: 'Select a process' }}
					</option>
					@for (model of context.workflows; track model.name) {
						<option [value]="model.name">{{ processLabel(model) }}</option>
					}
				</select>
				@if (error()) {
					<p role="alert">{{ error() }}</p>
				}
			</div>
			<div class="modal-footer">
				<button type="button" class="btn btn-link" [disabled]="busy()" (click)="close()">
					{{ 'command.close' | webuiMessage: 'Close' }}</button
				><button type="submit" class="btn btn-primary" [disabled]="!selected || busy()">
					{{ 'workflowButton.dialog.start' | webuiMessage: 'Start' }}
				</button>
			</div>
		</form>`,
	styles: `
		label {
			display: block;
			margin-bottom: 8px;
		}
		select {
			width: 100%;
			border: 0;
			border-bottom: 1px solid var(--nuxeo-border);
			padding: 8px 0;
			background: transparent;
			color: inherit;
		}
	`,
})
export class StartProcessDialogComponent {
	@Input() context!: ResultsToolbarContext;
	selected = '';
	readonly busy = signal(false);
	readonly error = localizedText('');
	private readonly modal = inject(BsModalRef);
	private readonly messages = inject(WebUiMessages);
	processLabel(model: { name: string; title: string }): string {
		const fallback =
			(
				{
					SerialDocumentReview: 'Serial Document Review',
					ParallelDocumentReview: 'Parallel Document Review',
				} as Record<string, string>
			)[model.name] ?? model.name;
		return this.messages.text(model.title, this.messages.text(model.name, fallback));
	}
	escape(event: Event): void {
		event.preventDefault();
		event.stopPropagation();
		this.close();
	}
	close(): void {
		if (!this.busy()) this.modal.hide();
	}
	async start(): Promise<void> {
		if (
			this.busy() ||
			!this.context.availableCommands.includes('workflow') ||
			!this.context.workflows.some((model) => model.name === this.selected)
		)
			return;
		this.busy.set(true);
		this.error.set('');
		try {
			await this.context.execute('workflow', this.selected);
			this.modal.hide();
		} catch {
			this.error.set(
				messageText(
					'workflowButton.startError',
					'The process could not be started. Check permissions and retry.',
				),
			);
		} finally {
			this.busy.set(false);
		}
	}
}
