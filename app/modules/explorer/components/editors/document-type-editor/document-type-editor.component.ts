import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { EditorMetadata, EditorSchema } from '../../../helpers/editor-metadata.service';
import { EditorMetadataStatusComponent } from '../editor-metadata-status.component';
import { BsModalRef } from 'ngx-bootstrap/modal';
import {
	ChangeDetectorRef,
	Component,
	ComponentRef,
	Input,
	OnDestroy,
	OnInit,
	OnChanges,
	SimpleChanges,
	ViewChild,
	ViewContainerRef,
	ChangeDetectionStrategy,
	DestroyRef,
	Injector,
	inject,
	reflectComponentType,
} from '@angular/core';
import {
	DOCUMENT_LAYOUT_HOST,
	WebUiMessages,
	DocumentLayoutRegistry,
	SuggestionScope,
	documentLayoutContext,
	type DocumentLayoutHost,
	type ResolvedDocumentLayout,
} from '@maretha/webui-sdk';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { DomainEditorComponent } from '../domain-editor/domain-editor.component';
import { GenericTypeBulkCreateComponent } from '../generic-type-bulk-create/generic-type-bulk-create.component';
import { GenericEditorComponent } from '../generic-editor/generic-editor.component';
import { BinaryEditorComponent } from '../binary-editor/binary-editor.component';
import { NoteEditorComponent } from '../note-editor/note-editor.component';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

