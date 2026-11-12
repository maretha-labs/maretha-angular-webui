import { documentTypeIcon, documentTypeIconUrl } from 'app/helpers/document-type-presentation';
import { WebUiIconComponent } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	AfterViewInit,
	ChangeDetectorRef,
	Component,
	ElementRef,
	Injector,
	ChangeDetectionStrategy,
	Input,
	OnDestroy,
	ViewChild,
} from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterLink } from '@angular/router';
import { AuthService } from 'app/helpers/auth.service';
import { BsModalService, BsModalRef, ModalOptions } from 'ngx-bootstrap/modal';
import { filter } from 'rxjs';
import { animations } from 'app/shared.constants';
import { LayoutService } from 'app/modules/explorer/helpers/layout.service';
import { DocumentInfoComponent } from 'app/modules/explorer/components/document-info/document-info.component';
import { HistoryComponent } from '../history/history.component';
import { AutomationsService } from 'app/modules/explorer/helpers/automations.service';
import { DocumentHistoryService } from 'app/modules/explorer/helpers/document-history.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { dialogLayoutHost } from 'app/modules/explorer/helpers/dialog-layout-host';
import { DocumentSearchService } from 'app/modules/search/helpers/document-search.service';
import { DocumentCollectionsService } from '../../helpers/document-collections.service';
import { CollectionsComponent } from '../collections/collections.component';
import { DocumentTrashService } from '../../helpers/document-trash.service';
import { DocumentAttachmentsService } from '../../helpers/document-attachments.service';
import { DocumentClipboardService } from '../../helpers/document-clipboard.service';
import { ClipboardComponent } from '../clipboard/clipboard.component';
import { ToastService } from 'app/helpers/toast.service';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FormsModule } from '@angular/forms';
import { AutofocusDirective } from '../../../../directives/autofocus.directive';
import { ClickOutsideDirective } from '../../../../directives/click-outside.directive';
import {
	DocumentLayoutRegistry,
	documentLayoutContext,
	provideSuggestionScope,
} from '@maretha/webui-sdk';
import { documentRouteActive, documentUrl, DocumentLinkPipe } from 'app/helpers/document-route';

