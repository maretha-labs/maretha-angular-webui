import { documentUrl } from 'app/helpers/document-route';
import { CORE_RESULTS_OPTIONS } from 'app/helpers/core-results-options';
import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	Input,
	inject,
	signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import {
	DocumentCreateContext,
	BulkLayoutResolver,
	ResultsToolbarContext,
	WebUiSlotComponent,
} from '@maretha/webui-sdk';
import { firstValueFrom, merge } from 'rxjs';
import { BsModalService } from 'ngx-bootstrap/modal';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { DocumentClipboardService } from '../../helpers/document-clipboard.service';
import { DocumentCollectionsService } from '../../helpers/document-collections.service';
import { DocumentTrashService } from '../../helpers/document-trash.service';
import { DocumentSearchService } from 'app/modules/search/helpers/document-search.service';
import { DocumentSnapshotsService } from '../../helpers/document-snapshots.service';
import { SearchQueueService } from 'app/modules/search/helpers/search-queue.service';
import { WorkflowsService } from 'app/helpers/workflows.service';
import { LayoutService } from '../../helpers/layout.service';
import { DocumentComparisonComponent } from '../viewers/document-comparison/document-comparison.component';
import {
	canRunDocumentCommand,
	DocumentCommand,
} from '../viewers/document-actions-toolbar/document-command-policy';
import {
	canOrderChildren,
	DocumentOrderService,
	planDocumentOrder,
} from '../../helpers/document-order.service';
import { DocumentManagerMode } from '../../helpers/documents-manager.service';
import { DestinationCreateDialogComponent } from 'app/components/quick-search/destination-create-dialog.component';
import { BulkEditorModalComponent } from './bulk-editor-modal.component';
import { documentRouteMatches } from 'app/helpers/document-route';
import { DocumentActionsToolbarComponent } from '../viewers/document-actions-toolbar/document-actions-toolbar.component';
import {
	isStandardFolder,
	usesStandardDocumentHeader,
} from '../../helpers/standard-document-surfaces';
import { hasPermission } from 'app/helpers/document-permissions';

