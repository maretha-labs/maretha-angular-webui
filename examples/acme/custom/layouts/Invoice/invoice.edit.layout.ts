import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import {
	DOCUMENT_LAYOUT_HOST,
	SchemaLayoutComponent,
	type DocumentLayoutContext,
} from '@maretha/webui-sdk';
import { INVOICE_LAYOUT } from './invoice.fields';

@Component({
	selector: 'acme-invoice-edit-layout',
	imports: [SchemaLayoutComponent],
	template: `<div class="modal-header"><h2 class="modal-title h5">Edit Invoice</h2></div>
		<div class="modal-body">
			<nx-schema-layout
				[layout]="layout"
				[documentId]="documentId()"
				[noEdit]="!!layoutContext?.noEdit"
				mode="edit"
				(saved)="host?.complete([$event])"
			/>
		</div>
		<div class="modal-footer">
			<button type="button" class="btn btn-secondary" (click)="host?.cancel()">Cancel</button>
		</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceEditLayoutComponent {
	/** Dialog hosts assign inputs directly, so this stays a decorator input. */
	@Input() layoutContext: DocumentLayoutContext | undefined;
	/** Present when a dialog hosts this layout; inline hosts provide none. */
	readonly host = inject(DOCUMENT_LAYOUT_HOST, { optional: true });
	readonly layout = INVOICE_LAYOUT;

	documentId(): string {
		return String(this.layoutContext?.document?.['uid'] ?? '');
	}
}
