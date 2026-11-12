import { WebUiMessages } from '@maretha/webui-sdk';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { AuthService } from 'app/helpers/auth.service';
import { environment } from 'environments/environment';
import { ToastService } from 'app/helpers/toast.service';
import { defer, EMPTY, finalize, forkJoin, Subject, tap } from 'rxjs';

@Injectable({
	providedIn: 'root',
})
export class DocumentClipboardService {
	private readonly messages = inject(WebUiMessages);
	private readonly _documentClipboard = signal<any[]>([]);
	readonly documentClipboard = this._documentClipboard.asReadonly();
	readonly documentClipboardUpdated$ = toObservable(this._documentClipboard);
	documentsCopied$ = new Subject<any>();
	documentsMoved$ = new Subject<any>();
	/** Drawer-only transport and completion channel; legacy paste callers keep their behavior. */
	readonly drawerPending = signal(false);
	readonly drawerActionPerformed$ = new Subject<{
		operation: 'Copy' | 'Move';
		documents: any[];
		sourceUids: string[];
		destinationUid: string;
		repository: string;
	}>();

	pasteFromDrawer(
		operation: 'Copy' | 'Move',
		sourceUids: string[],
		destinationUid: string,
		repository: string,
		onCommitted?: () => void,
	) {
		return defer(() => {
			if (this.drawerPending() || !sourceUids.length || !destinationUid) return EMPTY;
			const userId = this.authService.userInfo()?.id;
			this.drawerPending.set(true);
			return this.httpClient
				.post<any>(
					`${this.automationUrl}/Document.${operation}`,
					{
						input: `docs:${sourceUids.join(',')}`,
						params: { target: destinationUid },
						context: {},
					},
					{ headers: { 'X-NXRepository': repository, 'nx-es-sync': 'true' } },
				)
				.pipe(
					tap((response) => {
						if (this.authService.userInfo()?.id !== userId) return;
						this.removeFromClipboard(sourceUids, false);
						onCommitted?.();
						this.drawerActionPerformed$.next({
							operation,
							documents: response?.entries ?? [],
							sourceUids: [...sourceUids],
							destinationUid,
							repository,
						});
					}),
					finalize(() => this.drawerPending.set(false)),
				);
		});
	}

