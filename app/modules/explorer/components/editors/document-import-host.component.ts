import { documentTypeLabel } from 'app/helpers/document-type-presentation';
import { WebUiMessages } from '@maretha/webui-sdk';
import { FormsModule } from '@angular/forms';
import {
	DocumentLayoutRegistry,
	documentLayoutContext,
	provideSuggestionScope,
} from '@maretha/webui-sdk';
import { noteImportFormat } from '../../helpers/import-document-type';
import { errorMessage } from 'app/helpers/localized-message';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	Injector,
	Input,
	OnDestroy,
	OnInit,
	Type,
	computed,
	inject,
	signal,
	untracked,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import {
	DOCUMENT_IMPORT_DRAFT,
	DocumentImportDraft,
	DocumentLayoutContext,
	WebUiMessagePipe,
} from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { BulkDocumentCreation } from '../../helpers/bulk-document-creation.service';
import { StagedImportUploads } from '../../helpers/staged-import-uploads';
import { BulkCreationResultsComponent } from './bulk-creation-results/bulk-creation-results.component';

interface ImportDraftEntry {
	readonly key: number;
	readonly file: File;
	readonly documentType: string;
	readonly included: boolean;
	readonly properties: Readonly<Record<string, unknown>>;
	readonly valid: boolean;
}

/**
 * The import dialog for a type with an import layout, after Polymer's nuxeo-document-import:
 * it owns the files, their per-file properties and the guarded batch creation, and mounts the
 * type's import layout for the selected file through DOCUMENT_IMPORT_DRAFT.
 */
