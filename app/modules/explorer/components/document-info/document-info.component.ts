import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectorRef,
	Component,
	Injector,
	Input,
	OnDestroy,
	OnInit,
	ChangeDetectionStrategy,
} from '@angular/core';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { animations } from 'app/shared.constants';
import { BsModalRef, BsModalService, ModalOptions } from 'ngx-bootstrap/modal';
import { RetentionRulePickerComponent } from 'app/modules/settings/components/retention-rule-picker/retention-rule-picker.component';
import { ToastrService } from 'ngx-toastr';
import { DocumentAttachmentsService } from '../../helpers/document-attachments.service';
import { DocumentSnapshotsService } from '../../helpers/document-snapshots.service';
import { filter, forkJoin, map, Subject, takeUntil } from 'rxjs';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { AuthService } from 'app/helpers/auth.service';
import { environment } from 'environments/environment';
import { InternalPublicationComponent } from '../publications/internal-publication/internal-publication.component';
import { AutomationsService } from '../../helpers/automations.service';
import { TabsetComponent, TabDirective, TabHeadingDirective } from 'ngx-bootstrap/tabs';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { LazyLoadDirective } from '../../../../directives/lazy-load.directive';
import { ContributorsComponent } from '../contributors/contributors.component';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { CollapsibleComponent } from '../../../shared/components/collapsible/collapsible.component';
import { PopoverDirective } from 'ngx-bootstrap/popover';
import { ClickOutsideDirective } from '../../../../directives/click-outside.directive';
import { DocumentPermissionsComponent } from '../document-permissions/document-permissions.component';
import { DocumentActivityComponent } from '../document-activity/document-activity.component';
import { NgxJsonViewerModule } from 'ngx-json-viewer';
import { NgComponentOutlet } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FileSizePipe } from 'app/pipes/file-size.pipe';
import { NgxTranslateCutModule } from 'ngx-translate-cut';
import { TimeagoModule } from 'ngx-timeago';
import { DocumentLinkPipe } from 'app/helpers/document-route';