	private readonly maxDocuments = 10;
	private clipboard: any[] = [];
	private localStorageKey = '';
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;
	private readonly automationUrl = `${this.apiUrl}/automation`;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly authService: AuthService,
		private readonly httpClient: HttpClient,
		private readonly toastrService: ToastService,
	) {
		authService.userInfoUpdated$.subscribe((x) => {
			if (!x) return;

			this.localStorageKey = `${x.id}-default-nuxeo-clipboard`;

			const clipboard = localStorage.getItem(this.localStorageKey);

			if (!clipboard) return;

			try {
				const array = JSON.parse(clipboard);

				if (!Array.isArray(array)) return;

				this.clipboard = array;
				this._documentClipboard.set([...this.clipboard]);
			} catch (_error) {
				// Ignore JSON parse failures; sessionStorage may have stale data from a prior version.
			}
		});
	}

	// --------------------------------------------------------------------------------------------------
	addToClipboard(documents: any[]) {
		let someDocumentsAlreadyInTheClipboard = false;
		const filteredDocuments = documents
			.filter((x) => x.ng.canAddToCollection)
			.map((x) => JSON.parse(JSON.stringify(x)));

		if (filteredDocuments.length + this.clipboard.length > 100) {
			this.toastrService.error(
				this.messages.format(
					'app.services.clipboard.limit',
					{},
					'The clipboard can only accomodate a maximum of 100 documents for performance reasons.',
				),
				this.messages.format('app.services.clipboard.not-updated', {}, 'Clipboard not updated'),
				{ enableHtml: false },
			);
			return;
		}

		for (const document of filteredDocuments) {
			// Clear the "isSelected" property
			if (document.ng) delete document.ng.isSelected;

			const index = this.clipboard.findIndex((x) => x.uid === document.uid);

			if (index < 0) this.clipboard = [document, ...this.clipboard.slice(0, this.maxDocuments - 1)];
			else {
				// If the item's already in the clipboard, move it to the top
				this.clipboard.splice(index, 1);
				this.clipboard.unshift(document);

				someDocumentsAlreadyInTheClipboard = true;
			}
		}

		this._documentClipboard.set([...this.clipboard]);

		if (this.localStorageKey)
			localStorage.setItem(this.localStorageKey, JSON.stringify(this.clipboard));

		if (filteredDocuments.length < documents.length || someDocumentsAlreadyInTheClipboard) {
			if (someDocumentsAlreadyInTheClipboard) {
				if (!filteredDocuments.length)
					this.toastrService.info(
						this.messages.format(
							'app.services.clipboard.some-added',
							{ count: filteredDocuments.length, total: documents.length },
							'{count, plural, one {# document out of {total, number} has been added to the clipboard; some were already present.} other {# documents out of {total, number} have been added to the clipboard; some were already present.}}',
						),
						this.messages.format('app.services.clipboard.updated', {}, 'Clipboard updated'),
						{ enableHtml: false },
					);
				else
					this.toastrService.warning(
						this.messages.format(
							'app.services.clipboard.already-added',
							{},
							'The document is already on the clipboard.',
						),
						this.messages.format('app.services.clipboard.not-updated', {}, 'Clipboard not updated'),
						{ enableHtml: false },
					);
			} else
				this.toastrService.error(
					this.messages.format(
						'app.services.clipboard.add-failed',
						{},
						"The document couldn't be added to the clipboard.",
					),
					this.messages.format('app.services.clipboard.not-updated', {}, 'Clipboard not updated'),
					{ enableHtml: false },
				);
		} else {
			switch (filteredDocuments.length) {
				case 0:
					this.toastrService.warning(
						this.messages.format(
							'app.services.clipboard.empty-copy',
							{},
							'No document was copied to the clipboard.',
						),
						this.messages.format('app.services.clipboard.not-updated', {}, 'Clipboard not updated'),
						{ enableHtml: false },
					);
					break;
				case 1:
					this.toastrService.success(
						this.messages.format(
							'app.services.clipboard.added',
							{ count: filteredDocuments.length },
							'{count, plural, one {# document has been added to the clipboard.} other {# documents have been added to the clipboard.}}',
						),
						this.messages.format('app.services.clipboard.updated', {}, 'Clipboard updated'),
						{ enableHtml: false },
					);
					break;
				default:
					this.toastrService.success(
						this.messages.format(
							'app.services.clipboard.added',
							{ count: filteredDocuments.length },
							'{count, plural, one {# document has been added to the clipboard.} other {# documents have been added to the clipboard.}}',
						),
						this.messages.format('app.services.clipboard.updated', {}, 'Clipboard updated'),
						{ enableHtml: false },
					);
			}
		}
	}

	// --------------------------------------------------------------------------------------------------
	removeFromClipboard(uids: string[], showToaster = true) {
		this.clipboard = this.clipboard.filter((x) => !uids.includes(x.uid));

		this._documentClipboard.set([...this.clipboard]);

		if (this.localStorageKey)
			localStorage.setItem(this.localStorageKey, JSON.stringify(this.clipboard));

		if (!showToaster) return;

		const notificationMessage = this.messages.format(
			'app.services.clipboard.removed',
			{ count: uids.length },
			'{count, plural, one {# document has been removed from the clipboard.} other {# documents have been removed from the clipboard.}}',
		);

		this.toastrService.success(
			notificationMessage,
			this.messages.format('app.services.clipboard.updated', {}, 'Clipboard updated'),
			{ enableHtml: false },
		);
	}

	// --------------------------------------------------------------------------------------------------
	clearClipboard() {
		this.clipboard = [];

		this._documentClipboard.set([...this.clipboard]);

		if (this.localStorageKey)
			localStorage.setItem(this.localStorageKey, JSON.stringify(this.clipboard));

		this.toastrService.success(
			this.messages.format(
				'app.services.clipboard.all-removed',
				{},
				'All documents have been removed from the clipboard.',
			),
			this.messages.format('app.services.clipboard.cleared', {}, 'Clipboard cleared'),
			{ enableHtml: false },
		);
	}

	// --------------------------------------------------------------------------------------------------
	copyTo(sourceUids: string[], destinationUid: string) {
		const url = `${this.automationUrl}/Document.Copy`;

		return forkJoin(
			sourceUids.map((sourceUid) =>
				this.httpClient.post(url, {
					params: {
						target: destinationUid,
					},
					context: {},
					input: sourceUid,
				}),
			),
		).pipe(
			tap((documents) => {
				this.documentsCopied$.next({
					documents,
					destinationUid,
				});

				const notificationMessage = this.messages.format(
					'app.services.clipboard.copied',
					{ count: sourceUids.length },
					'{count, plural, one {# document has been copied to the current location.} other {# documents have been copied to the current location.}}',
				);

				this.toastrService.success(
					notificationMessage,
					this.messages.format('app.services.clipboard.copied-title', {}, 'Documents copied'),
					{ enableHtml: false },
				);
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	moveTo(sourceUids: string[], destinationUid: string) {
		const url = `${this.automationUrl}/Document.Move`;

		return forkJoin(
			sourceUids.map((sourceUid) =>
				this.httpClient.post(url, {
					params: {
						target: destinationUid,
					},
					context: {},
					input: sourceUid,
				}),
			),
		).pipe(
			tap((documents) => {
				this.documentsMoved$.next({
					documents,
					destinationUid,
				});

				const notificationMessage = this.messages.format(
					'app.services.clipboard.moved',
					{ count: sourceUids.length },
					'{count, plural, one {# document has been moved to the current location.} other {# documents have been moved to the current location.}}',
				);

				this.toastrService.success(
					notificationMessage,
					this.messages.format('app.services.clipboard.moved-title', {}, 'Documents moved'),
					{ enableHtml: false },
				);
			}),
		);
	}
}
