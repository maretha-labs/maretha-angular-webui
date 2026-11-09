import { WebUiMessages, WebUiMessagePipe } from '@maretha/webui-sdk';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ResultsSelectionContext, WebUiIconComponent } from '@maretha/webui-sdk';
import { firstValueFrom } from 'rxjs';
import { DocumentTrashService } from '../../helpers/document-trash.service';
import { hasPermission } from 'app/helpers/document-permissions';

export function canChangeTrash(
	context: ResultsSelectionContext,
	action: 'restore' | 'purge',
): boolean {
	return (
		!context.noEdit &&
		!!context.selectedDocuments.length &&
		context.selectedDocuments.every((document) => {
			return (
				document['isTrashed'] === true &&
				hasPermission(document, action === 'restore' ? 'Write' : 'Remove') &&
				!document['isRecord'] &&
				!document['hasLegalHold'] &&
				!document['retainUntil']
			);
		})
	);
}
@Component({
	selector: 'nx-trash-selection-action',
	imports: [WebUiIconComponent, TooltipDirective, WebUiMessagePipe],
	template: `<button
			type="button"
			class="selection-icon-action"
			[tooltip]="
				action() === 'restore'
					? ('versions.restore' | webuiMessage: 'Restore')
					: ('app.modules.trash-selection-action.delete-permanently-7645e2'
						| webuiMessage: 'Delete permanently')
			"
			[attr.aria-label]="
				action() === 'restore'
					? ('versions.restore' | webuiMessage: 'Restore')
					: ('app.modules.trash-selection-action.delete-permanently-7645e2'
						| webuiMessage: 'Delete permanently')
			"
			#actionTip="bs-tooltip"
			container="body"
			containerClass="document-action-tooltip"
			placement="bottom"
			[adaptivePosition]="true"
			boundariesElement="viewport"
			triggers="mouseenter:mouseleave focus:blur"
			[delay]="250"
			(keydown.escape)="actionTip.hide()"
			(pointerdown)="actionTip.hide()"
			[disabled]="context().busy || !eligible()"
			(click)="activate()"
		>
			<nx-webui-icon
				[name]="action() === 'restore' ? 'nuxeo:restore-deleted' : 'nuxeo:delete-permanently'"
			/>
		</button>
		@if (confirmation()) {
			<div role="alert">
				<!-- Keep quoted ICU braces intact: Prettier misreads them as Angular interpolation endings. -->
				<!-- prettier-ignore -->
				<p>
					{{ 'trash.deleteConfirm' | webuiMessage:'{count, plural, one {Permanently delete # selected document? This cannot be undone.} other {Permanently delete # selected documents? This cannot be undone.}}': {count: (confirmation()!.length)} }}
				</p>
				<button type="button" [disabled]="context().busy" (click)="execute()">
					{{
						'app.modules.trash-selection-action.delete-permanently-7645e2'
							| webuiMessage: 'Delete permanently'
					}}</button
				><button type="button" [disabled]="context().busy" (click)="confirmation.set(null)">
					{{ 'app.modules.trash-selection-action.cancel-5b4eb8' | webuiMessage: 'Cancel' }}
				</button>
			</div>
		}`,
	styles:
		':host { display:block; } button { display:inline-flex; align-items:center; gap:8px; padding:8px 12px; }',
	styleUrls: ['../document-toolbar/selection-icon-action.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrashSelectionActionComponent {
	readonly context = input.required<ResultsSelectionContext>();
	readonly action = input.required<'restore' | 'purge'>();
	readonly eligible = computed(() => canChangeTrash(this.context(), this.action()));
	readonly confirmation = signal<string[] | null>(null);
	private readonly messages = inject(WebUiMessages);
	private readonly trash = inject(DocumentTrashService);
	activate(): void {
		if (!this.eligible() || this.context().busy) return;
		if (this.action() === 'purge')
			this.confirmation.set(
				this.context().selectedDocuments.map((document) => String(document['uid'])),
			);
		else void this.execute();
	}
	async execute(): Promise<void> {
		const context = this.context();
		if (!this.eligible() || context.busy) return;
		const repository = String(context.document?.['repository'] ?? 'default');
		if (
			context.selectedDocuments.some((doc) => doc['repository'] && doc['repository'] !== repository)
		) {
			if (context.reportMessage)
				context.reportMessage(
					'selection.repository',
					'The selected documents must belong to the current repository.',
				);
			else
				context.reportError(
					this.messages.text(
						'selection.repository',
						'The selected documents must belong to the current repository.',
					),
				);
			return;
		}
		const ids = context.selectedDocuments.map((document) => String(document['uid']));
		if (
			this.action() === 'purge' &&
			(!this.confirmation() || JSON.stringify(this.confirmation()) !== JSON.stringify(ids))
		) {
			this.confirmation.set(null);
			return;
		}
		context.setBusy(true);
		try {
			await firstValueFrom(
				this.action() === 'restore'
					? this.trash.restoreDocumentsFromTrash(ids, repository)
					: this.trash.purgeDocuments(ids, repository),
			);
			this.confirmation.set(null);
			await context.refresh(ids);
			if (
				this.action() === 'restore' &&
				ids.includes(String(context.document?.['uid'])) &&
				this.sameDocument(context.document, this.context().document)
			)
				this.context().refreshDocument?.();
		} catch {
			if (context.reportMessage)
				context.reportMessage(
					'trash.actionFailed',
					'The trash action failed. Check permissions and retry.',
				);
			else
				context.reportError(
					this.messages.text(
						'trash.actionFailed',
						'The trash action failed. Check permissions and retry.',
					),
				);
		} finally {
			context.setBusy(false);
		}
	}
	private sameDocument(left: unknown, right: unknown): boolean {
		const first = left as Record<string, unknown> | null;
		const second = right as Record<string, unknown> | null;
		return first?.['uid'] === second?.['uid'] && first?.['repository'] === second?.['repository'];
	}
}
