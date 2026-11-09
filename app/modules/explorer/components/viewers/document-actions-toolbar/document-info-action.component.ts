import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	isFallbackLayout,
	reportFallbackMetadataLayout,
} from '../../../helpers/fallback-document-layouts';
import { dialogLayoutHost } from '../../../helpers/dialog-layout-host';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { BsModalService } from 'ngx-bootstrap/modal';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import {
	DocumentActionContext,
	DocumentLayoutRegistry,
	documentLayoutContext,
	provideSuggestionScope,
} from '@maretha/webui-sdk';
import { DocumentInfoComponent } from '../../document-info/document-info.component';

@Component({
	selector: 'nx-document-info-action',
	imports: [FontAwesomeModule, TooltipDirective, WebUiMessagePipe],
	templateUrl: './document-info-action.component.html',
	styleUrls: ['./document-info-action.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentInfoActionComponent {
	readonly context = input.required<DocumentActionContext>();
	readonly infoIcon = faInfoCircle;
	readonly visible = computed(() => !!this.context().document?.['ng'] && !this.context().noEdit);
	private readonly modalService = inject(BsModalService);
	private readonly layouts = inject(DocumentLayoutRegistry);

	showDocumentInfo(): void {
		if (!this.visible()) return;

		const document = this.context().document;
		const context = documentLayoutContext({
			documentType: document?.['type'],
			mode: 'metadata',
			document,
		});
		const layout = this.layouts.resolve(context);
		if (layout?.disabled) return;
		if (isFallbackLayout(layout?.id)) reportFallbackMetadataLayout(document?.['type'], layout?.id);
		this.modalService.show(layout?.component ?? DocumentInfoComponent, {
			initialState: { document, layoutContext: context },
			class: 'modal-lg',
			providers: [dialogLayoutHost(false), provideSuggestionScope(layout?.id ?? null)],
		});
	}
}