@Component({
	selector: 'nx-document-toolbar',
	host: { '[class.compact]': 'compact' },
	imports: [WebUiNumberPipe, WebUiSlotComponent, DocumentActionsToolbarComponent, WebUiMessagePipe],
	templateUrl: './document-toolbar.component.html',
	styleUrls: ['./document-toolbar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentToolbarComponent {
	openSelectionDocument(document: any): void {
		void this.router.navigateByUrl(documentUrl(document));
	}
	private readonly coreResultsOptions = inject(CORE_RESULTS_OPTIONS);
	readonly selectionPreview = signal(false);
	@Input() compact = false;
	readonly standardHeader = usesStandardDocumentHeader;
	readonly scopedResults = isStandardFolder;
	private readonly ordering = inject(DocumentOrderService);
	private readonly bulkLayouts = inject(BulkLayoutResolver);
	private readonly manager = inject(DocumentsManagerService);
	private readonly clipboard = inject(DocumentClipboardService);
	private readonly collections = inject(DocumentCollectionsService);
	private readonly trash = inject(DocumentTrashService);
	private readonly search = inject(DocumentSearchService);
	private readonly snapshots = inject(DocumentSnapshotsService);
	private readonly searchQueue = inject(SearchQueueService);
	private readonly workflows = inject(WorkflowsService);
	private readonly layout = inject(LayoutService);
	private readonly modal = inject(BsModalService);
	private readonly router = inject(Router);
	private readonly destroyRef = inject(DestroyRef);
	readonly context = signal<ResultsToolbarContext | null>(null);
	readonly documentContext = signal<ResultsToolbarContext | null>(null);
	readonly createContext = signal<DocumentCreateContext | null>(null);
	readonly error = localizedText('');
	readonly browserRouteActive = signal(false);
	readonly isTrash = signal(false);
	private busy = false;
	private busyQueryToken?: number;
	private routeToken = 0;
	constructor() {
		merge(
			this.manager.documentFetched$,
			this.manager.documentsUpdated$,
			this.manager.selectedDocumentsUpdated$,
			this.manager.fetchingDocuments$,
			this.clipboard.documentClipboardUpdated$,
			this.search.searchPaneVisibilityChanged$,
			this.search.searchParametersChanged$,
			this.snapshots.snapshotLoaded$,
			this.layout.settingsUpdated$,
			toObservable(this.manager.listingDisplayMode),
		)
			.pipe(takeUntilDestroyed())
			.subscribe(() => this.updateContext());
		this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
			if (event instanceof NavigationEnd) {
				this.routeToken++;
				this.error.set('');
				this.updateContext();
			}
		});
		this.updateContext();
	}
	private updateContext(): void {
		this.browserRouteActive.set(
			this.router.isActive('/browse', {
				paths: 'subset',
				queryParams: 'ignored',
				fragment: 'ignored',
				matrixParams: 'ignored',
			}),
		);
		const document = this.manager.documentInfo ?? null;
		const documentOnly = !!document?.uid && !document.ng?.isFolder;
		const queueActive = this.searchQueue.active();
		const queued = this.searchQueue.toolbarSnapshot();
		// Query-wide commands belong to the search queue beside a document. A folder listing shows
		// the folder's children, never a search.
		const queryScope = documentOnly || !queueActive ? undefined : queued?.scope;
		const queryToken = queued?.token ?? this.search.getAppliedQueryToken();
		const queryIsStillCurrent = () =>
			!!queryScope &&
			queryToken !== undefined &&
			queryToken === this.search.getAppliedQueryToken() &&
			this.sameQueryScope(queryScope, this.search.getAppliedQueryScope(queryScope.repository));
		const documentIsStillCurrent = () =>
			!!document?.uid &&
			this.manager.documentInfo?.uid === document.uid &&
			this.manager.documentInfo?.repository === document.repository;
		if (this.busyQueryToken !== undefined && this.busyQueryToken !== queryToken) {
			this.busy = false;
			this.busyQueryToken = undefined;
		}
		const allSelected = !documentOnly && !Number.isFinite(this.manager.selectionCount);
		const queryExclusions = allSelected ? this.manager.deselectedDocumentIds : [];
		const selectedDocuments =
			documentOnly || allSelected ? [] : this.manager.documents.filter((d) => d.ng?.isSelected);
		const noEdit = this.busy;
		const collection = document?.ng?.facets?.collection ? document : null;
		const availableCommands = ['display'];
		if (this.manager.documents.length) availableCommands.push('select-loaded');
		if (this.manager.selectionCount) availableCommands.push('clear-selection');
		const can = (command: DocumentCommand) =>
			!!selectedDocuments.length &&
			selectedDocuments.every((doc) =>
				canRunDocumentCommand({ document: doc, collection, noEdit }, command),
			);
		if (this.coreResultsOptions.bulkEdit && can('edit') && selectedDocuments.length < 200)
			availableCommands.push('edit-selection');
		if (selectedDocuments.length > 1 && selectedDocuments.length < 200)
			availableCommands.push('compare');
		for (const command of ['clipboard', 'collect', 'trash', 'remove-collection'] as const)
			if (can(command)) availableCommands.push(command);
		if (this.orderingScopeAvailable(document) && selectedDocuments.length) {
			const ids = this.manager.documents.map((d) => d.uid);
			const selected = selectedDocuments.map((d) => d.uid);
			if (planDocumentOrder(ids, selected, 'up')) availableCommands.push('move-up');
			if (this.manager.canLoadMore || planDocumentOrder(ids, selected, 'down'))
				availableCommands.push('move-down');
		}
		// Stock nuxeo-workflow-button: runnable only while nothing runs and the document is no record.
		const running = document?.contextParameters?.runningWorkflows ?? [];
		const runnable =
			running.length || document?.isRecord
				? []
				: (document?.contextParameters?.runnableWorkflows ?? []);
		const ctx: ResultsToolbarContext = {
			queryScope,
			queryToken,
			routeToken: this.routeToken,
			queryExclusions,
			document,
			collection,
			noEdit,
			selectedDocuments,
			busy: this.busy,
			allSelected,
			items: this.manager.documents,
			displayMode: this.manager.listingDisplayMode() ?? undefined,
			loadedCount: this.manager.documents.length,
			totalCount: queued?.total ?? this.manager.totalCount,
			availableCommands,
			workflows: runnable,
			execute: (command, argument) => this.execute(command, argument),
			setBusy: (value) => {
				if (value) {
					this.busy = true;
					this.busyQueryToken = queryToken;
				} else if (this.busyQueryToken === undefined || this.busyQueryToken === queryToken) {
					this.busy = false;
					this.busyQueryToken = undefined;
				}
				this.updateContext();
			},
			reportError: (message) => this.error.set(message),
			reportMessage: (key, fallback, values) => this.error.set(messageText(key, fallback, values)),
			refresh: async () => {
				this.manager.clearSelection();
				if (queryIsStillCurrent()) {
					this.searchQueue.refresh(queryScope!, queryToken!);
					// Only a listing on screen reloads; a document beside the queue shows none.
					if (
						!this.manager.documentInfo?.ng?.isFolder &&
						this.manager.listingDisplayMode() === null
					)
						return;
					this.manager.clearDocuments();
					try {
						await firstValueFrom(this.manager.loadMore());
					} catch {
						this.error.set(
							messageText(
								'app.state.unable-to-refresh-the-search-results-2e29d4',
								'Unable to refresh the search results.',
							),
						);
					}
				}
				if (queryScope && !queryIsStillCurrent()) {
					this.updateContext();
					return;
				}
				if (documentIsStillCurrent()) {
					try {
						await firstValueFrom(this.manager.reloadDocument(document.uid));
					} catch {
						this.error.set(
							messageText(
								'app.state.unable-to-refresh-the-document-d06b97',
								'Unable to refresh the document.',
							),
						);
					}
				}
				this.updateContext();
			},
			refreshDocument: () => {
				if (queryScope && !queryIsStillCurrent()) return;
				if (queryIsStillCurrent()) this.searchQueue.refresh(queryScope!, queryToken!);
				if (documentIsStillCurrent())
					this.manager
						.reloadDocument(document!.uid)
						.pipe(takeUntilDestroyed(this.destroyRef))
						.subscribe({
							error: () =>
								this.error.set(
									messageText(
										'app.state.unable-to-refresh-the-document-d06b97',
										'Unable to refresh the document.',
									),
								),
						});
			},
		};
		this.context.set(ctx);
		const documentCommands: string[] = [];
		if (
			document?.ng?.versionable &&
			!document.isTrashed &&
			!document.retainUntil &&
			!document.isRecord
		)
			documentCommands.push('versions');
		// Stock nuxeo-workflow-button: offered whenever the server lists runnable workflows and
		// none runs; the enricher already applies the caller's permissions (no client edit gate,
		// so a document locked by someone else still offers Start Process as stock does).
		if (runnable.length && !document?.ng?.facets?.collection && !noEdit)
			documentCommands.push('workflow');
		this.documentContext.set({
			...ctx,
			selectedDocuments: document ? [document] : [],
			availableCommands: documentCommands,
		});
		this.isTrash.set(this.manager.showOnlyTrashedDocuments);
		const types = (document?.ng?.subTypes ?? []).map((t: any) => ({
			name: t.name ?? t.label,
			label: t.label ?? t.name,
			// Note is a text import profile, not a file:content schema. It is the only
			// non-blob default type which may enter the file picker.
			file: !!t.schemas?.file || (t.name ?? t.label) === 'Note',
			folder: !!t.isFolder,
		}));
		const canCreate =
			!this.busy &&
			!this.search.searchPaneVisibility() &&
			!this.manager.showOnlyTrashedDocuments &&
			!selectedDocuments.length &&
			!allSelected &&
			!!document?.ng?.isFolder &&
			!document?.hasLegalHold &&
			hasPermission(document, 'AddChildren');
		this.createContext.set({
			document,
			noEdit: !canCreate,
			types,
			create: (type, bulk) => this.addDocument(type, bulk),
			importFiles: () => this.importFiles(),
			open: () => this.openCreate(),
		});
	}
	private orderingScopeAvailable(document: any): boolean {
		return (
			canOrderChildren(document) &&
			this.manager.mode === DocumentManagerMode.BrowseDocuments &&
			!this.search.searchPaneVisibility() &&
			!this.manager.showOnlyTrashedDocuments &&
			!this.manager.fetchingDocuments() &&
			documentRouteMatches(this.router.url, document)
		);
	}
	private sameQueryScope(left: unknown, right: unknown): boolean {
		return JSON.stringify(left) === JSON.stringify(right);
	}
	private async execute(command: string, argument?: string): Promise<void> {
		this.updateContext();
		const ctx = this.context()!;
		if (
			this.busy ||
			![...ctx.availableCommands, ...this.documentContext()!.availableCommands].includes(command)
		)
			return;
		if (command === 'select-loaded') {
			this.manager.selectAllLoaded();
			return;
		}
		if (command === 'clear-selection') {
			this.manager.clearSelection();
			return;
		}
		const docs = [...ctx.selectedDocuments] as any[];
		if (command === 'clipboard') {
			this.clipboard.addToClipboard(docs);
			return;
		}
		if (command === 'edit-selection') {
			const selectedIds = docs.map((document) => String(document.uid)).sort();
			const selectedRepositories = docs
				.map((document) => String(document.repository ?? 'default'))
				.sort();
			const route = this.router.url;
			const queryToken = ctx.queryToken;
			const current = () => {
				const ids = this.manager.documents
					.filter((document) => document.ng?.isSelected)
					.map((document) => String(document.uid))
					.sort();
				const repositories = this.manager.documents
					.filter((document) => document.ng?.isSelected)
					.map((document) => String(document.repository ?? 'default'))
					.sort();
				return (
					route === this.router.url &&
					queryToken === this.search.getAppliedQueryToken() &&
					ids.length === selectedIds.length &&
					ids.every((id, index) => id === selectedIds[index]) &&
					repositories.length === selectedRepositories.length &&
					repositories.every((repository, index) => repository === selectedRepositories[index]) &&
					ids.every((id) => {
						const document = this.manager.documents.find((candidate) => candidate.uid === id);
						return !!document && canRunDocumentCommand({ document, noEdit: this.busy }, 'edit');
					})
				);
			};
			this.modal.show(BulkEditorModalComponent, {
				class: 'modal-lg',
				ignoreBackdropClick: true,
				keyboard: false,
				initialState: {
					documents: structuredClone(docs),
					isCurrentScope: current,
					layoutComponent:
						this.bulkLayouts.resolve('default')?.component ??
						BulkEditorModalComponent.defaultLayout,
				},
			});
			return;
		}
		if (command === 'compare') {
			this.modal.show(DocumentComparisonComponent, {
				class: 'modal-lg',
				initialState: { documents: docs },
			});
			return;
		}
		this.busy = true;
		this.error.set('');
		this.updateContext();
		try {
			if (command === 'move-up' || command === 'move-down') {
				const parent = String(ctx.document?.['uid']);
				const repository = String(ctx.document?.['repository'] ?? 'default');
				const current = () =>
					this.manager.documentInfo?.uid === parent &&
					(this.manager.documentInfo.repository ?? 'default') === repository &&
					this.orderingScopeAvailable(this.manager.documentInfo);
				const orderedIds = await this.ordering.move(
					parent,
					repository,
					docs.map((d) => d.uid),
					command === 'move-up' ? 'up' : 'down',
					current,
					this.manager.documents.map((d) => d.uid),
				);
				if (current()) {
					this.manager.clearDocuments();
					await firstValueFrom(this.manager.loadMore());
					while (
						current() &&
						this.manager.canLoadMore &&
						docs.some((d) => !this.manager.documents.some((loaded) => loaded.uid === d.uid))
					)
						await firstValueFrom(this.manager.loadMore());
					if (current()) {
						if (orderedIds) this.manager.applySiblingOrder(orderedIds);
						for (const doc of docs) this.manager.toggleSelection(doc.uid, true);
					}
				}
			} else if (command === 'trash')
				await firstValueFrom(this.trash.moveDocumentsToTrash(docs.map((d) => d.uid)));
			else if (command === 'remove-collection')
				await firstValueFrom(
					this.collections.removeFromCollection(
						docs.map((d) => d.uid),
						String(ctx.collection?.['uid']),
					),
				);
			else if (
				command === 'workflow' &&
				argument &&
				ctx.workflows.some((w) => w.name === argument)
			) {
				await firstValueFrom(this.workflows.startWorkflow(ctx.document, argument));
				if (ctx.document?.['uid'] === this.manager.documentInfo?.uid)
					await firstValueFrom(this.manager.reloadDocument(String(ctx.document?.['uid'])));
			}
		} finally {
			this.busy = false;
			this.updateContext();
		}
	}
	private openCreate(): void {
		this.openDestination();
	}
	private openDestination(type?: string, bulk = false, view = 'create'): void {
		this.updateContext();
		const context = this.createContext();
		if (!context || context.noEdit) return;
		if (type && !context.types.some((t) => t.name === type && (!bulk || t.file))) return;
		this.modal.show(DestinationCreateDialogComponent, {
			class: 'modal-lg',
			ignoreBackdropClick: true,
			keyboard: false,
			initialState: {
				initialPath: String(context.document?.['path'] ?? '/'),
				initialType: type,
				initialBulk: bulk,
				initialView: view,
			},
		});
	}
	private addDocument(type: string, bulk = false): void {
		this.openDestination(type, bulk);
	}
	private importFiles(): void {
		this.openDestination(undefined, false, 'import');
	}
}
