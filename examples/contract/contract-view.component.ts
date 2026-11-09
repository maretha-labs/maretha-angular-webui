import { ChangeDetectionStrategy, Component, input, viewChild } from '@angular/core';
import {
	DocumentLayout,
	DocumentViewContext,
	GuardedView,
	SchemaLayoutComponent,
} from '@maretha/webui-sdk';

export const CONTRACT_LAYOUT: DocumentLayout = {
	id: 'client.contract.edit',
	documentType: 'Contract',
	fields: [
		{ property: 'dc:title', label: 'Title', required: true, maxLength: 200 },
		{ property: 'contract:counterparty', label: 'Counterparty', required: true, maxLength: 200 },
		{ property: 'contract:amount', label: 'Amount', required: true, min: 0 },
		{ property: 'contract:effectiveDate', label: 'Effective date', required: true },
		{ property: 'contract:active', label: 'Active' },
		{ property: 'dc:description', label: 'Description', maxLength: 4000 },
	],
};
@Component({
	selector: 'nx-contract-view',
	imports: [SchemaLayoutComponent],
	template:
		'<nx-schema-layout [layout]="layout" [documentId]="documentId()" [noEdit]="context().noEdit" mode="edit" (saved)="context().refreshDocument?.()" />',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractViewComponent implements GuardedView {
	readonly context = input.required<DocumentViewContext>();
	readonly layout = CONTRACT_LAYOUT;
	readonly editor = viewChild(SchemaLayoutComponent);
	documentId(): string {
		return String(this.context().document?.['uid'] ?? '');
	}
	canDeactivate(): boolean | Promise<boolean> {
		return this.editor()?.canDeactivate() ?? true;
	}
	hasPendingChanges(): boolean {
		return this.editor()?.hasPendingChanges() ?? false;
	}
}