@Component({
	selector: 'nx-document-info',
	templateUrl: './document-info.component.html',
	styleUrls: ['./document-info.component.scss'],
	animations: [animations.horizontalInOutAnimation],
	imports: [
		TabsetComponent,
		TabDirective,
		FontAwesomeModule,
		LazyLoadDirective,
		ContributorsComponent,
		TooltipDirective,
		CollapsibleComponent,
		RouterLink,
		PopoverDirective,
		ClickOutsideDirective,
		DocumentPermissionsComponent,
		DocumentActivityComponent,
		TabHeadingDirective,
		NgxJsonViewerModule,
		NgComponentOutlet,
		WebUiDatePipe,
		TranslateModule,
		FileSizePipe,
		NgxTranslateCutModule,
		TimeagoModule,
		DocumentLinkPipe,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentInfoComponent implements OnInit, OnDestroy {
	private readonly uiDocumentInfoComponentMessages = injectUiMessages(RuntimeUiMessages);

	private readonly destroy$ = new Subject();

	@Input() document: any | null;
	permissionsTabActivated = false;
	activityTabActivated = false;
	lastContributors: any[] = [];
	lastModifications: any[] = [];
	showDevTab = true;
	documentSnapshotsPopover = false;
	user: string | undefined;
	retentionAddon = environment.addons.retention;
	internalPublicationsComponent = InternalPublicationComponent;
	internalPublicationsPopover = false;
	hideAdvancedFeatures = true;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly bsModalRef: BsModalRef,
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly documentAttachmentsService: DocumentAttachmentsService,
		private readonly documentsSnapshotsService: DocumentSnapshotsService,
		private readonly automationsService: AutomationsService,
		private readonly modalService: BsModalService,
		private readonly toastrService: ToastrService,
		private readonly authService: AuthService,
		private readonly router: Router,
		public injector: Injector,
		private readonly cdr: ChangeDetectorRef,
	) {
		this.router.events
			.pipe(
				filter((e) => e instanceof NavigationStart),
				takeUntil(this.destroy$),
			)
			.subscribe(() => this.close());

		authService.userInfoUpdated$.pipe(takeUntil(this.destroy$)).subscribe((x) => {
			this.user = x?.id;
			this.cdr.markForCheck();
		});

		documentsSnapshotsService.snapshotCreated$
			.pipe(takeUntil(this.destroy$))
			.subscribe(() => this.loadSnapshots());

		documentsManagerService.documentsUpdated$
			.pipe(
				takeUntil(this.destroy$),
				map((x) => {
					const document = x.find((y) => y.uid === this.document.uid);

					if (!document) return this.document;

					// A document update is not a version event: keep the versions already loaded
					// (`snapshotCreated$` and `getDocumentInfo` own the version requests).
					const ng = this.document?.ng ?? {};
					return ng.snapshots
						? this.mapSnapshotsToDocument(document, {
								snapshots: ng.snapshots,
								nextMajorVersion: ng.nextMajorVersion,
								nextMinorVersion: ng.nextMinorVersion,
							})
						: document;
				}),
			)
			.subscribe((x) => {
				this.document = x;
				this.cdr.markForCheck();
			});

		automationsService.documentPublished$
			.pipe(
				takeUntil(this.destroy$),
				filter((x) => x.documentUid === this.document.uid),
			)
			.subscribe(() => {
				this.getDocumentInfo();

				this.internalPublicationsPopover = false;
				this.cdr.markForCheck();

				this.toastrService.success(
					this.uiDocumentInfoComponentMessages.text(
						'app.notices.a-copy-of-the-document-was-published-to-the-s-9821cf',
						'A copy of the document was published to the specified section.',
					),
					this.uiDocumentInfoComponentMessages.text(
						'app.notices.document-published-6ffc86',
						'Document published',
					),
					{ enableHtml: false },
				);
			});
	}

	// --------------------------------------------------------------------------------------------------
	close() {
		this.bsModalRef.hide();
	}

	// --------------------------------------------------------------------------------------------------
	showContributors() {
		this.injector = Injector.create({
			providers: [{ provide: 'document', useValue: this.document }],
			parent: this.injector,
		});
	}

	// --------------------------------------------------------------------------------------------------
	toggleNotification() {
		this.documentsManagerService.toggleNotification(this.document)?.subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	toggleLock() {
		this.documentsManagerService.toggleLock(this.document)?.subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	toggleLegalHold(reason?: string) {
		this.documentsManagerService.toggleLegalHold(this.document, reason)?.subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	applyRetentionRule() {
		const initialState: ModalOptions = {
			initialState: {
				documentUid: this.document.uid,
				documentType: this.document.type,
			},
		};

		const bsModalRef = this.modalService.show(RetentionRulePickerComponent, initialState);

		bsModalRef.content?.save$.subscribe((document) =>
			this.documentsManagerService.reloadDocument(document.uid),
		);
	}

	// --------------------------------------------------------------------------------------------------
	// TODO: wire the retention-period extension flow (template handler at line 586)
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	extendRetentionPeriod() {}

	// --------------------------------------------------------------------------------------------------
	showInternalPublicationsPopover() {
		this.injector = Injector.create({
			providers: [{ provide: 'document', useValue: this.document }],
			parent: this.injector,
		});

		this.internalPublicationsPopover = true;
	}

	// --------------------------------------------------------------------------------------------------
	createSnapshot(major = false) {
		this.documentsSnapshotsService.createSnapshot(this.document.uid, major).subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	// Get detailed info about the current document
	private getDocumentInfo(documentUid?: string) {
		forkJoin({
			documentInfo: this.documentsManagerService.getDocumentInfo(documentUid || this.document.uid),
			documentSnapshots: this.documentsSnapshotsService.getSnapshots(
				documentUid || this.document.uid,
			),
		}).subscribe((response) => {
			this.document = this.mapSnapshotsToDocument(
				response.documentInfo,
				response.documentSnapshots,
			);
			this.cdr.markForCheck();
		});
	}

	// --------------------------------------------------------------------------------------------------
	private loadSnapshots() {
		if (!this.document.ng.versionable) return;

		this.documentsSnapshotsService.getSnapshots(this.document.uid).subscribe((x) => {
			this.mapSnapshotsToDocument(this.document, x);
			this.cdr.markForCheck();
		});
	}

	// --------------------------------------------------------------------------------------------------
	private mapSnapshotsToDocument(document: any, snapshots: any) {
		if (!document) return document;

		document.ng.snapshots = snapshots.snapshots;
		document.ng.nextMajorVersion = snapshots.nextMajorVersion;
		document.ng.nextMinorVersion = snapshots.nextMinorVersion;
		document.ng.canCreateSnapshot =
			!document.isRecord &&
			!document.isVersion &&
			document.ng.versionable &&
			document.isCheckedOut &&
			snapshots.snapshots.every((y: any) => y.lastModified !== document.lastModified);

		return document;
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		if (!this.document) this.document = this.documentsManagerService.documentInfo;

		this.getDocumentInfo();
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.destroy$.next(null);
	}
}
