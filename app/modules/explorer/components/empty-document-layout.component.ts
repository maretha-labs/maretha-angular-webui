import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	Input,
	OnDestroy,
	OnInit,
	inject,
} from '@angular/core';
import {
	ReactiveFormsModule,
	UntypedFormBuilder,
	UntypedFormGroup,
	Validators,
} from '@angular/forms';
import { DocumentLayoutContext } from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { BaseEditorComponent } from './editors/base-editor/base-editor.component';

/**
 * The upstream WorkspaceRoot create layout deliberately contains no fields.  It is
 * still hosted by Nuxeo's create dialog, which supplies its title, cancel and
 * submit controls.  This component is that host adapter: the body remains empty
 * while BaseEditor retains the normal create/cancel and dirty-scope lifecycle.
 */
@Component({
	selector: 'nx-empty-document-layout',
	standalone: true,
	imports: [WebUiMessagePipe, BaseEditorComponent, ReactiveFormsModule],
	template: `
		<nx-base-editor
			[announceSuccess]="true"
			[add]="add"
			[parentDocument]="parentDocument"
			[documentType]="documentType"
			[documents]="documents"
			[editorForm]="editorForm"
			[saveButtonLabel]="
				'app.modules.document-create-action.create-document-d81fdf'
					| webuiMessage: 'Create document'
			"
			[cancelButtonLabel]="
				'app.runtime.empty-document-layout.cancel-7e17e0' | webuiMessage: 'Cancel'
			"
			(close)="close()"
			(save)="saveChanges($event)"
		>
			<div modalTitle>
				{{
					'document.createType' | webuiMessage: 'Create a {type} document' : { type: documentType }
				}}
			</div>
			<form modalBody [formGroup]="editorForm" novalidate></form>
		</nx-base-editor>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyDocumentLayoutComponent implements OnInit, OnDestroy {
	@Input() layoutContext: DocumentLayoutContext | undefined;
	@Input() add = true;
	@Input() parentDocument: any;
	@Input() documentType: string | undefined;
	@Input() documents: any[] = [];
	readonly save$ = new Subject<any>();
	editorForm!: UntypedFormGroup;

	private readonly fb = inject(UntypedFormBuilder);
	private readonly modal = inject(BsModalRef);
	private readonly cdr = inject(ChangeDetectorRef);

	ngOnInit(): void {
		// Nuxeo's @emptyWithDefault resource supplies a title even though the
		// WorkspaceRoot create leaf has no field for it.  Keep an existing model
		// value when the host provides one, otherwise use the document type as the
		// stable server name required by the current create endpoint.
		const title =
			this.documents[0]?.properties?.['dc:title'] || this.documentType || 'WorkspaceRoot';
		if (!this.documents.length)
			this.documents = [
				{
					parentRef: this.parentDocument?.uid,
					type: this.documentType,
					title,
					properties: { 'dc:title': title },
					ng: {},
				},
			];
		this.editorForm = this.fb.group({ 'dc:title': [title, Validators.required] });
		// There is no source field for a user to touch.  Mark the generated default
		// as ready to submit so the standard BaseEditor create control stays usable.
		this.editorForm.get('dc:title')!.markAsDirty();
		this.cdr.markForCheck();
	}

	close(): void {
		this.modal.hide();
	}

	saveChanges(documents: any): void {
		this.save$.next(documents);
		this.modal.hide();
	}

	ngOnDestroy(): void {
		this.save$.complete();
	}
}
