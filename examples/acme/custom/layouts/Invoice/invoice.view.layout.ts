import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import {
	DOCUMENT_LAYOUT_HOST,
	SchemaLayoutComponent,
	type DocumentLayoutContext,
} from '@maretha/webui-sdk';
import { INVOICE_LAYOUT } from './invoice.fields';

@Component({
	selector: 'acme-invoice-view-layout',
	imports: [SchemaLayoutComponent],
	template: `<nx-schema-layout [layout]="layout" [documentId]="documentId()" mode="view" />`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceViewLayoutComponent {
	/** Dialog hosts assign inputs directly, so this stays a decorator input. */
	@Input() layoutContext: DocumentLayoutContext | undefined;
	/** Present when a dialog hosts this layout; inline hosts provide none. */
	readonly host = inject(DOCUMENT_LAYOUT_HOST, { optional: true });
	readonly layout = INVOICE_LAYOUT;

	documentId(): string {
		return String(this.layoutContext?.document?.['uid'] ?? '');
	}
}
