import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { DocumentActionContext, WebUiIconComponent } from '@maretha/webui-sdk';
import { LayoutService } from '../../../helpers/layout.service';
import { DestinationCreateDialogComponent } from 'app/components/quick-search/destination-create-dialog.component';
import { hasPermission } from 'app/helpers/document-permissions';
@Component({
	selector: 'nx-document-create-action',
	imports: [WebUiIconComponent, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `@if (layout.createButtonPlacement() === 'document-actions') {
		<button
			type="button"
			class="document-create-button"
			(click)="open()"
			[attr.aria-label]="
				'app.modules.document-create-action.create-document-d81fdf'
					| webuiMessage: 'Create document'
			"
		>
			<nx-webui-icon name="nuxeo:add" /><span>{{
				'app.modules.document-create-action.create-9e51ba' | webuiMessage: 'Create'
			}}</span>
		</button>
	}`,
	styles: `
		:host {
			display: contents;
		}
		.document-create-button {
			display: inline-flex;
			align-items: center;
			gap: 7px;
			padding: 8px 12px;
			border: 0;
			border-radius: 4px;
			background: var(--nuxeo-primary-color);
			color: white;
			font-size: 13px;
		}
		nx-webui-icon {
			width: 20px;
			height: 20px;
		}
	`,
})
export class DocumentCreateActionComponent {
	readonly context = input.required<DocumentActionContext>();
	readonly layout = inject(LayoutService);
	private readonly modal = inject(BsModalService);
	open(): void {
		const document = this.context().document as any;
		if (this.context().noEdit || !hasPermission(document, 'AddChildren')) return;
		this.modal.show(DestinationCreateDialogComponent, {
			class: 'modal-lg',
			ignoreBackdropClick: true,
			keyboard: false,
			initialState: { initialPath: document.path, initialView: 'create' },
		});
	}
}
