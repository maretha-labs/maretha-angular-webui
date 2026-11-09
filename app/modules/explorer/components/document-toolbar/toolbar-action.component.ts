import { ElementRef } from '@angular/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { StartProcessDialogComponent } from './start-process-dialog.component';
import { AddToCollectionDialogComponent } from '../collections/add-to-collection-dialog.component';
import { LocalizedUiError } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	Injector,
	Type,
	input,
	signal,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { ResultsToolbarContext, WebUiIconComponent, WebUiMessages } from '@maretha/webui-sdk';
import { DisplaySettingsComponent } from '../display-settings/display-settings.component';
import { DocumentVersionsComponent } from '../document-snapshots/document-snapshots.component';
import { CollectionsComponent } from '../collections/collections.component';

@Component({
	selector: 'nx-toolbar-action',
	imports: [NgComponentOutlet, WebUiIconComponent, TooltipDirective, WebUiMessagePipe],
	template: `<button
			type="button"
			[class.selection-icon-action]="iconOnly()"
			[tooltip]="actionLabel()"
			[attr.aria-label]="actionLabel()"
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
			[attr.aria-expanded]="panelType() ? expanded() : null"
			(click)="activate()"
		>
			<nx-webui-icon [name]="icon()" />
			@if (!iconOnly()) {
				<span>{{ actionLabel() }}</span>
			}
		</button>
		@if (expanded()) {
			<section class="action-panel" [attr.aria-label]="actionLabel()">
				<button
					type="button"
					[attr.aria-label]="'app.modules.toolbar-action.close-d09c9d' | webuiMessage: 'Close'"
					(click)="expanded.set(false)"
				>
					×
				</button>
				@if (panelType(); as type) {
					<ng-container [ngComponentOutlet]="type" [ngComponentOutletInjector]="panelInjector()" />
				}
				@if (command() === 'workflow') {
					@for (workflow of context().workflows; track workflow.name) {
						<button type="button" [disabled]="context().busy" (click)="run(workflow.name)">
							{{ workflow.title }}
						</button>
					}
				}
			</section>
		}`,
	styles: `
		:host {
			position: relative;
			display: inline-flex;
		}
		button {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			border: 1px solid var(--nuxeo-border, #ddd);
			background: var(--nuxeo-box, #fff);
			color: var(--nuxeo-text-default, #333);
			padding: 8px;
			border-radius: 2px;
		}
		.action-panel {
			position: absolute;
			z-index: 1050;
			top: 100%;
			inset-inline-end: 0;
			width: min(420px, calc(100vw - 112px));
			max-height: 65vh;
			overflow: auto;
			background: var(--nuxeo-box, #fff);
			color: var(--nuxeo-text-default, #333);
			border: 1px solid var(--nuxeo-border, #ddd);
			padding: 12px;
			box-shadow: 0 4px 12px #0002;
		}
	`,
	styleUrls: ['./selection-icon-action.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolbarActionComponent {
	readonly context = input.required<ResultsToolbarContext>();
	readonly command = input.required<string>();
	readonly label = input.required<string>();
	readonly labelKey = input<string>();
	readonly icon = input('nuxeo:settings');
	readonly iconOnly = computed(() => !['versions', 'workflow'].includes(this.command()));
	readonly expanded = signal(false);
	readonly messages = inject(WebUiMessages);
	readonly actionLabel = computed(() =>
		this.command() === 'workflow'
			? this.messages.text('workflowButton.tooltip', 'Start Process')
			: this.messages.text(this.labelKey(), this.label()),
	);
	readonly eligible = computed(() => this.context().availableCommands.includes(this.command()));
	readonly panelType = computed<Type<unknown> | null>(() =>
		this.command() === 'display'
			? DisplaySettingsComponent
			: this.command() === 'versions'
				? DocumentVersionsComponent
				: this.command() === 'collect'
					? CollectionsComponent
					: null,
	);
	private readonly modal = inject(BsModalService);
	private readonly element = inject(ElementRef<HTMLElement>);
	private readonly injector = inject(Injector);
	readonly panelInjector = computed(() =>
		Injector.create({
			parent: this.injector,
			providers: [
				{ provide: 'document', useValue: this.context().document },
				{ provide: 'documents', useValue: this.context().selectedDocuments },
				{ provide: 'editMode', useValue: true },
				{ provide: 'collectionSelected', useValue: () => this.expanded.set(false) },
			],
		}),
	);
	constructor() {
		let previous = '';
		effect(() => {
			const c = this.context();
			const scope = JSON.stringify([c.document?.['uid'], c.selectedDocuments.map((d) => d['uid'])]);
			if (scope !== previous || !this.eligible()) this.expanded.set(false);
			previous = scope;
		});
	}
	activate(): void {
		if (!this.eligible() || this.context().busy) return;
		if (this.command() === 'workflow' || this.command() === 'collect') {
			let ref: BsModalRef;
			if (this.command() === 'workflow')
				ref = this.modal.show(StartProcessDialogComponent, {
					class: 'modal-dialog-centered',
					keyboard: true,
					ignoreBackdropClick: true,
					initialState: { context: this.context() },
				});
			else
				ref = this.modal.show(AddToCollectionDialogComponent, {
					class: 'modal-dialog-centered',
					keyboard: false,
					ignoreBackdropClick: true,
					initialState: { documents: [...this.context().selectedDocuments] },
				});
			this.element.nativeElement.dispatchEvent(
				new CustomEvent('document-action-opened', {
					bubbles: true,
					detail: { onHidden: ref.onHidden },
				}),
			);
			return;
		}
		if (this.panelType()) this.expanded.update((value) => !value);
		else void this.run();
	}
	async run(argument?: string): Promise<void> {
		if (!this.eligible() || this.context().busy) return;
		try {
			await this.context().execute(this.command(), argument);
			this.expanded.set(false);
		} catch (error) {
			const context = this.context();
			if (error instanceof LocalizedUiError && context.reportMessage)
				context.reportMessage(error.key, error.fallback, error.values);
			else if (error instanceof Error)
				context.reportError(
					error instanceof LocalizedUiError
						? this.messages.format(error.key, error.values, error.fallback)
						: error.message,
				);
			else if (context.reportMessage)
				context.reportMessage('action.failed', 'The action failed. Check permissions and retry.');
			else
				context.reportError(
					this.messages.text('action.failed', 'The action failed. Check permissions and retry.'),
				);
		}
	}
}