@Component({
	selector: 'nx-document-import-host',
	standalone: true,
	providers: [BulkDocumentCreation],
	imports: [NgComponentOutlet, BulkCreationResultsComponent, WebUiMessagePipe, FormsModule],
	template: `
		@if (!embedded) {
			<div class="modal-header">
				<h4 class="modal-title">
					{{ 'document.importType' | webuiMessage: 'Import {type}' : { type: documentType } }}
				</h4>
				<button
					type="button"
					class="btn-close"
					[attr.aria-label]="
						'app.modules.standard-content-import.close-dd4b09' | webuiMessage: 'Close'
					"
					[disabled]="batch.working()"
					(click)="close()"
				></button>
			</div>
		}
		<div class="modal-body" [attr.inert]="batch.started() ? '' : null">
			<div class="field">
				<label for="import-host-files">{{
					'app.modules.standard-content-import.files-02bd9a' | webuiMessage: 'Files'
				}}</label>
				<input
					id="import-host-files"
					type="file"
					multiple
					class="form-control"
					(change)="selectFiles($event)"
				/>
			</div>
			@if (drafts().length) {
				<nav
					[attr.aria-label]="
						'app.modules.standard-content-import.files-to-import-ceb0c5'
							| webuiMessage: 'Files to import'
					"
					class="file-list"
				>
					@for (draft of drafts(); track draft.key) {
						<label
							><input
								type="checkbox"
								[checked]="draft.included"
								[attr.aria-label]="
									'documentImportForm.includeFile'
										| webuiMessage: 'Include {name}' : { name: draft.file.name }
								"
								(change)="include(draft.key, $any($event.target).checked)"
							/>
							<button
								type="button"
								[class.selected]="selectedKey() === draft.key"
								[attr.aria-pressed]="selectedKey() === draft.key"
								(click)="select(draft.key)"
							>
								{{ draft.properties['dc:title'] || draft.file.name }}
							</button></label
						>
					}
				</nav>
				@if (mounted(); as layout) {
					<p>
						{{ layout.file.name }}
						<button type="button" class="btn btn-link" (click)="removeFile(layout.key)">
							{{ 'app.modules.standard-content-import.remove-6abf4b' | webuiMessage: 'Remove' }}
						</button>
					</p>
					@if (!documentType || allowedTypes.length > 1) {
						<label for="import-draft-type">{{
							'documentImportForm.type' | webuiMessage: 'Type'
						}}</label
						><select
							id="import-draft-type"
							required
							[attr.aria-invalid]="!layout.documentType"
							[ngModel]="layout.documentType"
							(ngModelChange)="changeType(layout.key, $event)"
						>
							@if (!layout.documentType) {
								<option value="" disabled>
									{{
										'documentImportForm.type.placeholder' | webuiMessage: 'Select an asset type.'
									}}
								</option>
							}
							@for (type of allowedTypes; track type) {
								<option [value]="type">{{ typeLabel(type) }}</option>
							}
						</select>
					}
					@if (layout.component) {
						<ng-container
							*ngComponentOutlet="
								layout.component;
								injector: layout.injector;
								inputs: layout.inputs
							"
						/>
					}
					<nav class="file-navigation">
						<button
							type="button"
							class="btn btn-link"
							[disabled]="selectedIndex() === 0"
							(click)="previous()"
						>
							{{ 'documentImportForm.editPrevious' | webuiMessage: 'Edit Previous' }}</button
						><button
							type="button"
							class="btn btn-link"
							[disabled]="selectedIndex() === drafts().length - 1"
							(click)="next()"
						>
							{{ 'documentImportForm.editNext' | webuiMessage: 'Edit Next' }}
						</button>
					</nav>
					@if (drafts().length > 1) {
						<button type="button" class="btn btn-link" (click)="applyToOthers(layout.key)">
							{{
								'app.modules.standard-content-import.apply-properties-to-other-files-fa2fdc'
									| webuiMessage: 'Apply To All'
							}}
						</button>
					}
				}
			}
		</div>
		@if (error) {
			<p role="alert" class="px-3">{{ error }}</p>
		}
		<nx-bulk-creation-results [batch]="batch" />
		<div class="modal-footer">
			<button
				type="button"
				class="btn btn-outline-secondary"
				[disabled]="batch.working()"
				(click)="close()"
			>
				{{
					batch.complete()
						? ('app.modules.standard-content-import.done-f9b04b' | webuiMessage: 'Done')
						: ('app.modules.standard-content-import.cancel-481624' | webuiMessage: 'Cancel')
				}}
			</button>
			@if (!batch.complete()) {
				<button
					type="button"
					class="btn btn-primary"
					[disabled]="
						batch.working() ||
						invalid() ||
						!includedCount() ||
						(batch.started() && !batch.retryable())
					"
					(click)="save()"
				>
					{{
						batch.started()
							? ('app.modules.standard-content-import.retry-unfinished-files-3e3e56'
								| webuiMessage: 'Retry unfinished files')
							: ('app.modules.standard-content-import.create-4eefae' | webuiMessage: 'Create')
					}}
				</button>
			}
		</div>
	`,
	styles: [
		`
			.field {
				margin-bottom: 1rem;
			}
			label {
				display: block;
				margin-bottom: 0.35rem;
			}
			.file-list {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4rem;
				margin-bottom: 1rem;
			}
			.file-list button {
				background: var(--nuxeo-background, #f7f7f7);
				border: 1px solid var(--nuxeo-border, #ddd);
				border-radius: 3px;
				padding: 0.35rem 0.5rem;
				overflow-wrap: anywhere;
			}
			.file-list .selected {
				border-color: var(--nuxeo-primary-color, #0066cc);
			}
			[role='alert'] {
				color: var(--bs-danger);
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentImportHostComponent implements OnInit, OnDestroy {
	/** The type's import layout, mounted for the selected file. */
	@Input() embedded = false;
	@Input() allowedTypes: string[] = [];
	@Input() layoutComponent!: Type<unknown>;
	@Input() layoutContext?: DocumentLayoutContext;
	@Input() parentDocument: any;
	@Input() files: File[] = [];
	@Input() documentType = '';
	/** Files the dialog already uploaded when they were chosen, as stock does. */
	@Input() uploads?: StagedImportUploads;
	readonly batch = inject(BulkDocumentCreation);
	private readonly modal = inject(BsModalRef);
	private readonly cdr = inject(ChangeDetectorRef);
	private readonly injector = inject(Injector);
	private readonly layouts = inject(DocumentLayoutRegistry);
	private readonly messages = inject(WebUiMessages);
	typeLabel(type: string): string {
		const label = documentTypeLabel(type);
		return this.messages.text(
			label.key,
			type === 'OrderedFolder' ? 'Ordered Folder' : label.fallback,
		);
	}
	readonly drafts = signal<readonly ImportDraftEntry[]>([]);
	readonly selectedKey = signal<number | null>(null);
	readonly includedCount = computed(() => this.drafts().filter((draft) => draft.included).length);
	readonly invalid = computed(() => this.drafts().some((draft) => draft.included && !draft.valid));
	/** Changes only with the selection, so editing a draft never remounts its layout. */
	readonly mountRevision = signal(0);
	readonly mounted = computed(() => {
		this.mountRevision();
		const key = this.selectedKey();
		return key === null ? null : untracked(() => this.mount(key));
	});
	layoutInputs: Record<string, unknown> = {};
	readonly save$ = new Subject<any>();
	private nextKey = 0;
	private touched = false;
	private readonly errorText = localizedText();
	get error(): string {
		return this.errorText();
	}
	set error(value: string | MessageText) {
		this.errorText.set(value);
	}
	constructor() {
		this.batch.watchDeparture(
			() => !this.batch.started() && (!!this.drafts().length || this.touched),
			() => this.modal.hide(),
		);
	}
	ngOnInit(): void {
		this.layoutInputs = { layoutContext: this.layoutContext };
		this.addFiles(this.files);
	}
	selectFiles(event: Event): void {
		const input = event.target as HTMLInputElement;
		this.addFiles(Array.from(input.files ?? []));
		input.value = '';
	}
	readonly selectedIndex = computed(() =>
		this.drafts().findIndex((draft) => draft.key === this.selectedKey()),
	);
	previous(): void {
		this.selectedKey.set(this.drafts()[Math.max(0, this.selectedIndex() - 1)]?.key ?? null);
	}
	next(): void {
		this.selectedKey.set(
			this.drafts()[Math.min(this.drafts().length - 1, this.selectedIndex() + 1)]?.key ?? null,
		);
	}
	include(key: number, included: boolean): void {
		if (!this.batch.started())
			this.drafts.update((drafts) =>
				drafts.map((draft) => (draft.key === key ? { ...draft, included } : draft)),
			);
	}
	changeType(key: number, type: string): void {
		if (this.batch.started() || !this.allowedTypes.includes(type)) return;
		this.drafts.update((drafts) =>
			drafts.map((draft) =>
				draft.key === key
					? {
							...draft,
							documentType: type,
							properties: {
								...Object.fromEntries(
									Object.entries(draft.properties).filter(([key]) => key.startsWith('dc:')),
								),
								...(type === 'Note' ? { 'note:mime_type': noteImportFormat(draft.file) } : {}),
							},
							valid: true,
						}
					: draft,
			),
		);
		this.mountRevision.update((value) => value + 1);
	}
	canDeactivate(): boolean {
		return this.batch.canLeave(!this.batch.started() && (!!this.drafts().length || this.touched));
	}
	select(key: number): void {
		this.selectedKey.set(key);
	}
	removeFile(key: number): void {
		if (this.batch.started()) return;
		const drafts = this.drafts();
		const index = drafts.findIndex((draft) => draft.key === key);
		const remaining = drafts.filter((draft) => draft.key !== key);
		this.drafts.set(remaining);
		this.touched = true;
		if (this.selectedKey() === key)
			this.selectedKey.set(remaining[Math.min(index, remaining.length - 1)]?.key ?? null);
	}
	/** Copies every property but the title; the copies share the source layout's validity. */
	applyToOthers(key: number): void {
		const source = this.drafts().find((draft) => draft.key === key);
		if (!source || this.batch.started()) return;
		const { ['dc:title']: _title, ...properties } = source.properties;
		this.drafts.update((drafts) =>
			drafts.map((draft) =>
				draft.key === key || draft.documentType !== source.documentType
					? draft
					: {
							...draft,
							properties: {
								...structuredClone(properties),
								'dc:title': draft.properties['dc:title'],
							},
							valid: source.valid,
						},
			),
		);
		this.touched = true;
	}
	async save(): Promise<void> {
		if (
			this.batch.working() ||
			this.invalid() ||
			!this.drafts().some((draft) => draft.included) ||
			this.layoutContext?.noEdit
		)
			return;
		this.error = '';
		try {
			if (!this.batch.started()) {
				const drafts = new Map(
					this.drafts()
						.filter((draft) => draft.included)
						.map((draft) => [draft.file, draft]),
				);
				this.batch.configure(
					this.parentDocument,
					[...drafts.keys()],
					(file) => drafts.get(file)!.documentType,
					(file) => {
						const { ['dc:title']: _title, ...properties } = drafts.get(file)!.properties;
						return properties;
					},
					(file) =>
						drafts.get(file)!.documentType === 'Note'
							? { kind: 'utf8-text', property: 'note:note' }
							: { kind: 'upload', property: 'file:content' },
					(file) => String(drafts.get(file)!.properties['dc:title'] || file.name),
				);
				this.batch.adoptUploads(this.uploads?.take());
			}
			await this.batch.run();
		} catch (error) {
			this.error =
				error instanceof Error
					? errorMessage(error)
					: messageText(
							'app.state.the-import-could-not-be-started-4aad57',
							'The import could not be started.',
						);
		}
		this.cdr.markForCheck();
	}
	close(): void {
		if (!this.batch.canLeave(!this.batch.started() && (!!this.drafts().length || this.touched)))
			return;
		if (this.batch.createdCount()) this.save$.next(this.batch.documents);
		this.modal.hide();
	}
	ngOnDestroy(): void {
		this.save$.complete();
	}
	private addFiles(files: readonly File[]): void {
		if (this.batch.started() || !files.length) return;
		// Like stock's Add Properties, a file has no type until one is chosen for it.
		const added = files.map((file) => ({
			key: this.nextKey++,
			file,
			included: true,
			documentType: this.documentType,
			properties: {
				'dc:title': file.name,
				...(this.documentType === 'Note' ? { 'note:mime_type': noteImportFormat(file) } : {}),
			},
			valid: !!this.documentType,
		}));
		this.drafts.update((drafts) => [...drafts, ...added]);
		this.touched = true;
		if (this.selectedKey() === null) this.selectedKey.set(added[0].key);
	}
	private patch(key: number, change: Partial<Pick<ImportDraftEntry, 'properties' | 'valid'>>) {
		this.drafts.update((drafts) =>
			drafts.map((draft) => (draft.key === key ? { ...draft, ...change } : draft)),
		);
	}
	private mount(key: number) {
		const entry = this.drafts().find((draft) => draft.key === key)!;
		const context = documentLayoutContext({
			documentType: entry.documentType,
			mode: 'import',
			parentDocument: this.parentDocument,
		});
		const resolved = entry.documentType ? this.layouts.resolve(context) : undefined;
		const component = entry.documentType ? (resolved?.component ?? this.layoutComponent) : null;
		const draft: DocumentImportDraft = {
			file: entry.file,
			properties: structuredClone(entry.properties),
			update: (properties) => {
				const current = this.drafts().find((item) => item.key === key);
				if (current && !this.batch.started())
					this.patch(key, {
						properties: { ...current.properties, ...structuredClone(properties) },
					});
			},
			setValid: (valid) => {
				if (
					this.drafts().find((item) => item.key === key)?.valid !== (valid && !resolved?.disabled)
				)
					this.patch(key, { valid: valid && !resolved?.disabled });
			},
		};
		return {
			key,
			file: entry.file,
			documentType: entry.documentType,
			component,
			inputs: { layoutContext: context },
			injector: Injector.create({
				providers: [
					{ provide: DOCUMENT_IMPORT_DRAFT, useValue: draft },
					provideSuggestionScope(resolved?.id ?? null),
				],
				parent: this.injector,
			}),
		};
	}
}
