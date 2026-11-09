import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import {
	DOCUMENT_LAYOUT_HOST,
	SchemaLayoutComponent,
	type DocumentLayoutContext,
} from '@maretha/webui-sdk';
import { CONTRACT_LAYOUT } from './contract.fields';

@Component({
	selector: 'acme-contract-create-layout',
	imports: [SchemaLayoutComponent],
	template: `<div class="modal-header"><h2 class="modal-title h5">New Contract</h2></div>
		<div class="modal-body">
			<nx-schema-layout
				[layout]="layout"
				[parentId]="parentId()"
				[name]="name"
				mode="create"
				(valueChanged)="rename($event)"
				(saved)="host?.complete([$event])"
			/>
		</div>
		<div class="modal-footer">
			<button type="button" class="btn btn-secondary" (click)="host?.cancel()">Cancel</button>
		</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractCreateLayoutComponent {
	/** Dialog hosts assign inputs directly, so this stays a decorator input. */
	@Input() layoutContext: DocumentLayoutContext | undefined;
	/** Present when a dialog hosts this layout; inline hosts provide none. */
	readonly host = inject(DOCUMENT_LAYOUT_HOST, { optional: true });
	readonly layout = CONTRACT_LAYOUT;

	name = '';

	parentId(): string {
		return String(this.layoutContext?.parentDocument?.['uid'] ?? '');
	}

	/** Nuxeo needs a document name; derive it from the title like the core editors do. */
	rename(values: Readonly<Record<string, unknown>>): void {
		this.name = String(values['dc:title'] ?? '')
			.replace(/[/\\]/g, '-')
			.trim();
	}
}