@Component({
	selector: 'nx-document-navigation-bar',
	templateUrl: './document-navigation-bar.component.html',
	styleUrls: ['./document-navigation-bar.component.scss'],
	animations: [
		animations.horizontalInOutAnimation,
		animations.itemsAnimation,
		animations.listAnimation,
	],
	imports: [
		WebUiIconComponent,
		RouterLink,
		FontAwesomeModule,
		FormsModule,
		AutofocusDirective,
		ClickOutsideDirective,
		DocumentLinkPipe,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentNavigationBarComponent implements AfterViewInit, OnDestroy {
	readonly documentTypeIcon = documentTypeIcon;
	readonly documentTypeIconUrl = documentTypeIconUrl;
	@ViewChild('ancestorsNav') private ancestorsNav?: ElementRef<HTMLElement>;
	/** Leading ancestors folded into the stock "..." item because the breadcrumb overflowed. */
	collapsedBreadcrumbs = 0;
	private breadcrumbResize?: ResizeObserver;
	private breadcrumbFrame = 0;
	/** The ancestors (every breadcrumb entry but the current document), minus the collapsed ones. */
	visibleAncestors(): any[] {
		const ancestors = this.breadcrumbs.slice(0, Math.max(0, this.breadcrumbs.length - 1));
		return ancestors.slice(Math.min(this.collapsedBreadcrumbs, Math.max(0, ancestors.length - 1)));
	}
	ngAfterViewInit(): void {
		if (typeof ResizeObserver === 'undefined') return;
		this.breadcrumbResize = new ResizeObserver(() => this.fitBreadcrumbs(true));
		const nav = this.ancestorsNav?.nativeElement;
		if (nav) this.breadcrumbResize.observe(nav);
	}
	ngOnDestroy(): void {
		this.breadcrumbResize?.disconnect();
		if (this.breadcrumbFrame) cancelAnimationFrame(this.breadcrumbFrame);
	}
	/**
	 * Stock nuxeo-breadcrumb: drop the first ancestor while the row overflows (keeping at least
	 * the direct parent) and show "..." in its place; start over when the row grows again.
	 */
	fitBreadcrumbs(reset = false): void {
		if (typeof requestAnimationFrame === 'undefined') return;
		if (this.breadcrumbFrame) cancelAnimationFrame(this.breadcrumbFrame);
		if (reset && this.collapsedBreadcrumbs) {
			this.collapsedBreadcrumbs = 0;
			this.cdr.detectChanges();
		}
		this.breadcrumbFrame = requestAnimationFrame(() => {
			this.breadcrumbFrame = 0;
			const nav = this.ancestorsNav?.nativeElement;
			if (!nav) return;
			const ancestors = Math.max(0, this.breadcrumbs.length - 1);
			let guard = ancestors;
			while (
				nav.scrollWidth > nav.clientWidth + 1 &&
				this.collapsedBreadcrumbs < ancestors - 1 &&
				guard-- > 0
			) {
				this.collapsedBreadcrumbs++;
				this.cdr.detectChanges();
			}
			this.cdr.markForCheck();
		});
	}

	@Input() compact = false;
	clipboardComponent = ClipboardComponent;
	clipboardPopover = false;
	collectionsComponent = CollectionsComponent;
	collectionsPopover = false;
	bookmarkComponent = CollectionsComponent;
	bookmarkPopover = false;
	historyComponent = HistoryComponent;
	historyPopover = false;
	isAuthenticated = false;
	breadcrumbs: any[] = [];
	showDetails = false;
	document: any;
	documentHistory: any[] = [];
	uid: string | null = null;
	documentBrowserRouteActive = false;
	browserRouteActive = false;
	searchPaneOpen = false;
	searchPaneOpenForCurrentLocation = true;
	documentsCount = 0;
	showOnlyTrashedDocuments = false;
	documentsMaxCount = this.documentsManagerService.maxTotalCount;
	documentCollections: any[] = [];
	documentInputPath = '';

	// --------------------------------------------------------------------------------------------------
	constructor(
		public injector: Injector,
		private readonly authService: AuthService,
		private readonly router: Router,
		private readonly modalService: BsModalService,
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly documentHistoryService: DocumentHistoryService,
		private readonly documentCollectionsService: DocumentCollectionsService,
		private readonly documentSearchService: DocumentSearchService,
		private readonly documentTrashService: DocumentTrashService,
		private readonly documentAttachmentsService: DocumentAttachmentsService,
		private readonly documentClipboardService: DocumentClipboardService,
		private readonly automationsService: AutomationsService,
		private readonly layoutService: LayoutService,
		private readonly toastrService: ToastService,
		private readonly cdr: ChangeDetectorRef,
		private readonly layouts: DocumentLayoutRegistry,
	) {
		const updateRoute = () => {
			this.browserRouteActive = router.isActive('/browse', {
				paths: 'subset',
				matrixParams: 'ignored',
				fragment: 'ignored',
				queryParams: 'ignored',
			});
			this.documentBrowserRouteActive = documentRouteActive(router.url);
			this.cdr.markForCheck();
		};
		updateRoute();
		this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(updateRoute);

		this.router.events.pipe(filter((e) => e instanceof NavigationStart)).subscribe(() => {
			this.collectionsPopover = false;
			this.bookmarkPopover = false;
			this.clipboardPopover = false;
			this.historyPopover = false;
			this.cdr.markForCheck();
		});

		this.authService.userInfoUpdated$.subscribe((userInfo) => {
			this.isAuthenticated = !!userInfo;
			this.cdr.markForCheck();
		});

		documentsManagerService.fetchingDocuments$.subscribe(() => {
			this.showOnlyTrashedDocuments = this.documentsManagerService.showOnlyTrashedDocuments;
			this.cdr.markForCheck();
		});

		documentsManagerService.documentFetched$.subscribe((x: any) => {
			this.uid = x?.uid;
			this.document = documentsManagerService.documentInfo;
			this.documentsCount = 0;

			this.breadcrumbs = (
				documentsManagerService.documentInfo?.contextParameters?.breadcrumb?.entries || []
			).map((y: any) => ({
				title: y.title,
				uid: y.uid,
				path: y.path,
				repository: y.repository ?? x?.repository,
			}));
			this.collapsedBreadcrumbs = 0;
			this.cdr.markForCheck();
			this.fitBreadcrumbs();
		});

		documentsManagerService.documentsUpdated$.subscribe((_) => {
			this.documentsCount = documentsManagerService.totalCount;
			this.documentsMaxCount = this.documentsManagerService.maxTotalCount;
			this.cdr.markForCheck();
		});

		this.documentHistoryService.documentHistoryUpdated$.subscribe((x) => {
			this.documentHistory = x;

			this.historyPopover = false;
			this.cdr.markForCheck();
		});

		documentSearchService.searchPaneVisibilityChanged$.subscribe((x) => {
			this.searchPaneOpen = x;
			this.searchPaneOpenForCurrentLocation = this.searchPaneOpen
				? documentSearchService.searchParameters.location != undefined
				: true;
			this.cdr.markForCheck();
		});

		documentSearchService.searchParametersChanged$.subscribe((x) => {
			if (this.searchPaneOpen) {
				this.searchPaneOpenForCurrentLocation = x.location != undefined;
				this.cdr.markForCheck();
			}
		});

		documentClipboardService.documentsCopied$.subscribe(() => {
			this.clipboardPopover = false;
			this.cdr.markForCheck();
		});

		documentClipboardService.documentsMoved$.subscribe(() => {
			this.clipboardPopover = false;
			this.cdr.markForCheck();
		});

		documentCollectionsService.documentsAddedToCollection$.subscribe(() => {
			this.bookmarkPopover = false;
			this.cdr.markForCheck();
		});
	}

	// --------------------------------------------------------------------------------------------------
	clearHistory() {
		this.documentHistoryService.clear();
		this.historyPopover = false;
	}

	// --------------------------------------------------------------------------------------------------
	showHistory = () => (this.historyPopover = !this.historyPopover);

	// --------------------------------------------------------------------------------------------------
	bulkDownloadAsZip = () =>
		this.automationsService.bulkDownloadAsZip(
			this.uid!,
			this.document!.title!,
			this.document?.repository ?? 'default',
		);

	// --------------------------------------------------------------------------------------------------
	showDeletedDocuments() {
		this.documentsManagerService.showOnlyTrashedDocuments =
			!this.documentsManagerService.showOnlyTrashedDocuments;
	}

	// --------------------------------------------------------------------------------------------------
	addToCollection() {
		this.injector = Injector.create({
			providers: [
				{ provide: 'editMode', useValue: true },
				{ provide: 'documents', useValue: [this.document] },
				{ provide: 'collectionSelected', useValue: () => (this.bookmarkPopover = false) },
			],
			parent: this.injector,
		});
	}

	// --------------------------------------------------------------------------------------------------
	reload() {
		this.documentsManagerService.reloadDocument(this.uid!).subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	showCollections() {
		this.injector = Injector.create({
			providers: [
				{ provide: 'editMode', useValue: false },
				{ provide: 'documents', useValue: [] },
				{ provide: 'collectionSelected', useValue: () => (this.collectionsPopover = false) },
			],
			parent: this.injector,
		});
	}

	// --------------------------------------------------------------------------------------------------
	showDocumentInfo() {
		if (this.layoutService.showInfoPanel) return this.layoutService.toggleInfoPanel();

		const initialState: ModalOptions = {
			initialState: {},
			class: 'modal-lg',
			providers: [dialogLayoutHost(false)],
		};
		const context = documentLayoutContext({
			documentType: this.document?.type,
			mode: 'metadata',
			document: this.document,
		});
		const layout = this.layouts.resolve(context);
		if (layout?.disabled) return;
		initialState.initialState = { layoutContext: context };
		initialState.providers = [dialogLayoutHost(false), provideSuggestionScope(layout?.id ?? null)];
		const bsModalRef: BsModalRef = this.modalService.show(
			layout?.component ?? DocumentInfoComponent,
			initialState,
		);
		bsModalRef.content.closeBtnName = 'Close';
	}

	// --------------------------------------------------------------------------------------------------
	moveDocumentToTrash() {
		// The documents manager navigates to the readable parent when the viewed document is trashed.
		this.documentTrashService.moveDocumentsToTrash([this.document.uid]).subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	exportAsXml(document: any) {
		if (document) this.documentAttachmentsService.exportAsXml([document]).subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	exportAsPdf(document: any) {
		if (document) this.documentAttachmentsService.exportAsPdf([document]).subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	exportAsZip(document: any) {
		if (document) this.documentAttachmentsService.exportAsZip([document]).subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	showDocumentPathInput(_event: any) {
		this.documentInputPath = this.breadcrumbs[this.breadcrumbs.length - 1].path.substring(1);
	}

	// --------------------------------------------------------------------------------------------------
	goToPath(event: KeyboardEvent, documentPath: string) {
		if (event.key === 'Escape' || event.key === 'Enter') this.documentInputPath = '';

		if (
			event.key !== 'Enter' ||
			this.breadcrumbs[this.breadcrumbs.length - 1].path.substring(1) === documentPath
		)
			return;

		// The route fetches the document once; an unknown path lands on the not-found page.
		void this.router.navigateByUrl(
			documentUrl({
				path: `/${documentPath.replace(/^\/+/, '')}`,
				repository: this.document?.repository,
			}),
		);
	}
}
