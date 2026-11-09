import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiLocale, WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectorRef,
	Component,
	ChangeDetectionStrategy,
	DestroyRef,
	ElementRef,
	PendingTasks,
	computed,
	effect,
	inject,
	input,
	signal,
} from '@angular/core';
import { NuxeoTreeComponent, WebUiMessages } from '@maretha/webui-sdk';
import { Router } from '@angular/router';
import { DocumentBrowserService } from 'app/modules/explorer/helpers/document-browser.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { EMPTY, firstValueFrom, fromEvent, merge, Subject, takeUntil } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DocumentClipboardService } from 'app/modules/explorer/helpers/document-clipboard.service';
import { DocumentTrashService } from 'app/modules/explorer/helpers/document-trash.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgTemplateOutlet } from '@angular/common';
import { documentUrl } from 'app/helpers/document-route';

let treeSequence = 0;

export interface TreeNode {
	document: any;
	children: TreeNode[];
	isExpanded: boolean;
	isLoading: boolean;
	isFolderish: boolean;
	/** Stock `nuxeo-document-tree` `isLeaf`: only rows the `hasFolderishChild` enricher marks can open. */
	expandable: boolean;
	level: number;
	loaded: boolean;
	page: number;
	hasMore: boolean;
	error: string;
}

@Component({
	selector: 'nx-document-tree',
	templateUrl: './document-tree.component.html',
	styleUrls: ['./document-tree.component.scss'],
	imports: [FontAwesomeModule, NgTemplateOutlet, NuxeoTreeComponent, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentTreeComponent {
	private readonly treeId = `nx-document-tree-${++treeSequence}`;
	labelId(uid: string): string {
		return `${this.treeId}-${encodeURIComponent(uid)}`;
	}
	readonly rootPath = input('/');
	readonly repository = input('default');
	readonly showRoot = input(false);
	readonly selectDocument = input<((document: any) => void) | null>(null);
	/** Controlled destination selection; undefined retains the current-document default. */
	readonly selectedDocument = input<Readonly<Record<string, unknown>> | null | undefined>(
		undefined,
	);
	readonly navigate = input<((path: string) => void) | null>(null);
	/** `current`: stock Browse drawer, the tree starts at the current folder (or a file's parent) with
	 *  its ancestors as links above it; one `tree_children` request. `root`: starts at `rootPath`. */
	readonly anchor = input<'root' | 'current'>('root');
	/** Stock `_fetchDocument(docPath, visible)`: a hidden tree (closed or retained drawer page)
	 *  sends nothing; it loads once when shown. */
	readonly visible = input(true);
	readonly root = signal<TreeNode | null>(null);
	/** Ancestors above the anchor, from the current document's `breadcrumb` enricher (stock `parents`). */
	readonly parents = signal<any[]>([]);
	readonly showRootLink = computed(
		() => this.anchor() === 'current' && this.rootPath() === '/' && this.anchoredUid() !== null,
	);
	private readonly anchoredUid = signal<string | null>(null);
	get rootNodes(): TreeNode[] {
		const root = this.root();
		return root ? (this.showRoot() ? [root] : root.children) : [];
	}
	readonly isInitializing = signal(false);
	readonly error = localizedText('');
	readonly focusedUid = signal<string | null>(null);
	readonly currentDocUid = computed(() => {
		const document = this.documents.documentFetched();
		return (document?.repository ?? 'default') === this.repository()
			? (document?.uid ?? null)
			: null;
	});
	readonly selectedDocUid = computed(() => {
		const selected = this.selectedDocument();
		if (selected === undefined) return this.currentDocUid();
		return selected && (selected['repository'] ?? 'default') === this.repository()
			? (selected['uid'] ?? null)
			: null;
	});
	private readonly retryRevision = signal(0);
	private readonly browser = inject(DocumentBrowserService);
	private readonly messages = inject(WebUiMessages);
	private readonly locale = inject(WebUiLocale);
	private readonly documents = inject(DocumentsManagerService);
	private readonly clipboard = inject(DocumentClipboardService);
	private readonly trash = inject(DocumentTrashService);
	private readonly router = inject(Router);
	private readonly cdr = inject(ChangeDetectorRef);
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly tasks = inject(PendingTasks);
	private readonly destroyRef = inject(DestroyRef);
	private readonly cancelled = new Subject<void>();
	private generation = 0;
	private refreshQueued = false;
	private loadedKey = '';
	constructor() {
		this.destroyRef.onDestroy(() => {
			this.generation++;
			this.cancelled.next();
			this.cancelled.complete();
		});
		effect(() => {
			if (!this.visible()) return;
			const path = this.rootPath();
			const showRoot = this.showRoot();
			const repository = this.repository();
			void this.retryRevision();
			// `current` anchors follow the browsed document; the anchor document itself is never
			// fetched again: the manager already holds it with its breadcrumb.
			const anchor = this.anchor() === 'current' ? this.anchorDocument(path, repository) : null;
			// Opening a file inside the anchored folder changes nothing the tree shows.
			const key = JSON.stringify([
				this.retryRevision(),
				path,
				showRoot,
				repository,
				this.anchor(),
				anchor?.document.uid ?? null,
			]);
			if (key === this.loadedKey) return;
			this.loadedKey = key;
			this.tasks.run(() => this.loadRoot(path, showRoot, repository, anchor));
		});
		merge(this.clipboard.documentsCopied$ ?? EMPTY, this.clipboard.documentsMoved$ ?? EMPTY)
			.pipe(takeUntilDestroyed())
			.subscribe((event) => {
				const repositories = new Set<string>(
					(event.documents ?? []).map((document: any) => document.repository ?? 'default'),
				);
				if (!repositories.size) repositories.add('default');
				if (repositories.has(this.repository())) this.scheduleRefresh();
			});
		this.clipboard.drawerActionPerformed$
			?.pipe(takeUntilDestroyed())
			.subscribe((event) => this.scheduleRefresh(event.repository));
		// These legacy completion events carry UIDs only. Requery the active repository;
		// never remove nodes by a potentially cross-repository UID alone.
		merge(
			this.trash.documentsMovedToTrash$ ?? EMPTY,
			this.trash.documentsPurged$ ?? EMPTY,
			this.trash.documentsRestoredFromTrash$ ?? EMPTY,
			this.trash.trashEmptied$ ?? EMPTY,
		)
			.pipe(takeUntilDestroyed())
			.subscribe(() => this.scheduleRefresh());
		this.documents.documentsUpdated$?.pipe(takeUntilDestroyed()).subscribe((documents) => {
			if (documents.some((document) => this.changesCachedFolder(document))) this.scheduleRefresh();
		});
		this.documents.documentCreated$?.pipe(takeUntilDestroyed()).subscribe((event) => {
			if (!Array.isArray(event.document?.facets) || event.document.facets.includes('Folderish'))
				this.scheduleRefresh(event.repository);
		});
		if (typeof window !== 'undefined') {
			merge(
				...['document-created', 'refresh-display', 'nuxeo-documents-deleted'].map((name) =>
					fromEvent<CustomEvent>(window, name),
				),
			)
				.pipe(takeUntilDestroyed())
				.subscribe((event) =>
					this.scheduleRefresh(event.detail?.repository ?? event.detail?.document?.repository),
				);
		}
	}
	private scheduleRefresh(repository?: string): void {
		if (
			this.destroyRef.destroyed ||
			(repository && repository !== this.repository()) ||
			this.refreshQueued
		)
			return;
		this.refreshQueued = true;
		const scope = [this.repository(), this.rootPath()];
		queueMicrotask(() => {
			this.refreshQueued = false;
			if (
				!this.destroyRef.destroyed &&
				scope[0] === this.repository() &&
				scope[1] === this.rootPath()
			)
				this.retry();
		});
	}
	private changesCachedFolder(document: any): boolean {
		if (!document?.uid || (document.repository ?? 'default') !== this.repository()) return false;
		const find = (node: TreeNode | null, uid: string): TreeNode | undefined => {
			if (!node) return undefined;
			if (node.document.uid === uid) return node;
			for (const child of node.children) {
				const match = find(child, uid);
				if (match) return match;
			}
			return undefined;
		};
		const known = find(this.root(), document.uid);
		if (known)
			return (
				known.document.path !== document.path ||
				this.labelFor(known.document) !== this.labelFor(document) ||
				!!document.isTrashed
			);
		return (
			document.facets?.includes('Folderish') === true &&
			!!find(this.root(), document.parentRef)?.loaded
		);
	}
	retry(): void {
		this.retryRevision.update((revision) => revision + 1);
	}
	private async loadRoot(
		path: string,
		showRoot: boolean,
		repository: string,
		anchor: { document: any; parents: any[] } | null,
	): Promise<void> {
		const generation = ++this.generation;
		this.cancelled.next();
		this.root.set(null);
		this.parents.set(anchor?.parents ?? []);
		this.anchoredUid.set(anchor?.document.uid ?? null);
		this.isInitializing.set(true);
		this.error.set('');
		try {
			const document =
				anchor?.document ??
				(await firstValueFrom(
					this.browser.getTreeNode(path, repository).pipe(takeUntil(this.cancelled)),
				));
			if (generation !== this.generation || this.destroyRef.destroyed) return;
			const root = this.buildNode(document, showRoot ? 0 : -1);
			root.expandable = true;
			root.isExpanded = true;
			await this.loadChildren(root);
			if (generation === this.generation && !this.destroyRef.destroyed) this.root.set(root);
		} catch {
			if (generation === this.generation && !this.destroyRef.destroyed)
				this.error.set(
					messageText(
						'app.state.folders-could-not-be-loaded-check-your-access-4b610d',
						'Folders could not be loaded. Check your access and retry.',
					),
				);
		} finally {
			if (generation === this.generation) this.isInitializing.set(false);
		}
	}
	/** Stock `_currentDocumentChanged`: the tree's document is the browsed folder (a file's parent),
	 *  its `parents` the breadcrumb ancestors inside `rootPath` that navigation shows. */
	private anchorDocument(
		rootPath: string,
		repository: string,
	): { document: any; parents: any[] } | null {
		const current = this.documents.documentFetched();
		if (!current?.path || (current.repository ?? 'default') !== repository) return null;
		const inScope = (doc: any) =>
			typeof doc?.path === 'string' &&
			(rootPath === '/' || doc.path === rootPath || doc.path.startsWith(`${rootPath}/`)) &&
			Array.isArray(doc.facets) &&
			!doc.facets.includes('HiddenInNavigation');
		const entries: any[] = current.contextParameters?.breadcrumb?.entries ?? [];
		const chain = [...entries.filter((entry) => entry.uid !== current.uid), current].filter(
			inScope,
		);
		let index = chain.length - 1;
		while (index >= 0 && !chain[index].facets.includes('Folderish')) index--;
		if (index < 0) return null;
		return { document: chain[index], parents: chain.slice(0, index) };
	}
	/** The repository root above the ancestor links; `/` has no breadcrumb entry of its own. */
	readonly rootDocument = { path: '/', type: 'Root', facets: ['Folderish'] };
	navigateToDocument(document: any): void {
		this.navigateTo(this.buildNode(document, 0));
	}
	buildNode(document: any, level: number): TreeNode {
		return {
			document,
			level,
			children: [],
			isExpanded: false,
			isLoading: false,
			isFolderish: Array.isArray(document.facets) && document.facets.includes('Folderish'),
			expandable:
				Array.isArray(document.facets) &&
				document.facets.includes('Folderish') &&
				document.contextParameters?.hasFolderishChild === true,
			loaded: false,
			page: 0,
			hasMore: false,
			error: '',
		};
	}
	toggleNode(node: TreeNode): void {
		if (!node.expandable) return;
		node.isExpanded = !node.isExpanded;
		if (node.isExpanded && !node.loaded) this.tasks.run(() => this.loadChildren(node));
	}
	onTreeItemFocus(node: TreeNode): void {
		this.focusedUid.set(node.document.uid);
	}
	onTreeItemClick(event: MouseEvent): void {
		if ((event.target as HTMLElement).closest('[role="treeitem"]') === event.currentTarget)
			(event.currentTarget as HTMLElement).focus();
	}
	onTreeItemKeydown(event: KeyboardEvent, node: TreeNode): void {
		if (event.target !== event.currentTarget) return;
		const expandKey = this.locale.direction() === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
		const collapseKey = this.locale.direction() === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			this.navigateTo(node);
			return;
		}
		if (event.key === expandKey && node.expandable) {
			event.preventDefault();
			if (!node.isExpanded) this.toggleNode(node);
			else this.focusTreeItem(node.children[0]?.document.uid);
			return;
		}
		if (event.key === collapseKey && node.expandable && node.isExpanded) {
			event.preventDefault();
			this.toggleNode(node);
			return;
		}
	}

	private focusTreeItem(uid: string | undefined): void {
		if (!uid) return;
		this.element.nativeElement
			.querySelector<HTMLElement>(`[data-tree-node="${CSS.escape(uid)}"]`)
			?.focus();
	}
	navigateTo(node: TreeNode): void {
		const select = this.selectDocument();
		if (select) {
			select(node.document);
			return;
		}
		const path = documentUrl(node.document);
		const navigate = this.navigate();
		if (navigate) navigate(path);
		else void this.router.navigateByUrl(path);
	}
	labelFor(document: any): string {
		if (document.path === '/') return this.messages.text('browse.root', 'Root');
		return document.title || document.properties?.['dc:title'] || document.name || document.uid;
	}
	more(node: TreeNode): void {
		if (!node.expandable || node.isLoading) return;
		this.tasks.run(() => this.loadChildren(node, node.loaded));
	}
	private async loadChildren(node: TreeNode, append = false): Promise<void> {
		const generation = this.generation;
		const page = append ? node.page + 1 : 0;
		node.isLoading = true;
		node.error = '';
		this.cdr.markForCheck();
		try {
			const result = await firstValueFrom(
				this.browser
					.getTreeChildren(node.document.uid, page, this.repository())
					.pipe(takeUntil(this.cancelled)),
			);
			if (generation !== this.generation || this.destroyRef.destroyed) return;
			const known = new Set(append ? node.children.map((child) => child.document.uid) : []);
			const children = (result.entries ?? [])
				.filter((doc: any) => !known.has(doc.uid))
				.map((doc: any) => this.buildNode(doc, node.level + 1));
			node.children = append ? [...node.children, ...children] : children;
			node.loaded = true;
			node.page = page;
			node.hasMore = result.isNextPageAvailable === true && children.length > 0;
		} catch {
			if (generation === this.generation && !this.destroyRef.destroyed)
				node.error = 'Folders could not be loaded. Retry to continue.';
		} finally {
			node.isLoading = false;
			this.cdr.markForCheck();
		}
	}
}
