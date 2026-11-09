import {
	ChangeDetectionStrategy,
	Component,
	Input,
	effect,
	inject,
	viewChild,
} from '@angular/core';
import {
	DOCUMENT_IMPORT_DRAFT,
	SchemaLayoutComponent,
	type DocumentLayoutContext,
} from '@maretha/webui-sdk';
import { INVOICE_LAYOUT } from './invoice.fields';

@Component({
	selector: 'acme-invoice-import-layout',
	imports: [SchemaLayoutComponent],
	template: `<nx-schema-layout
		[layout]="layout"
		[parentId]="parentId()"
		mode="import"
		[draftOnly]="true"
		[initialValues]="draft.properties"
		(valueChanged)="draft.update($event)"
	/>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceImportLayoutComponent {
	/** Dialog hosts assign inputs directly, so this stays a decorator input. */
	@Input() layoutContext: DocumentLayoutContext | undefined;
	/** One file of the import: the host uploads it and creates its document. */
	readonly draft = inject(DOCUMENT_IMPORT_DRAFT);
	readonly layout = INVOICE_LAYOUT;

	private readonly schema = viewChild(SchemaLayoutComponent);

	constructor() {
		// The host creates no documents until every mounted layout reports valid values.
		effect(() => {
			const schema = this.schema();
			if (schema?.ready()) this.draft.setValid(!schema.invalid());
		});
	}

	parentId(): string {
		return String(this.layoutContext?.parentDocument?.['uid'] ?? '');
	}
}
