import { documentRouteActive } from 'app/helpers/document-route';
import { usesStandardDocumentHeader } from '../helpers/standard-document-surfaces';
import { ChangeDetectorRef, Component, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { filter, Subject, takeUntil } from 'rxjs';
import { DocumentsManagerService } from '../helpers/documents-manager.service';
import { DocumentSearchService } from 'app/modules/search/helpers/document-search.service';
import { ToastService } from 'app/helpers/toast.service';
import { BsModalService } from 'ngx-bootstrap/modal';
import { DestinationCreateDialogComponent } from 'app/components/quick-search/destination-create-dialog.component';
import { NavigationEnd, Router } from '@angular/router';
import { DocumentNavigationBarComponent } from '../components/document-navigation-bar/document-navigation-bar.component';
import { DocumentToolbarComponent } from '../components/document-toolbar/document-toolbar.component';
import { DragAndDropDirective } from '../../../directives/drag-and-drop.directive';
import { GenericTypeViewerComponent } from '../components/viewers/generic-type-viewer/generic-type-viewer.component';
import { GenericFolderishViewerComponent } from '../components/viewers/generic-folderish-viewer/generic-folderish-viewer.component';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
	selector: 'nx-explorer',
	templateUrl: './explorer.component.html',
	styleUrls: ['./explorer.component.scss'],
	imports: [
		DocumentNavigationBarComponent,
		DocumentToolbarComponent,
		DragAndDropDirective,
		GenericTypeViewerComponent,
		GenericFolderishViewerComponent,
		FontAwesomeModule,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerComponent implements OnDestroy {
	private readonly destroy$ = new Subject();

	readonly document = this.documentsManagerService.documentFetched;
	readonly searchPaneOpen = this.documentSearchService.searchPaneVisibility;
	fileOver = false;
	allowedMimeTypes: string[] = [];
	loading = false;
	documentBrowserRouteActive = true;
	get compactDocumentHeader(): boolean {
		return (
			this.documentBrowserRouteActive &&
			!!this.document() &&
			(!this.document()?.ng?.isFolder || usesStandardDocumentHeader(this.document()))
		);
	}

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly documentSearchService: DocumentSearchService,
		private readonly toastrService: ToastService,
		private readonly modalService: BsModalService,
		private readonly router: Router,
		private readonly cdr: ChangeDetectorRef,
	) {
		this.router.events
			.pipe(filter((e) => e instanceof NavigationEnd && !this.searchPaneOpen()))
			.subscribe((_e: any) => {
				this.documentBrowserRouteActive = documentRouteActive(router.url);
				this.cdr.markForCheck();
			});

		documentsManagerService.fetchingDocuments$
			.pipe(takeUntil(this.destroy$))
			.subscribe((x: any) => {
				this.loading = x;
				this.cdr.markForCheck();
			});
	}

	// --------------------------------------------------------------------------------------------------
	filesDropped(files: any) {
		const document = this.document();
		if (!document?.ng.subTypes?.length || !files.length) return;

		// Stock opens its import for the folder with the dropped files, which start uploading.
		this.modalService.show(DestinationCreateDialogComponent, {
			class: 'modal-lg',
			ignoreBackdropClick: true,
			keyboard: false,
			initialState: {
				initialPath: String(document.path ?? '/'),
				repository: document.repository ?? 'default',
				initialView: 'import',
				initialFiles: Array.from(files as ArrayLike<File>),
			},
		});
	}

	// --------------------------------------------------------------------------------------------------
	filesDragged(fileOver: any) {
		this.fileOver = fileOver;
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.destroy$.next(0);
	}
}
