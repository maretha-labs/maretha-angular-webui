import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectorRef,
	Component,
	Input,
	OnChanges,
	OnDestroy,
	computed,
	ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
	documentViewParameter,
	DocumentViewChange,
	DocumentViewContext,
	DocumentViewsComponent,
} from '@maretha/webui-sdk';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from 'app/helpers/auth.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { ToastService } from 'app/helpers/toast.service';
import { map, Subject, takeUntil } from 'rxjs';
import { GenericFolderishViewerComponent } from '../generic-folderish-viewer/generic-folderish-viewer.component';

@Component({
	selector: 'nx-generic-type-viewer',
	templateUrl: './generic-type-viewer.component.html',
	styleUrls: ['./generic-type-viewer.component.scss'],
	imports: [GenericFolderishViewerComponent, DocumentViewsComponent, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenericTypeViewerComponent implements OnChanges, OnDestroy {
	private readonly uiGenericTypeViewerComponentMessages = injectUiMessages(RuntimeUiMessages);

	private destroy$ = new Subject();

	@Input() document: any;
	loading = true;
	viewContext: DocumentViewContext = { document: null, noEdit: false };
	get navigationPath(): string {
		return this.router.url.split(/[?#]/, 1)[0];
	}
	get documentMatchesNavigation(): boolean {
		const match = this.navigationPath.match(
			/^\/browse\/(?:documents|collections)(?:\/([^/]+))?\/?$/,
		);
		if (!match) return true;
		if (!match[1]) return !this.document || this.document.path === '/';
		try {
			return this.document?.uid === decodeURIComponent(match[1]);
		} catch {
			return false;
		}
	}
	readonly selectedView = toSignal(this.route.queryParamMap.pipe(map(documentViewParameter)), {
		initialValue: documentViewParameter(this.route.snapshot.queryParamMap),
	});
	readonly user = computed(() => this.authService.userInfo()?.id);

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly router: Router,
		private readonly authService: AuthService,
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly toastrService: ToastService,
		private readonly cdr: ChangeDetectorRef,
		private readonly route: ActivatedRoute,
	) {
		documentsManagerService.fetchingDocument$.pipe(takeUntil(this.destroy$)).subscribe(() => {
			this.loading = true;
			this.cdr.markForCheck();
		});

		documentsManagerService.documentFetched$.pipe(takeUntil(this.destroy$)).subscribe(() => {
			this.loading = false;
			this.cdr.markForCheck();
		});

		documentsManagerService.documentsUpdated$.pipe(takeUntil(this.destroy$)).subscribe(() => {
			this.loading = false;
			this.cdr.markForCheck();
		});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnChanges(): void {
		const uid = this.document?.uid;
		this.viewContext = {
			document: this.document ?? null,
			noEdit: false,
			refreshDocument: () => {
				if (!uid || this.documentsManagerService.documentInfo?.uid !== uid) return;
				this.documentsManagerService
					.reloadDocument(uid)
					.pipe(takeUntil(this.destroy$))
					.subscribe({
						error: () =>
							this.toastrService.error(
								this.uiGenericTypeViewerComponentMessages.text(
									'app.notices.changes-were-saved-but-the-document-could-not-7a41dc',
									'Changes were saved, but the document could not be refreshed.',
								),
								undefined,
								{ enableHtml: false },
							),
					});
			},
		};
	}

	viewChanged(change: DocumentViewChange): void {
		if (this.route.snapshot.queryParamMap.get('view') === change.viewId) return;
		void this.router.navigate([], {
			relativeTo: this.route,
			queryParams: { view: change.viewId, p: null },
			queryParamsHandling: 'merge',
			preserveFragment: true,
			replaceUrl: change.replaceUrl,
		});
	}

	// --------------------------------------------------------------------------------------------------
	toggleLock() {
		this.documentsManagerService.toggleLock(this.document)?.subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.destroy$.next(null);
	}
}
