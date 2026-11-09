import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import {
	DOCUMENT_LAYOUT_HOST,
	SchemaLayoutComponent,
	type DocumentLayoutContext,
} from '@maretha/webui-sdk';
import { CONTRACT_LAYOUT } from './contract.fields';

@Component({
	selector: 'acme-contract-metadata-layout',
	imports: [SchemaLayoutComponent],
	template: `<nx-schema-layout [layout]="layout" [documentId]="documentId()" mode="metadata" />
		@if (host) {
			<button type="button" class="btn btn-secondary" (click)="host.cancel()">Close</button>
		}`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractMetadataLayoutComponent {
	/** Dialog hosts assign inputs directly, so this stays a decorator input. */
	@Input() layoutContext: DocumentLayoutContext | undefined;
	/** Present when a dialog hosts this layout; inline hosts provide none. */
	readonly host = inject(DOCUMENT_LAYOUT_HOST, { optional: true });
	readonly layout = CONTRACT_LAYOUT;

	documentId(): string {
		return String(this.layoutContext?.document?.['uid'] ?? '');
	}
}
