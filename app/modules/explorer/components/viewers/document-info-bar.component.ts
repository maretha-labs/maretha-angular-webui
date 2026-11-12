import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
	DocumentInfoBarContext,
	WebUiDatePipe,
	WebUiIconComponent,
	WebUiMessagePipe,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { hasPermission } from 'app/extensions/document-permissions';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { ToastService } from 'app/helpers/toast.service';
import { firstValueFrom } from 'rxjs';
import { DocumentTrashService } from '../../helpers/document-trash.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { WorkflowInfoComponent } from '../workflows/workflow-info/workflow-info.component';

/** Stock FiltersBehavior.isRetentionDateIndeterminate. */
const INDETERMINATE_RETENTION = Date.parse('9999-01-01T00:00:00.000+00:00');

// Stock nuxeo-document-info-bar record (#retentionInfoBar) and trash (#trashedInfoBar) bars.
@Component({
	selector: 'nx-document-info-notice',
	imports: [
		WebUiIconComponent,
		WebUiMessagePipe,
		WebUiDatePipe,
		TooltipDirective,
		WorkflowInfoComponent,
	],
	template: `@switch (kind()) {
		@case ('retention') {
			<div id="retentionInfoBar" class="bar record">
				<div class="item">
					@if (document().hasLegalHold) {
						<nx-webui-icon class="icon" name="nuxeo:hold" />
						<span id="legalHold">{{
							'documentPage.legalHold' | webuiMessage: 'The document is under legal hold'
						}}</span>
					}
					@if (document().retainUntil) {
						<nx-webui-icon class="icon" name="nuxeo:retain" />
						@if (indeterminate()) {
							<span id="indeterminateRetention" [hidden]="document().hasLegalHold">{{
								'documentPage.retainIndeterminate'
									| webuiMessage: 'The document is under indeterminate retention'
							}}</span>
						} @else {
							<span id="retention" [hidden]="document().hasLegalHold">{{
								'documentPage.retainUntil'
									| webuiMessage
										: 'The document is under retention until {0}'
										: (document().retainUntil | webuiDate: 'MMMM d, y h:mm a')
							}}</span>
						}
					}
				</div>
			</div>
		}
		@case ('trash') {
			<div id="trashedInfoBar" class="bar trashed">
				<div class="item">
					<nx-webui-icon class="icon" name="icons:info" />
					<span>{{
						'documentPage.trash.info' | webuiMessage: 'You are viewing a trashed document.'
					}}</span>
				</div>
				@if (!canWrite()) {
					<div>
						{{
							'documentPage.trash.noPermissionToRestore'
								| webuiMessage: 'To restore, please contact your admin.'
						}}
					</div>
				} @else if (!context().noEdit) {
					<button
						type="button"
						class="action"
						[tooltip]="'untrashButton.tooltip' | webuiMessage: 'Untrash document'"
						container="body"
						containerClass="document-action-tooltip"
						placement="bottom"
						triggers="mouseenter:mouseleave focus:blur"
						[delay]="250"
						[attr.aria-label]="'untrashButton.tooltip' | webuiMessage: 'Untrash document'"
						[disabled]="busy()"
						(click)="untrash()"
					>
						<nx-webui-icon name="nuxeo:restore-deleted" />
					</button>
				}
				@if (canRemove() && !context().noEdit) {
					<button
						type="button"
						class="action"
						[tooltip]="
							'deleteButton.tooltip.permanently' | webuiMessage: 'Delete document permanently'
						"
						container="body"
						containerClass="document-action-tooltip"
						placement="bottom"
						triggers="mouseenter:mouseleave focus:blur"
						[delay]="250"
						[attr.aria-label]="
							'deleteButton.tooltip.permanently' | webuiMessage: 'Delete document permanently'
						"
						[disabled]="busy()"
						(click)="deleteForever()"
					>
						<nx-webui-icon name="nuxeo:delete-permanently" />
					</button>
				}
			</div>
		}
		@case ('workflow') {
			<nx-workflow-info [document]="document()" />
		}
	}`,
	styles: `
		:host {
			display: block;
			font-size: 13px;
			line-height: 20px;
			letter-spacing: 0.16px;
		}
		.bar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 8px;
			margin-bottom: 16px;
			box-shadow: 0 3px 5px rgba(0, 0, 0, 0.04);
			background-color: var(--nuxeo-box);
			color: var(--nuxeo-text-default);
		}
		.bar.record {
			background: black;
			color: white;
		}
		.item {
			display: flex;
			flex: 1;
			flex-basis: 0.000000001px;
			align-items: center;
			min-width: 0;
		}
		.icon {
			width: 1.5em;
			height: 24px;
			margin: 0 0.5em;
		}
		.action {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			box-sizing: border-box;
			width: 40px;
			height: 40px;
			padding: 8px;
			border: 0;
			color: inherit;
			background: transparent;
			cursor: pointer;
		}
		.action nx-webui-icon {
			width: 24px;
			height: 24px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentInfoBarComponent {
	readonly context = input.required<DocumentInfoBarContext>();
	readonly kind = input.required<'retention' | 'trash' | 'workflow'>();
	readonly document = computed<any>(() => this.context().document);
	readonly indeterminate = computed(
		() => Date.parse(this.document()?.retainUntil) === INDETERMINATE_RETENTION,
	);
	readonly canWrite = computed(() => hasPermission(this.document(), 'Write'));
	readonly canRemove = computed(
		() => !this.document()?.isVersion && hasPermission(this.document(), 'Remove'),
	);
	readonly busy = signal(false);
	private readonly trash = inject(DocumentTrashService);
	private readonly manager = inject(DocumentsManagerService);
	private readonly messages = inject(WebUiMessages);
	private readonly toastr = inject(ToastService);

	/** Stock nuxeo-untrash-document-button, then the app reloads the document. */
	async untrash(): Promise<void> {
		const document = this.document();
		if (this.busy() || !document?.uid) return;
		this.busy.set(true);
		try {
			await firstValueFrom(
				this.trash.restoreDocumentsFromTrash([document.uid], document.repository ?? 'default'),
			);
			if (this.document()?.uid !== document.uid) return;
			const refresh = this.context().refreshDocument;
			if (refresh) refresh();
			else await firstValueFrom(this.manager.reloadDocument(document.uid));
		} catch {
			this.toastr.error(
				this.messages.text('app.document.untrashed.error', 'Error while restoring the document'),
			);
		} finally {
			this.busy.set(false);
		}
	}

	/** Stock nuxeo-delete-document-button hard: confirm, delete, then the app opens the parent. */
	async deleteForever(): Promise<void> {
		const document = this.document();
		if (this.busy() || !document?.uid) return;
		if (!window.confirm(this.messages.text('deleteButton.confirm', 'Delete the document?'))) return;
		this.busy.set(true);
		try {
			await firstValueFrom(
				this.trash.purgeDocuments([document.uid], document.repository ?? 'default'),
			);
		} catch {
			this.toastr.error(
				this.messages.text('app.document.deleted.error', 'Error deleting document.'),
			);
		} finally {
			this.busy.set(false);
		}
	}
}
