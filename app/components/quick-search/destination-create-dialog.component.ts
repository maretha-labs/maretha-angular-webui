import { BulkDocumentCreation } from 'app/modules/explorer/helpers/bulk-document-creation.service';
import { StagedImportUploads } from 'app/modules/explorer/helpers/staged-import-uploads';
import { BulkCreationResultsComponent } from 'app/modules/explorer/components/editors/bulk-creation-results/bulk-creation-results.component';
import { DocumentImportHostComponent } from 'app/modules/explorer/components/editors/document-import-host.component';
import { StandardContentImportComponent } from 'app/modules/explorer/components/editors/standard-content-import.component';
import { documentUrl } from 'app/helpers/document-route';
import { DOCUMENT_CREATION_WIZARD } from 'app/modules/explorer/helpers/document-creation-wizard';
import { NgComponentOutlet } from '@angular/common';
import { localizedMessage } from 'app/helpers/localized-message';
import {
	ChangeDetectionStrategy,
	afterNextRender,
	Injector,
	Component,
	computed,
	DestroyRef,
	ElementRef,
	inject,
	Input,
	OnInit,
	signal,
	viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { BsModalRef } from 'ngx-bootstrap/modal';
import {
	DocumentCreateContext,
	DocumentViewsComponent,
	ViewNavigation,
	WebUiIconComponent,
	WebUiMessagePipe,
} from '@maretha/webui-sdk';
import { firstValueFrom, Observable, Subscription } from 'rxjs';
import {
	CreationDestination,
	CreationParentService,
	allowsCreateType,
	canCreateIn,
} from 'app/modules/explorer/helpers/creation-parent.service';
import { DocumentTreeComponent } from 'app/modules/shared/components/document-tree/document-tree.component';
import { DocumentTypeEditorComponent } from 'app/modules/explorer/components/editors/document-type-editor/document-type-editor.component';

@Component({
	selector: 'nx-destination-create-dialog',
	providers: [BulkDocumentCreation, StagedImportUploads],
	host: {
		'(keydown.escape)': 'escape($event)',
		'(document:keydown.escape)': 'escapeFromDialog($event)',
	},
	imports: [
		FormsModule,
		BulkCreationResultsComponent,
		NgComponentOutlet,
		NgTemplateOutlet,
		DocumentTreeComponent,
		DocumentViewsComponent,
		WebUiIconComponent,
		WebUiMessagePipe,
	],
	template: `<ng-template #location>
			<form class="location" (ngSubmit)="choosePath(path)">
				<label for="creation-destination">{{
					'documentCreationForm.location' | webuiMessage: 'Location'
				}}</label>
				<div class="destination">
					<input
						id="creation-destination"
						name="destination"
						[(ngModel)]="path"
						(change)="choosePath(path)"
						[disabled]="busy() || loading()"
					/><button
						data-destination-browse
						type="button"
						[attr.aria-label]="
							'app.components.destination-create-dialog.browse-folders-7f63e0'
								| webuiMessage: 'Browse folders'
						"
						[disabled]="busy() || loading()"
						[attr.aria-expanded]="showTree()"
						(click)="showTree.set(!showTree())"
					>
						<nx-webui-icon name="nuxeo:browse" />
					</button>
				</div>
			</form>
			@if (showTree()) {
				<div class="folders">
					<nx-document-tree
						[showRoot]="true"
						[repository]="repository"
						[selectDocument]="chooseFolder"
						[selectedDocument]="context()?.document ?? null"
					/>
				</div>
			}
			@if (loading()) {
				<p role="status">
					{{
						'app.components.destination-create-dialog.loading-destination-7a6a46'
							| webuiMessage: 'Loading destination…'
					}}
				</p>
			}
			@if (uploads.failed() && !batch.started()) {
				<p role="alert">
					{{
						'app.services.attachments.upload-failed'
							| webuiMessage
								: 'The files could not be uploaded. Check your connection and permissions, then retry.'
					}}
				</p>
			}
			@if (error()) {
				<p role="alert">{{ error() }}</p>
				<button type="button" [disabled]="busy()" (click)="choosePath(path)">
					{{ 'app.components.destination-create-dialog.retry-996e88' | webuiMessage: 'Retry' }}
				</button>
			}
			@if (context()?.noEdit && selectedView() !== 'import') {
				<p role="status">
					{{
						'app.components.destination-create-dialog.you-cannot-create-documents-here-choose-a--f7a74b'
							| webuiMessage: 'You cannot create documents here. Choose a writable folder.'
					}}
				</p>
			}
		</ng-template>
		<div
			class="modal-body destination-picker"
			[class.editing-type]="selectedType() || editingImport()"
		>
			@if (context(); as context) {
				<nx-paired-views
					itemSlot="CREATE_POPUP_ITEMS"
					pageSlot="CREATE_POPUP_PAGES"
					[label]="
						'app.components.destination-create-dialog.create-content-91e6e2'
							| webuiMessage: 'Create content'
					"
					[context]="context"
					[selectedView]="selectedView()"
					(selectedViewChange)="switchView($event)"
				>
					<div paired-views-header class="location-holder">
						<ng-container *ngTemplateOutlet="location" />
					</div>
				</nx-paired-views>
			} @else {
				<div class="location-holder"><ng-container *ngTemplateOutlet="location" /></div>
			}
			@if (selectedType(); as type) {
				<ng-container
					*ngComponentOutlet="typeEditor; inputs: editorInputs; injector: editorInjector"
				/>
			}
			@if (editingImport()) {
				<ng-container *ngComponentOutlet="importHost; inputs: importInputs" />
			}
			<nx-bulk-creation-results [batch]="batch" />
			<input #files type="file" multiple hidden (change)="importSelection(files)" />
		</div>
		<div class="modal-footer" [hidden]="!!selectedType() || editingImport()">
			<button type="button" class="btn btn-outline-secondary" [disabled]="busy()" (click)="close()">
				{{
					batch.complete()
						? ('command.done' | webuiMessage: 'Done')
						: ('command.cancel' | webuiMessage: 'Cancel')
				}}
			</button>
			@if (selectedView() === 'import') {
				@if (!batch.started()) {
					<button
						type="button"
						class="btn btn-link"
						[disabled]="!canContinueImport()"
						(click)="editImportProperties()"
					>
						{{ 'documentImportForm.addProperties' | webuiMessage: 'Add Properties' }}
					</button>
				}
				<button
					type="button"
					class="btn btn-primary"
					[disabled]="!canContinueImport()"
					(click)="continueImport()"
				>
					{{
						batch.started()
							? ('documentImportForm.retry' | webuiMessage: 'Retry unfinished files')
							: uploads.uploading()
								? ('documentImport.uploading' | webuiMessage: 'Uploading...')
								: ('command.create' | webuiMessage: 'Create')
					}}
				</button>
			}
		</div>`,
	styles: `
		:host {
			display: flex;
			flex-direction: column;
			height: var(--nuxeo-document-create-popup-height, 80vh);
			max-height: calc(100dvh - 32px);
		}
		.modal-body {
			max-height: 75vh;
			min-height: 0;
			overflow: auto;
			padding: 0;
		}
		.location-holder {
			margin: 16px 32px;
		}
		.location {
			background: var(--nuxeo-input-background, rgba(0, 0, 0, 0.05));
			padding: 8px 16px;
		}
		.location label {
			font-size: 12px;
		}
		.modal-footer {
			justify-content: space-between;
			padding: 16px 32px;
		}
		:host ::ng-deep .destination-picker .view-tabs {
			padding: 0;
		}
		:host ::ng-deep .destination-picker .view-tabs > nx-contribution-outlet {
			flex: 1;
		}
		:host ::ng-deep .destination-picker .view-tabs nx-create-popup-tab,
		:host ::ng-deep .destination-picker .view-tabs nx-document-view-tab {
			display: flex;
			width: 100%;
		}
		:host ::ng-deep .destination-picker .view-tabs [role='tab'] {
			width: 100%;
			justify-content: center;
			min-height: 48px;
		}
		:host ::ng-deep .destination-picker .view-page {
			padding: 0 32px 16px;
		}
		:host ::ng-deep .editing-type .view-page {
			display: none;
		}
		:host ::ng-deep .editing-type nx-base-editor .modal-header {
			border: 0;
		}
		:host ::ng-deep .editing-type nx-base-editor .modal-header .btn-close {
			display: none;
		}
		.destination {
			display: flex;
			gap: 8px;
			margin: 0;
			flex-wrap: wrap;
		}
		.destination input {
			flex: 1;
			min-width: 160px;
			padding: 8px;
			border: 0;
			background: transparent;
			color: inherit;
		}
		button {
			font: inherit;
		}
		.destination button {
			border: 0;
			background: transparent;
			color: inherit;
		}
		.folders {
			max-height: 250px;
			overflow: auto;
			border: 1px solid var(--nuxeo-border);
			padding: 12px;
			margin-bottom: 16px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DestinationCreateDialogComponent implements OnInit {
	@Input() initialPath = '/';
	@Input() initialType?: string;
	@Input() initialBulk = false;
	@Input() initialView = 'create';
	/** Files dropped on a folder: stock opens its import with them and starts uploading. */
	@Input() initialFiles: readonly File[] = [];
	/** The initial destination, when the opener already loads it for this same gesture. */
	@Input() initialDestination?: Observable<CreationDestination>;
	@Input() repository = 'default';
	readonly selectedView = signal<string | null>(null);
	readonly selectedType = signal<string | null>(null);
	readonly editingImport = signal(false);
	readonly batch = inject(BulkDocumentCreation);
	readonly importHost = DocumentImportHostComponent;
	importInputs: Record<string, unknown> = {};
	private readonly activeEditor = viewChild(NgComponentOutlet);
	readonly typeEditor = DocumentTypeEditorComponent;
	editorInputs: Record<string, unknown> = {};
	readonly editorInjector = Injector.create({
		parent: inject(Injector),
		providers: [
			{ provide: DOCUMENT_CREATION_WIZARD, useValue: { back: () => this.selectedType.set(null) } },
		],
	});
	path = '/';
	readonly loading = signal(false);
	readonly busy = signal(false);
	private readonly errorMessage = localizedMessage();
	readonly error = this.errorMessage.text;
	readonly showTree = signal(false);
	private readonly destination = signal<DocumentCreateContext | null>(null);
	/** Chosen files upload at once, into one batch, as stock's import does. */
	readonly uploads = inject(StagedImportUploads);
	readonly selectedFiles = this.uploads.files;
	readonly context = computed<DocumentCreateContext | null>(() => {
		const destination = this.destination();
		return destination
			? {
					...destination,
					busy: this.busy() || this.loading() || this.batch.started(),
					selectedFiles: this.selectedFiles(),
				}
			: null;
	});
	private readonly parents = inject(CreationParentService);
	private readonly modal = inject(BsModalRef);
	private readonly router = inject(Router);
	private readonly destroy = inject(DestroyRef);
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly injector = inject(Injector);
	private readonly views = viewChild(DocumentViewsComponent);
	private readonly files = viewChild<ElementRef<HTMLInputElement>>('files');
	private request?: Subscription;
	private generation = 0;
	private closed = false;
	readonly chooseFolder = (doc: any) => {
		void this.choosePath(doc.path);
	};
	constructor() {
		this.destroy.onDestroy(inject(ViewNavigation).register(async () => !this.busy()));
		this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
			if (event instanceof NavigationEnd) this.finishClose();
		});
	}
	ngOnInit(): void {
		this.batch.watchDeparture(
			() => !this.batch.started() && this.selectedFiles().length > 0,
			() => this.finishClose(),
		);
		this.selectedView.set(this.initialView);
		this.path = this.initialPath;
		this.stageFiles(this.initialFiles);
		void this.choosePath(this.path, this.initialDestination);
	}
	async choosePath(path: string, loaded?: Observable<CreationDestination>): Promise<void> {
		if (this.busy() || this.closed) return;
		this.busy.set(true);
		try {
			if (this.activeEditor()?.componentInstance && !(await this.canLeaveEditor())) {
				this.path = String(this.context()?.document?.['path'] ?? this.path);
				return;
			}
			if (
				this.views() &&
				!(await this.views()!.canDeactivate({
					reason: 'navigation',
					nextViewId: null,
					nextUrl: path,
				}))
			) {
				this.path = String(this.context()?.document?.['path'] ?? this.path);
				return;
			}
		} catch {
			this.errorMessage.set(
				'app.components.destination-create-dialog.the-current-editor-could-not-be-closed-your-destination-',
				'The current editor could not be closed. Your destination has not changed.',
			);
			return;
		} finally {
			this.busy.set(false);
		}
		if (this.destroy.destroyed) return;
		this.selectedType.set(null);
		this.editingImport.set(false);
		this.editorInputs = {};
		this.importInputs = {};
		const generation = ++this.generation;
		const document = this.element.nativeElement.ownerDocument;
		const focusedTreeItem = this.element.nativeElement
			.querySelector('.folders')
			?.contains(document.activeElement)
			? (document.activeElement as HTMLElement)
			: null;
		this.request?.unsubscribe();
		this.loading.set(true);
		this.errorMessage.clear();
		this.destination.set(null);
		try {
			this.request = (loaded ?? this.parents.load(path.trim(), this.repository))
				.pipe(takeUntilDestroyed(this.destroy))
				.subscribe({
					next: (d) => {
						if (generation !== this.generation) return;
						this.path = d.document.path;
						this.loading.set(false);
						this.showTree.set(false);
						if (focusedTreeItem)
							afterNextRender(
								() => {
									if (
										!this.destroy.destroyed &&
										generation === this.generation &&
										(document.activeElement === document.body ||
											document.activeElement === focusedTreeItem)
									)
										this.element.nativeElement
											.querySelector<HTMLButtonElement>('button[data-destination-browse]')
											?.focus();
								},
								{ injector: this.injector },
							);
						this.destination.set({
							destinationPicker: true,
							document: d.document,
							types: d.types,
							noEdit: !d.allowed,
							open: () => {
								void this.views()?.select('create');
							},
							create: (type, bulk) => {
								void this.create(type, bulk);
							},
							importFiles: () => {
								if (!this.busy()) this.files()?.nativeElement.click();
							},
							importSelection: (files) => this.stageFiles(files),
							removeSelectedFile: (index) => {
								if (!this.busy() && !this.batch.started()) this.uploads.removeAt(index);
							},
						});
						if (this.initialType) {
							const type = this.initialType;
							this.initialType = undefined;
							void this.create(type, this.initialBulk);
						}
					},
					error: () => {
						if (generation === this.generation) {
							this.loading.set(false);
							this.errorMessage.set(
								'app.components.destination-create-dialog.this-folder-could-not-be-loaded-check-the-path-and-your-',
								'This folder could not be loaded. Check the path and your access.',
							);
						}
					},
				});
		} catch {
			this.loading.set(false);
			this.errorMessage.set(
				'app.components.destination-create-dialog.invalid-destination',
				'Invalid destination.',
			);
		}
	}
	async switchView(view: string | null): Promise<void> {
		if (this.busy() || this.batch.started()) return;
		if (!(await this.canLeaveEditor())) return;
		this.selectedType.set(null);
		this.editingImport.set(false);
		this.selectedView.set(view);
	}
	private async canLeaveEditor(): Promise<boolean> {
		const editor = this.activeEditor()?.componentInstance as {
			canDeactivate?: () => boolean | Promise<boolean>;
		} | null;
		return editor?.canDeactivate ? await editor.canDeactivate() : true;
	}
	async editImportProperties(): Promise<void> {
		if (!this.canContinueImport() || this.batch.started()) return;
		const parent = await this.ready();
		if (!parent) return;
		this.importInputs = {
			embedded: true,
			parentDocument: parent,
			files: [...this.selectedFiles()],
			allowedTypes: this.context()!
				.types.filter((type) => type.file)
				.map((type) => type.name),
			documentType: '',
			layoutComponent: StandardContentImportComponent,
			uploads: this.uploads,
		};
		this.editingImport.set(true);
	}
	async close(): Promise<void> {
		if (this.busy() || this.closed) return;
		this.busy.set(true);
		try {
			if (this.activeEditor()?.componentInstance && !(await this.canLeaveEditor())) {
				this.path = String(this.context()?.document?.['path'] ?? this.path);
				return;
			}
			if (
				!this.views() ||
				(await this.views()!.canDeactivate({ reason: 'navigation', nextViewId: null, nextUrl: '' }))
			) {
				this.finishClose();
			}
		} catch {
			this.errorMessage.set(
				'app.components.destination-create-dialog.the-current-editor-could-not-be-closed-your-changes-are-',
				'The current editor could not be closed. Your changes are still available.',
			);
		} finally {
			this.busy.set(false);
		}
	}
	private finishClose(): void {
		if (this.closed) return;
		this.closed = true;
		this.generation++;
		this.request?.unsubscribe();
		this.request = undefined;
		this.initialType = undefined;
		this.loading.set(false);
		this.destination.set(null);
		this.modal.hide();
	}
	escape(event: Event): void {
		event.preventDefault();
		event.stopPropagation();
		void this.close();
	}
	escapeFromDialog(event: Event): void {
		if (event.defaultPrevented) return;
		const host = this.element.nativeElement;
		const dialog = host.closest('[role="dialog"]');
		const target = event.target;
		// ngx-bootstrap initially focuses its outer dialog, above this component's host.
		if (dialog && target instanceof Element && dialog.contains(target) && target.contains(host))
			this.escape(event);
	}
	private async ready(type?: string): Promise<any | null> {
		const context = this.context();
		if (this.busy() || !context || context.noEdit) return null;
		this.busy.set(true);
		this.errorMessage.clear();
		const generation = this.generation;
		try {
			if (
				this.views() &&
				!(await this.views()!.canDeactivate({
					reason: 'navigation',
					nextViewId: null,
					nextUrl: '',
				}))
			)
				return null;
			if (this.destroy.destroyed) return null;
			const fresh = await firstValueFrom(
				this.parents
					.readId(String(context.document?.['uid']), this.repository)
					.pipe(takeUntilDestroyed(this.destroy)),
			);
			if (this.destroy.destroyed || generation !== this.generation) return null;
			if (!canCreateIn(fresh) || (type && !allowsCreateType(fresh, type))) {
				this.errorMessage.set(
					'app.components.destination-create-dialog.creation-not-allowed',
					'Creation is no longer allowed in this folder for the selected type.',
				);
				return null;
			}
			return { ...fresh, ng: (context.document as any).ng };
		} catch (error) {
			if (error instanceof Error)
				this.errorMessage.set(
					'app.components.destination-create-dialog.creation-failed-detail',
					'Creation could not be started: {detail}',
					{ detail: error.message },
				);
			else
				this.errorMessage.set(
					'app.components.destination-create-dialog.creation-could-not-be-started',
					'Creation could not be started.',
				);
			return null;
		} finally {
			this.busy.set(false);
		}
	}
	async create(type: string, bulk = false): Promise<void> {
		if (!this.context()?.types.some((t) => t.name === type && (!bulk || t.file))) return;
		const parent = await this.ready(type);
		if (!parent) return;
		this.editorInputs = {
			documentType: type,
			data: {
				add: true,
				bulkAdd: bulk,
				parentDocument: parent,
				documentType: type,
				onSave: (saved: any[]) => {
					if (saved?.length === 1) void this.router.navigateByUrl(documentUrl(saved[0]));
				},
			},
		};
		this.selectedType.set(type);
	}
	async importSelection(input: HTMLInputElement): Promise<void> {
		const files = Array.from(input.files ?? []);
		input.value = '';
		this.stageFiles(files);
	}
	private stageFiles(files: readonly File[]): void {
		if (this.busy() || this.closed || this.batch.started() || !files.length) return;
		this.uploads.add(files);
	}
	canContinueImport(): boolean {
		const context = this.context();
		return (
			(this.batch.started()
				? this.batch.retryable()
				: !!this.selectedFiles().length && !this.uploads.uploading()) &&
			!this.busy() &&
			!this.loading() &&
			!!context &&
			!context.noEdit &&
			context.types.some((type) => type.file)
		);
	}
	async continueImport(): Promise<void> {
		if (!this.canContinueImport()) return;
		const types = this.context()!.types.filter((type) => type.file);
		const parent = await this.ready();
		if (!parent) return;
		if (!types.some((type) => allowsCreateType(parent, type.name))) {
			this.errorMessage.set(
				'app.components.destination-create-dialog.select-a-different-container-to-import-your-content',
				'Select a different container to import your content.',
			);
			return;
		}
		this.busy.set(true);
		try {
			if (!this.batch.started()) {
				// Create retries a failed upload, then imports the batch the files were uploaded to.
				if (this.uploads.failed()) await this.uploads.retryFailed();
				if (!this.uploads.ready()) return;
				this.batch.configureImport(parent, [...this.selectedFiles()]);
				this.batch.adoptUploads(this.uploads.take());
			}
			await this.batch.run();
		} catch {
			this.errorMessage.set(
				'documentImport.error.importFailed',
				'The import could not be completed. Retry unfinished files.',
			);
		} finally {
			this.busy.set(false);
		}
	}
}