@Component({
	selector: 'nx-document-type-editor',
	templateUrl: './document-type-editor.component.html',
	styleUrls: ['./document-type-editor.component.scss'],
	// The resolved layout's id scopes the suggestion fields of the editor it mounts.
	providers: [EditorMetadata, SuggestionScope],
	imports: [EditorMetadataStatusComponent, BinaryEditorComponent, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentTypeEditorComponent implements OnInit, OnChanges, OnDestroy {
	@Input() documentType: string | undefined;
	@Input() documentSchemas: EditorSchema[] | undefined;
	readonly metadata = inject(EditorMetadata);
	private readonly confirmDialog = inject(ConfirmDialogService);
	private readonly modal = inject(BsModalRef);
	private readonly messages = inject(WebUiMessages);
	@Input() data: any = {};
	componentRef: ComponentRef<any> | undefined;
	save$ = new Subject();

	useBinaryEditor = false;
	initialized = false;

	private readonly destroy = inject(DestroyRef);
	private readonly layouts = inject(DocumentLayoutRegistry);
	private readonly suggestionScope = inject(SuggestionScope);
	private readonly injector = inject(Injector);
	private container: ViewContainerRef | undefined;
	private binaryEditorWired = false;
	private metadataRequest = 0;
	private activeLayout: ResolvedDocumentLayout | undefined;
	layoutDisabled = false;
	private readonly layoutErrorText = localizedText();
	get layoutError(): string {
		return this.layoutErrorText();
	}
	set layoutError(value: string | MessageText) {
		this.layoutErrorText.set(value);
	}

	@ViewChild('container', { read: ViewContainerRef }) set containerRef(
		ref: ViewContainerRef | undefined,
	) {
		this.container = ref;

		if (ref && this.initialized && !this.useBinaryEditor && !this.componentRef)
			this.createEditorComponent();
	}

	@ViewChild(BinaryEditorComponent) set binaryEditorRef(ref: BinaryEditorComponent | undefined) {
		if (ref && !this.binaryEditorWired) {
			this.binaryEditorWired = true;
			ref.save$.pipe(takeUntilDestroyed(this.destroy)).subscribe((x: any) => this.save$.next(x));
		}
	}

	// --------------------------------------------------------------------------------------------------
	constructor(private readonly cdr: ChangeDetectorRef) {}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		this.save$
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe((saved) => this.data.onSave?.(saved));
		this.loadMetadata();
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (!changes['documentType'] && !changes['documentSchemas'] && !changes['data']) return;
		// Inputs can change while the asynchronous schema lookup is pending.  Cancel it even
		// before an editor has mounted so the old type cannot mount into the new modal scope.
		if (!this.initialized && !this.metadata.loading()) return;
		this.metadataRequest++;
		this.componentRef?.destroy();
		this.componentRef = undefined;
		this.binaryEditorWired = false;
		this.initialized = false;
		this.metadata.reset();
		this.loadMetadata();
	}

	loadMetadata(): void {
		const request = ++this.metadataRequest;
		this.metadata.load(this.documentType, this.documentSchemas, (schemas) => {
			// Modal inputs can switch while metadata is in flight; never mount a stale editor.
			if (request !== this.metadataRequest) return;
			this.documentSchemas = schemas;
			this.setup();
			this.cdr.markForCheck();
		});
	}

	closeLoading(): void {
		if (this.initialized) return;
		this.metadata.cancel();
		this.modal.hide();
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.componentRef?.destroy();
		this.save$.complete();
	}

	canDeactivate(): boolean | Promise<boolean> {
		const editor = this.componentRef?.instance;
		if (typeof editor?.canDeactivate === 'function') return editor.canDeactivate();
		return (
			!editor?.editorForm?.dirty ||
			this.confirmDialog.confirm({
				titleKey: 'dialog.unsavedChanges',
				title: 'Unsaved changes',
				messageKey: 'app.notices.discard-your-unsaved-changes-f117f1',
				message: 'Discard your unsaved changes?',
				confirmKey: 'action.discard',
				confirm: 'Discard',
				destructive: true,
			})
		);
	}
	hasPendingChanges(): boolean {
		const editor = this.componentRef?.instance;
		return (
			editor?.hasPendingChanges?.() === true ||
			editor?.editorForm?.dirty === true ||
			editor?.working === true
		);
	}

	// --------------------------------------------------------------------------------------------------
	private setup(): void {
		this.activeLayout = this.layouts.resolve(
			documentLayoutContext({
				documentType: this.documentType,
				mode: this.data.bulkAdd ? 'import' : this.data.add === false ? 'edit' : 'create',
				document: this.data.documents?.[0],
				parentDocument: this.data.parentDocument,
			}),
		);
		this.layoutDisabled = this.activeLayout?.disabled === true;
		this.suggestionScope.layout.set(this.activeLayout?.id ?? null);
		this.layoutError = '';
		if (
			this.activeLayout?.component &&
			!this.inputName(this.activeLayout.component, 'layoutContext')
		)
			this.layoutError = messageText(
				'app.state.the-custom-document-layout-must-declare-a-lay-f73b3d',
				'The custom document layout must declare a layoutContext input.',
			);
		const hasFileSchema = this.documentSchemas?.map((x) => x.name).includes('file') ?? false;
		this.useBinaryEditor =
			hasFileSchema && !this.data.bulkAdd && !this.activeLayout?.component && !this.layoutDisabled;

		this.initialized = true;
	}

	// --------------------------------------------------------------------------------------------------
	private createEditorComponent(): void {
		const context = documentLayoutContext({
			documentType: this.documentType,
			mode: this.data.bulkAdd ? 'import' : this.data.add === false ? 'edit' : 'create',
			document: this.data.documents?.[0],
			parentDocument: this.data.parentDocument,
		});
		if (this.layoutDisabled || this.layoutError) return;
		if (this.activeLayout?.component) {
			this.componentRef = this.container?.createComponent(this.activeLayout.component, {
				injector: this.layoutHostInjector(context.mode !== 'edit'),
			});
		} else
			switch (this.documentType?.toLocaleLowerCase()) {
				case 'domain':
					this.componentRef = this.container?.createComponent(DomainEditorComponent);
					break;
				case 'note':
					this.componentRef = this.container?.createComponent(NoteEditorComponent);
					break;
				default:
					this.componentRef = this.data.bulkAdd
						? this.container?.createComponent(GenericTypeBulkCreateComponent)
						: this.container?.createComponent(GenericEditorComponent);
			}

		if (!this.componentRef) return;

		this.setInputIfDeclared(this.componentRef, 'layoutContext', context);
		for (const key in this.data)
			if (Object.prototype.hasOwnProperty.call(this.data, key))
				this.setInputIfDeclared(this.componentRef, key, this.data[key]);

		this.setInputIfDeclared(this.componentRef, 'documentType', this.documentType);
		if (
			this.componentRef.instance instanceof GenericEditorComponent ||
			this.componentRef.instance instanceof NoteEditorComponent
		)
			this.setInputIfDeclared(this.componentRef, 'documentSchemas', this.documentSchemas);

		const componentRef = this.componentRef;
		if (componentRef.instance.save$)
			componentRef.instance.save$.pipe(takeUntilDestroyed(this.destroy)).subscribe((x: any) => {
				// A destroyed/replaced layout must never commit into the newly selected document.
				if (this.componentRef === componentRef) this.save$.next(x);
			});
	}

	/** Lets a custom layout finish this dialog through the SDK contract. */
	private layoutHostInjector(created: boolean): Injector {
		const request = this.metadataRequest;
		const host: DocumentLayoutHost = {
			complete: (documents) => {
				// A layout replaced by an input change must not close or report into the new scope.
				if (request !== this.metadataRequest) return;
				const manager = this.injector.get(DocumentsManagerService);
				for (const document of documents)
					manager.syncSavedDocument(document.uid, created).subscribe({ error: () => undefined });
				this.save$.next([...documents]);
				this.modal.hide();
			},
			cancel: () => {
				if (request === this.metadataRequest) this.modal.hide();
			},
		};
		return Injector.create({
			parent: this.injector,
			providers: [{ provide: DOCUMENT_LAYOUT_HOST, useValue: host }],
		});
	}

	private inputName(component: any, name: string): string | undefined {
		const input = reflectComponentType(component)?.inputs.find(
			(candidate) => candidate.templateName === name || candidate.propName === name,
		);
		return input?.templateName;
	}

	private setInputIfDeclared(ref: ComponentRef<any>, name: string, value: unknown): void {
		const publicName = this.inputName(ref.componentType, name);
		if (publicName) ref.setInput(publicName, value);
	}
}
