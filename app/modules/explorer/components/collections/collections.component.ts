import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectorRef,
	Component,
	Inject,
	OnDestroy,
	Optional,
	ChangeDetectionStrategy,
} from '@angular/core';
import {
	UntypedFormBuilder,
	UntypedFormGroup,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { Router } from '@angular/router';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { animations } from 'app/shared.constants';
import { ToastrService } from 'ngx-toastr';
import { catchError, map, of, Subject, switchMap, takeUntil, throwError } from 'rxjs';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgTemplateOutlet } from '@angular/common';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { TimeagoModule } from 'ngx-timeago';
import { documentUrl } from 'app/helpers/document-route';

@Component({
	selector: 'nx-collections',
	templateUrl: './collections.component.html',
	styleUrls: ['./collections.component.scss'],
	animations: [
		animations.horizontalInOutAnimation,
		animations.itemsAnimation,
		animations.listAnimation,
	],
	imports: [
		WebUiNumberPipe,
		FontAwesomeModule,
		NgTemplateOutlet,
		FormsModule,
		ReactiveFormsModule,
		TooltipDirective,
		TimeagoModule,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionsComponent implements OnDestroy {
	private readonly uiCollectionsComponentMessages = injectUiMessages(RuntimeUiMessages);

	allDocumentCollections: any[] = [];
	loading = true;
	form?: UntypedFormGroup | undefined;

	private destroy$ = new Subject();

	// --------------------------------------------------------------------------------------------------
	constructor(
		@Inject('documents') public documents: any[],
		@Inject('editMode') @Optional() public editMode: boolean,
		@Inject('collectionSelected') @Optional() public callback: any,
		private readonly fb: UntypedFormBuilder,
		private readonly documentCollectionsService: DocumentCollectionsService,
		private readonly toastrService: ToastrService,
		private readonly router: Router,
		private readonly cdr: ChangeDetectorRef,
	) {
		this.form = this.fb.group({
			title: [null, [Validators.required, Validators.minLength(2)]],
		});

		// This popover is the view that lists the collections: it loads the list when it opens and
		// follows later changes to it.
		this.documentCollectionsService
			.loadCollections()
			.pipe(takeUntil(this.destroy$))
			.subscribe((x) => this.showCollections(x));
		this.documentCollectionsService.documentCollectionsUpdated$
			.pipe(takeUntil(this.destroy$))
			.subscribe((x) => this.showCollections(x));

		this.documentCollectionsService.documentsAddedToCollection$
			.pipe(takeUntil(this.destroy$))
			.subscribe((x) => {
				const collection = this.allDocumentCollections.find(
					(y) =>
						y.uid === x.collectionUid &&
						(x.repository === undefined || (y.repository ?? 'default') === x.repository),
				);
				if (collection) {
					collection.totalCount = x.collectionTotalCount;
					this.cdr.markForCheck();
				}
			});

		this.documentCollectionsService.documentsRemovedFromCollection$
			.pipe(takeUntil(this.destroy$))
			.subscribe((x) => {
				const collection = this.allDocumentCollections.find(
					(y) =>
						y.uid === x.collectionUid &&
						(x.repository === undefined || (y.repository ?? 'default') === x.repository),
				);
				if (collection && x.collectionTotalCount !== undefined) {
					collection.totalCount = x.collectionTotalCount;
					this.cdr.markForCheck();
				}
			});
	}

	private showCollections(collections: any[]): void {
		this.allDocumentCollections = collections;
		this.loading = false;
		this.cdr.markForCheck();
	}

	// --------------------------------------------------------------------------------------------------
	collectionSelected(collection: any) {
		if (this.callback) this.callback(collection);

		if (this.editMode) this.addToCollection(collection);
		else this.router.navigateByUrl(documentUrl(collection));
	}

	// --------------------------------------------------------------------------------------------------
	addToCollection(collection?: any) {
		const observable = collection
			? of(collection.uid)
			: this.documentCollectionsService.createCollection(this.form?.get('title')?.value).pipe(
					catchError((err) => {
						this.toastrService.error(
							this.uiCollectionsComponentMessages.format(
								'app.notices.failed-to-create-the-value-collection-4a1517',
								{ value0: this.form?.get('title')?.value },
								'Failed to create the “{value0}” collection.',
							),
							this.uiCollectionsComponentMessages.text(
								'app.notices.error-creating-collection-f0f886',
								'Error creating collection',
							),
							{ enableHtml: false },
						);

						return throwError(() => new Error(err));
					}),
					map((x: any) => x.uid),
				);

		const documentUids = this.documents.map((x) => x.uid);

		observable
			.pipe(
				switchMap((collectionUid: string) =>
					collection?.type === 'Favorites'
						? this.documentCollectionsService.toggleFavoriteDocument(documentUids, true)
						: this.documentCollectionsService.addToCollection(documentUids, collectionUid),
				),
				catchError((err) => {
					this.toastrService.error(
						this.uiCollectionsComponentMessages.format(
							'app.notices.failed-to-add-the-specified-documents-to-the-74a129',
							{ value0: collection?.title || this.form?.get('title')?.value },
							'Failed to add the specified documents to the “{value0}” collection.',
						),
						this.uiCollectionsComponentMessages.text(
							'app.notices.error-updating-collection-48250e',
							'Error updating collection',
						),
						{ enableHtml: false },
					);

					return throwError(() => new Error(err));
				}),
			)
			.subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	trackByFn = (collection: any) => collection.uid;

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.destroy$.next(0);
	}
}
