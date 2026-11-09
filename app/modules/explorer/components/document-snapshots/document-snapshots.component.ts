import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectorRef,
	Component,
	Inject,
	Input,
	OnDestroy,
	ChangeDetectionStrategy,
} from '@angular/core';
import { firstValueFrom, Subject, switchMap, takeUntil } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { DocumentSnapshotsService } from '../../helpers/document-snapshots.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { BsModalService, ModalOptions } from 'ngx-bootstrap/modal';
import { DocumentSnapshotComparisonComponent } from '../viewers/document-snapshot-comparison/document-snapshot-comparison.component';
import { Router } from '@angular/router';
import {
	BsDropdownDirective,
	BsDropdownToggleDirective,
	BsDropdownMenuDirective,
} from 'ngx-bootstrap/dropdown';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgClass } from '@angular/common';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { TimeagoModule } from 'ngx-timeago';
import {
	DocumentProjectionName,
	DocumentProjectionRegistry,
	documentProjectionContext,
} from '@maretha/webui-sdk';
import { NgComponentOutlet } from '@angular/common';
import { documentUrl } from 'app/helpers/document-route';
import { hasPermission } from 'app/helpers/document-permissions';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

@Component({
	selector: 'nx-document-snapshots',
	templateUrl: './document-snapshots.component.html',
	styleUrls: ['./document-snapshots.component.scss'],
	imports: [
		FormsModule,
		BsDropdownDirective,
		FontAwesomeModule,
		BsDropdownToggleDirective,
		BsDropdownMenuDirective,
		NgClass,
		TooltipDirective,
		TimeagoModule,
		NgComponentOutlet,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentVersionsComponent implements OnDestroy {
	private readonly uiDocumentVersionsComponentConfirmations = injectUiMessages(RuntimeUiMessages);

	private destroy$ = new Subject();
	originalDocument: any;
	@Input() noEdit = false;
	@Input() compact = false;
	// Stock nuxeo-document-create-version defaults to a major version.
	versionKind: 'minor' | 'major' = 'major';
	versionSaving = false;
	versionError = '';
	private disposed = false;
	get nextMinorVersion(): string {
		return `${this.document.properties?.['uid:major_version'] ?? 0}.${Number(this.document.properties?.['uid:minor_version'] ?? 0) + 1}`;
	}
	get nextMajorVersion(): string {
		return `${Number(this.document.properties?.['uid:major_version'] ?? 0) + 1}.0`;
	}
	async createCompactVersion(dialog: HTMLDialogElement): Promise<void> {
		if (!this.canCreateVersion || this.versionSaving) return;
		this.versionSaving = true;
		this.versionError = '';
		const document = this.document;
		try {
			await firstValueFrom(
				this.documentsSnapshotsService
					.createSnapshot(
						document.uid,
						this.versionKind === 'major',
						document.repository ?? 'default',
					)
					.pipe(takeUntil(this.destroy$)),
			);
			if (this.disposed) return;
			dialog.close();
			await firstValueFrom(
				this.documentsManagerService
					.reloadDocument(document.uid, document.repository ?? 'default')
					.pipe(takeUntil(this.destroy$)),
			);
		} catch {
			if (!this.disposed)
				this.versionError = this.uiDocumentVersionsComponentConfirmations.text(
					'app.state.the-version-could-not-be-created-please-try-a-71fe33',
					'The version could not be created. Please try again.',
				);
		} finally {
			this.versionSaving = false;
			if (!this.disposed) this.cdr.markForCheck();
		}
	}
	versionLabel(document: any): string {
		const properties = document?.properties ?? {};
		return String(
			document?.versionLabel ??
				(properties['uid:major_version'] != null && properties['uid:minor_version'] != null
					? `${properties['uid:major_version']}.${properties['uid:minor_version']}`
					: (document?.ng?.version ?? '')),
		);
	}
	versionAuthor(document: any): string {
		const author = document?.properties?.['dc:lastContributor'];
		return String(author?.id ?? author ?? document?.ng?.lastModifiedBy ?? '');
	}
	get canCreateVersion(): boolean {
		return (
			!this.noEdit &&
			!this.document.isTrashed &&
			!this.document.isVersion &&
			!this.document.isProxy &&
			!this.document.hasLegalHold &&
			!this.document.retainUntil &&
			!this.document.facets?.includes('Immutable') &&
			!this.document.isRecord &&
			!this.document.isUnderRetentionOrLegalHold &&
			hasPermission(this.document, 'WriteVersion')
		);
	}
	get canRestoreVersion(): boolean {
		const doc = this.originalDocument || this.document;
		return (
			!this.noEdit &&
			!doc.isTrashed &&
			!doc.isRecord &&
			!doc.isUnderRetentionOrLegalHold &&
			hasPermission(doc, 'WriteVersion')
		);
	}

	// --------------------------------------------------------------------------------------------------
	constructor(
		@Inject('document') public document: any,
		private readonly documentsSnapshotsService: DocumentSnapshotsService,
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly modalService: BsModalService,
		private readonly router: Router,
		private readonly cdr: ChangeDetectorRef,
		private readonly projections: DocumentProjectionRegistry,
		private readonly confirmDialog: ConfirmDialogService,
	) {
		if (document.ng.versionable && !document.ng.snapshots)
			this.documentsSnapshotsService
				.getSnapshots(document.uid, document.repository ?? 'default')
				.subscribe((x) => {
					document.ng.snapshots = x.snapshots;
					document.ng.nextMajorVersion = x.nextMajorVersion;
					document.ng.nextMinorVersion = x.nextMinorVersion;
					document.ng.canCreateSnapshot =
						!document.isRecord &&
						!document.isVersion &&
						document.ng.versionable &&
						document.isCheckedOut &&
						x.snapshots.every((y: any) => y.lastModified !== document.lastModified);
					this.cdr.markForCheck();
				});

		if (document.isVersion)
			this.documentsSnapshotsService
				.getSnapshotOriginalDocument(document.versionableId)
				.subscribe((x) => {
					this.originalDocument = x;
					this.cdr.markForCheck();
				});
	}

	projection(name: DocumentProjectionName) {
		this.projections.revision();
		return this.projections.resolve(name, this.projectionContext());
	}

	projectionContext() {
		return documentProjectionContext({
			document: this.document,
			noEdit: !this.document?.ng?.canWrite,
			value: this.document?.ng?.snapshots,
		});
	}

	// --------------------------------------------------------------------------------------------------
	createSnapshot(major = false) {
		if (!this.canCreateVersion) return;
		this.documentsSnapshotsService
			.createSnapshot(this.document.uid, major)
			.pipe(switchMap(() => this.documentsManagerService.reloadDocument(this.document.uid)))
			.subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	async restoreSnapshot(document: any): Promise<void> {
		if (!this.canRestoreVersion) return;
		const confirmed = await this.confirmDialog.confirm({
			titleKey: 'versions.restore',
			title: 'Restore',
			messageKey: 'versions.restore.confirm',
			message: 'Restore this version? The current working copy will be replaced.',
			confirmKey: 'versions.restore',
			confirm: 'Restore',
			destructive: true,
		});
		if (!confirmed || !this.canRestoreVersion) return;
		const backupBeforeRestore =
			document.ng.canCreateSnapshot &&
			(await this.confirmDialog.confirm({
				titleKey: 'versions.restore',
				title: 'Restore',
				messageKey: 'app.notices.do-you-wish-to-create-a-snapshot-of-the-curre-3baa59',
				message:
					'Do you wish to create a snapshot of the current document before restoring it to a previous version?',
				confirmKey: 'dialog.yes',
				confirm: 'Yes',
				declineKey: 'dialog.no',
				decline: 'No',
			}));
		this.documentsSnapshotsService.restoreSnapshot(document.uid, backupBeforeRestore).subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	loadSnapshot(document: any) {
		this.router.navigateByUrl(
			documentUrl(
				document.ng.version === this.originalDocument?.ng.version
					? this.originalDocument
					: document,
			),
		);
	}

	// --------------------------------------------------------------------------------------------------
	compareToSnapshot(snapshot: any) {
		this.documentsSnapshotsService.getSnapshot(snapshot.uid).subscribe((x) => {
			const initialState: ModalOptions = {
				initialState: {
					documents: [this.document, x],
					snapshots: this.document.ng.snapshots,
				},
				class: 'modal-xl',
			};

			this.modalService.show(DocumentSnapshotComparisonComponent, initialState);
		});
	}

	// --------------------------------------------------------------------------------------------------
	trackByFn = (index: number, entry: any) => entry.uid;

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy() {
		this.disposed = true;
		this.destroy$.next(0);
	}
}
