import { ElementRef } from '@angular/core';
import { AddToCollectionDialogComponent } from '../../collections/add-to-collection-dialog.component';
import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { DocumentCollectionsService } from '../../../helpers/document-collections.service';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
	signal,
	Injector,
	PendingTasks,
	DestroyRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { NgComponentOutlet } from '@angular/common';
import { DocumentActionContext, WebUiIconComponent, WebUiMessages } from '@maretha/webui-sdk';
import { firstValueFrom, take } from 'rxjs';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { DocumentTrashService } from '../../../helpers/document-trash.service';
import { DocumentAttachmentsService } from '../../../helpers/document-attachments.service';
import { DocumentClipboardService } from '../../../helpers/document-clipboard.service';
import { DocumentEditDialogComponent } from '../../editors/document-edit-dialog.component';
import { CollectionsComponent } from '../../collections/collections.component';
import {
	canRunDocumentCommand,
	DocumentCommand,
	DOCUMENT_COMMANDS,
} from './document-command-policy';
import { usesStandardDocumentHeader } from '../../../helpers/standard-document-surfaces';
import { documentUrl } from 'app/helpers/document-route';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

@Component({
	selector: 'nx-document-command',
	imports: [TooltipDirective, WebUiIconComponent, NgComponentOutlet, WebUiMessagePipe],
	template: `<button
			type="button"
			[tooltip]="label()"
			#actionTip="bs-tooltip"
			container="body"
			containerClass="document-action-tooltip"
			placement="bottom"
			triggers="mouseenter:mouseleave focus:blur"
			[delay]="250"
			(keydown.escape)="actionTip.hide()"
			(pointerdown)="actionTip.hide()"
			[attr.data-command]="command()"
			[attr.aria-label]="label()"
			[disabled]="busy() || !eligible()"
			(click)="activate()"
		>
			<nx-webui-icon [name]="icon()" /><span class="action-label">{{ label() }}</span>
		</button>
		@if (confirmation() === context().document?.['uid']) {
			<div class="action-panel" role="alert">
				<p>
					{{
						'app.modules.document-command.permanently-delete-this-document-this-cann-714721'
							| webuiMessage: 'Permanently delete this document? This cannot be undone.'
					}}
				</p>
				<button type="button" [disabled]="busy()" (click)="execute()">
					{{
						'app.modules.document-command.delete-permanently-9aa5b1'
							| webuiMessage: 'Delete permanently'
					}}</button
				><button type="button" [disabled]="busy()" (click)="confirmation.set(null)">
					{{ 'app.modules.document-command.cancel-898478' | webuiMessage: 'Cancel' }}
				</button>
			</div>
		}
		@if (collectionInjector()) {
			<section
				class="action-panel"
				[attr.aria-label]="
					'app.modules.document-command.add-to-collection-056bb3'
						| webuiMessage: 'Add to collection'
				"
			>
				<button type="button" (click)="collectionInjector.set(null)">
					{{ 'app.modules.document-command.close-dab41f' | webuiMessage: 'Close' }}</button
				><ng-container
					[ngComponentOutlet]="collectionComponent"
					[ngComponentOutletInjector]="collectionInjector()!"
				/>
			</section>
		}
		@if (error()) {
			<p role="alert">{{ error() }}</p>
		}`,
	styles: `
		:host {
			display: inline-block;
			position: relative;
		}
		button {
			display: inline-flex;
			align-items: center;
			padding: 8px;
			border: 0;
			color: inherit;
			background: transparent;
		}
		button:hover,
		button:focus-visible {
			background: var(--nuxeo-box);
			outline: 1px solid currentColor;
		}
		.action-panel {
			position: absolute;
			z-index: 20;
			inset-inline-end: 0;
			min-width: 280px;
			max-width: 90vw;
			padding: 16px;
			background: var(--nuxeo-background, #fff);
			border: 1px solid var(--nuxeo-border, #ddd);
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentCommandComponent {
	readonly context = input.required<DocumentActionContext>();
	readonly command = input.required<DocumentCommand>();
	readonly definition = computed(
		() => DOCUMENT_COMMANDS.find((item) => item.id === this.command())!,
	);
	private readonly messages = inject(WebUiMessages);
	readonly label = computed(() => {
		const doc = this.context().document as any;
		if (this.command() === 'favorite' && doc?.contextParameters?.favorites?.isFavorite)
			return this.messages.text('favoritesToggleButton.tooltip.remove', 'Remove from favorites');
		if (this.command() === 'notifications' && doc?.ng?.canNotify)
			return this.messages.text(
				'notificationsToggleButton.tooltip.doNotNotify',
				'Unsubscribe from notifications',
			);
		if (this.command() === 'restore')
			return this.messages.text('documentTrashAction.untrash', 'Untrash document');
		if (this.command() === 'purge')
			return this.messages.text('documentTrashAction.delete', 'Delete document permanently');
		if (this.command() === 'lock' && doc?.lockOwner)
			return this.messages.text('lockToggleButton.tooltip.unlock', 'Unlock document');
		return this.messages.text(this.definition().key, this.definition().label);
	});
	readonly icon = computed(() =>
		this.command() === 'lock' && this.context().document?.['lockOwner']
			? 'nuxeo:lock'
			: this.definition().icon,
	);
	readonly eligible = computed(() => this.canExecute(this.context()));
	readonly busy = signal(false);
	readonly confirmation = signal<unknown>(null);
	readonly error = localizedText('');
	readonly collectionInjector = signal<Injector | null>(null);
	readonly collectionComponent = CollectionsComponent;
	private editorDialog?: BsModalRef<DocumentEditDialogComponent>;
	private readonly trash = inject(DocumentTrashService);
	private readonly attachments = inject(DocumentAttachmentsService);
	private readonly collections = inject(DocumentCollectionsService);
	private readonly clipboard = inject(DocumentClipboardService);
	private readonly modal = inject(BsModalService);
	private readonly confirmDialog = inject(ConfirmDialogService);
	private readonly element = inject(ElementRef<HTMLElement>);
	private readonly tasks = inject(PendingTasks);
	private readonly manager = inject(DocumentsManagerService);
	private readonly router = inject(Router);
	private readonly destroyRef = inject(DestroyRef);
	/** Stock shows Unlock to every eligible holder; the server rejects a foreign unlock (403). */
	private canExecute(context: DocumentActionContext): boolean {
		return canRunDocumentCommand(context, this.command());
	}
	constructor() {
		effect(() => {
			// Reset transient action state when the selected document/context changes.
			this.context();
			this.confirmation.set(null);
			this.collectionInjector.set(null);
			this.error.set('');
		});
	}
	activate(): void {
		if (!this.eligible() || this.busy()) return;
		if (this.command() === 'purge') this.confirmation.set(this.context().document?.['uid']);
		else if (this.command() === 'trash')
			this.tasks.run(async () => {
				const uid = this.context().document?.['uid'];
				const confirmed = await this.confirmDialog.confirm({
					titleKey: 'documentTrashAction.tooltip',
					title: 'Move to trash',
					messageKey: 'trash.confirmDocument',
					message: 'Move this document to the trash?',
					confirmKey: 'documentTrashAction.tooltip',
					confirm: 'Move to trash',
					destructive: true,
				});
				if (confirmed && this.context().document?.['uid'] === uid) await this.execute();
			});
		else this.tasks.run(() => this.execute());
	}
	async execute(): Promise<void> {
		if (!this.eligible() || this.busy()) return;
		let document = this.context().document as any;
		const command = this.command();
		const repository =
			this.context().standardHeaderActions && usesStandardDocumentHeader(document)
				? ((document.repository ?? 'default') as string)
				: undefined;
		if (command === 'purge' && this.confirmation() !== document.uid) return;
		this.busy.set(true);
		this.error.set('');
		try {
			if (['favorite', 'notifications', 'lock', 'download'].includes(command)) {
				const uid = document.uid;
				const repository = document.repository ?? 'default';
				document = await firstValueFrom(
					this.context().standardHeaderActions
						? this.manager.getDocumentInfo(uid, repository)
						: this.manager.getDocumentInfo(uid),
				);
				if (
					this.destroyRef.destroyed ||
					this.context().document?.['uid'] !== uid ||
					(this.context().standardHeaderActions &&
						(this.context().document?.['repository'] ?? 'default') !== repository) ||
					!this.canExecute({ ...this.context(), document })
				)
					return;
			}
			switch (command) {
				case 'favorite':
					await firstValueFrom(
						repository === undefined
							? this.collections.toggleFavoriteDocument(
									[document.uid],
									!document.contextParameters?.favorites?.isFavorite,
								)
							: this.collections.toggleFavoriteDocument(
									[document.uid],
									!document.contextParameters?.favorites?.isFavorite,
									repository,
								),
					);
					await this.refreshAfterCommand(document, repository);
					break;
				case 'notifications':
					await firstValueFrom(
						repository === undefined
							? this.manager.toggleNotification(document)
							: this.manager.toggleNotification(document, repository),
					);
					await this.refreshAfterCommand(document, repository);
					break;
				case 'lock':
					await firstValueFrom(
						repository === undefined
							? this.manager.toggleLock(document)!
							: this.manager.toggleLock(document, repository)!,
					);
					await this.refreshAfterCommand(document, repository);
					break;
				case 'download': {
					const blob = document.properties['file:content'];
					await firstValueFrom(this.attachments.downloadDocumentBlob(document, blob));
					break;
				}
				case 'publish': {
					const publicationRoute = this.router.parseUrl(documentUrl(document));
					publicationRoute.queryParams = { ...publicationRoute.queryParams, view: 'publication' };
					await this.router.navigateByUrl(publicationRoute);
					break;
				}
				case 'edit': {
					if (this.editorDialog) break;
					const ref: BsModalRef<DocumentEditDialogComponent> = this.modal.show(
						DocumentEditDialogComponent,
						{
							class: 'modal-dialog-centered nx-document-edit-dialog',
							ignoreBackdropClick: false,
							keyboard: true,
							ariaLabelledBy: 'document-edit-dialog-title',
							closeInterceptor: () => ref.content?.interceptClose() ?? Promise.resolve(),
							initialState: {
								documentType: document.type,
								data: { add: false, documents: [structuredClone(document)] },
							},
						},
					);
					this.editorDialog = ref;
					ref.onHidden?.pipe(take(1)).subscribe(() => {
						if (this.editorDialog === ref) this.editorDialog = undefined;
					});
					this.element.nativeElement.dispatchEvent(
						new CustomEvent('document-action-opened', {
							bubbles: true,
							detail: { onHidden: ref.onHidden },
						}),
					);
					return;
				}
				case 'clipboard':
					this.clipboard.addToClipboard([document]);
					break;
				case 'collect': {
					const ref = this.modal.show(AddToCollectionDialogComponent, {
						class: 'modal-dialog-centered',
						ignoreBackdropClick: true,
						initialState: { documents: [document] },
						keyboard: false,
					});
					this.element.nativeElement.dispatchEvent(
						new CustomEvent('document-action-opened', {
							bubbles: true,
							detail: { onHidden: ref.onHidden },
						}),
					);
					break;
				}
				case 'remove-collection':
					await firstValueFrom(
						this.collections.removeFromCollection(
							[document.uid],
							String(this.context().collection!['uid']),
						),
					);
					break;
				case 'pdf':
					await firstValueFrom(this.attachments.exportAsPdf([document]));
					break;
				case 'xml':
					await firstValueFrom(this.attachments.exportAsXml([document]));
					break;
				case 'zip':
					await firstValueFrom(this.attachments.exportAsZip([document]));
					break;
				case 'trash':
					await firstValueFrom(
						this.trash.moveDocumentsToTrash([document.uid], document.repository ?? 'default'),
					);
					break;
				case 'restore':
					await firstValueFrom(this.trash.restoreDocumentsFromTrash([document.uid]));
					if (!this.sameDocument(document, this.context().document)) return;
					if (this.context().refreshDocument) this.context().refreshDocument!();
					else await firstValueFrom(this.manager.reloadDocument(document.uid));
					break;
				case 'purge':
					await firstValueFrom(this.trash.purgeDocuments([document.uid]));
					break;
			}
			this.confirmation.set(null);
			this.element.nativeElement.dispatchEvent(
				new CustomEvent('document-action-complete', { bubbles: true }),
			);
		} catch {
			this.error.set(
				messageText(
					'app.state.the-action-failed-check-permissions-and-retry-5e8cad',
					'The action failed. Check permissions and retry.',
				),
			);
		} finally {
			this.busy.set(false);
		}
	}
	private async refreshAfterCommand(document: any, repository?: string): Promise<void> {
		if (
			repository !== undefined &&
			(this.destroyRef.destroyed ||
				this.context().document?.['uid'] !== document.uid ||
				(this.context().document?.['repository'] ?? 'default') !== repository)
		)
			return;
		await firstValueFrom(
			repository === undefined
				? this.manager.reloadDocument(document.uid)
				: this.manager.reloadDocument(document.uid, repository),
		);
	}
	private sameDocument(left: any, right: unknown): boolean {
		const current = right as any;
		return left?.uid === current?.uid && left?.repository === current?.repository;
	}
}
