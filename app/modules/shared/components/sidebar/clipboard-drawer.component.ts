import { localizedText, messageText } from 'app/helpers/localized-message';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	PendingTasks,
	computed,
	inject,
	input,
	signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DrawerContext, WebUiIconComponent, WebUiMessagePipe } from '@maretha/webui-sdk';
import { documentRouteMatches, documentUrl } from 'app/helpers/document-route';
import { Router } from '@angular/router';
import { environment } from 'environments/environment';
import { DocumentClipboardService } from 'app/modules/explorer/helpers/document-clipboard.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { DocumentHistoryService } from 'app/modules/explorer/helpers/document-history.service';
import { hasPermission } from 'app/helpers/document-permissions';

/** Clipboard actions belong to the drawer; document view paste controls keep their existing behavior. */
@Component({
	selector: 'nx-clipboard-drawer',
	imports: [WebUiIconComponent, WebUiMessagePipe],
	template: `
		<header class="nx-drawer__header">
			<h6>{{ 'app.clipboard' | webuiMessage: 'Clipboard' }}</h6>
		</header>
		<div class="clipboard-list" [attr.aria-busy]="busy()">
			@for (document of context().clipboard; track document.uid) {
				<div class="clipboard-row" [class.current]="isCurrent(document)">
					<button
						type="button"
						class="open-document"
						(click)="open(document)"
						(keydown)="onKeydown($event)"
						[attr.aria-current]="isCurrent(document) ? 'page' : null"
					>
						@if (document.contextParameters?.thumbnail?.url) {
							<img [src]="document.contextParameters.thumbnail.url" alt="" />
						} @else {
							<nx-webui-icon name="nuxeo:document" />
						}
						<span>{{ document.title }}</span>
					</button>
					<button
						type="button"
						class="remove-document"
						[disabled]="busy() || context().noEdit"
						[attr.aria-label]="('command.remove' | webuiMessage: 'Remove') + ' ' + document.title"
						(click)="remove(document)"
					>
						<nx-webui-icon name="nuxeo:remove" />
					</button>
				</div>
			} @empty {
				<p>{{ 'clipboard.empty' | webuiMessage: 'Your clipboard is empty.' }}</p>
			}
		</div>
		@if (error()) {
			<p role="alert">{{ error() }}</p>
		}
		@if (status()) {
			<p role="status">{{ status() }}</p>
		}
		<footer>
			<p class="tip">
				{{
					'clipboard.tip'
						| webuiMessage: 'Browse to a container to paste or move clipboard contents.'
				}}
			</p>
			<div class="actions">
				<button
					type="button"
					class="btn btn-primary"
					[disabled]="!canPaste()"
					(click)="execute('Copy')"
				>
					<nx-webui-icon name="nuxeo:copy" /> {{ 'clipboard.copy' | webuiMessage: 'Copy' }}
				</button>
				<button
					type="button"
					class="btn btn-primary"
					[disabled]="!canPaste()"
					(click)="execute('Move')"
				>
					<nx-webui-icon name="nuxeo:move" /> {{ 'clipboard.move' | webuiMessage: 'Move' }}
				</button>
			</div>
		</footer>
	`,
	styleUrls: ['./sidebar.component.scss'],
	styles: `
		:host {
			display: flex;
			flex-direction: column;
			flex: 1;
			min-height: 0;
		}
		.clipboard-list > p {
			text-align: center;
			padding: 24px 16px;
		}
		.actions button {
			display: inline-flex;
			align-items: center;
			gap: 8px;
		}
		.actions nx-webui-icon {
			width: 18px;
			height: 18px;
		}
		.clipboard-list {
			flex: 1;
			overflow: auto;
			min-height: 0;
		}
		.clipboard-row {
			display: flex;
			align-items: center;
			padding: 8px;
			border-bottom: 1px solid var(--nuxeo-border, #ddd);
		}
		.open-document,
		.remove-document {
			border: 0;
			background: transparent;
			color: inherit;
			padding: 8px;
		}
		.open-document {
			display: flex;
			align-items: center;
			gap: 12px;
			flex: 1;
			min-width: 0;
			text-align: left;
		}
		.open-document span {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.open-document img {
			width: 32px;
			height: 32px;
			object-fit: contain;
		}
		.clipboard-row.current {
			background: var(--nuxeo-pill-background, #eee);
		}
		p {
			padding: 16px;
			margin: 0;
		}
		.tip {
			opacity: 0.7;
			text-align: center;
			padding: 8px;
		}
		.actions {
			display: flex;
			justify-content: center;
			padding-bottom: 8px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClipboardDrawerComponent {
	readonly context = input.required<DrawerContext>();
	readonly error = localizedText('');
	readonly status = localizedText('');
	private readonly checking = signal(false);
	private readonly clipboard = inject(DocumentClipboardService);
	private readonly http = inject(HttpClient);
	private readonly manager = inject(DocumentsManagerService);
	private readonly history = inject(DocumentHistoryService);
	private readonly router = inject(Router);
	private readonly tasks = inject(PendingTasks);
	private readonly destroyRef = inject(DestroyRef);
	readonly busy = computed(() => this.checking() || this.clipboard.drawerPending());
	readonly canPaste = computed(
		() =>
			!this.busy() &&
			!this.context().noEdit &&
			this.accepts(this.context().document, this.context().clipboard),
	);
	private repository(document: any): string {
		return String(document?.repository ?? 'default');
	}
	private accepts(target: any, documents: readonly any[]): boolean {
		if (
			!target?.uid ||
			!documents.length ||
			!target.facets?.includes('Folderish') ||
			target.isVersion ||
			target.isProxy ||
			target.isTrashed
		)
			return false;
		const subtypes = target.contextParameters?.subtypes;
		const permissions = target.contextParameters?.permissions;
		if (Array.isArray(permissions) && !permissions.includes('AddChildren')) return false;
		return documents.every(
			(document) =>
				document.uid &&
				document.uid !== target.uid &&
				this.repository(document) === this.repository(target) &&
				(!Array.isArray(subtypes) ||
					subtypes.some((subtype: any) => subtype.type === document.type)),
		);
	}
	isCurrent(document: any): boolean {
		return (
			document.uid === this.context().document?.['uid'] &&
			this.repository(document) === this.repository(this.context().document)
		);
	}
	open(document: any): void {
		if (this.busy() || this.isCurrent(document) || !this.context().clipboard.includes(document))
			return;
		void this.router.navigateByUrl(documentUrl(document)).catch(() => {
			this.error.set(
				messageText(
					'app.state.the-document-could-not-be-opened-try-again-36410b',
					'The document could not be opened. Try again.',
				),
			);
		});
	}
	remove(document: any): void {
		if (this.busy() || this.context().noEdit || !this.context().clipboard.includes(document))
			return;
		this.clipboard.removeFromClipboard([document.uid], false);
	}
	clear(): void {
		if (!this.busy() && !this.context().noEdit) this.context().clearClipboard();
	}
	onKeydown(event: KeyboardEvent): void {
		if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
		const current = event.currentTarget as HTMLElement;
		const buttons = Array.from(
			current.closest('.clipboard-list')!.querySelectorAll<HTMLButtonElement>('.open-document'),
		);
		const index = buttons.indexOf(current as HTMLButtonElement);
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? buttons.length - 1
					: Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
		event.preventDefault();
		buttons[next]?.focus();
	}
	async execute(operation: 'Copy' | 'Move'): Promise<void> {
		if (!this.canPaste() || !documentRouteMatches(this.router.url, this.context().document)) return;
		const target = this.context().document as any;
		const documents = [...this.context().clipboard];
		const repository = this.repository(target);
		const user = this.context().user?.id;
		const matches = () =>
			!this.destroyRef.destroyed &&
			this.context().user?.id === user &&
			this.context().document?.['uid'] === target.uid &&
			this.repository(this.context().document) === repository &&
			documentRouteMatches(this.router.url, target);
		this.checking.set(true);
		this.error.set('');
		this.status.set('');
		const done = this.tasks.add();
		let committed = false;
		try {
			const fresh = await firstValueFrom(
				this.http.get<any>(
					`${environment.nuxeoUrl}/api/v1/repo/${encodeURIComponent(repository)}/id/${encodeURIComponent(target.uid)}`,
					{ headers: { 'enrichers.document': 'permissions,subtypes' } },
				),
			);
			if (
				!matches() ||
				this.context().noEdit ||
				documents.length !== this.context().clipboard.length ||
				!documents.every((document) => this.context().clipboard.includes(document))
			)
				return;
			if (
				!hasPermission(fresh, 'AddChildren') ||
				!this.accepts({ ...fresh, repository }, documents)
			)
				throw new Error('destination');
			await firstValueFrom(
				this.clipboard.pasteFromDrawer(
					operation,
					documents.map((document) => document.uid),
					target.uid,
					repository,
					() => {
						committed = true;
						if (operation === 'Move') this.history.invalidatePaths();
					},
				),
			);
			committed = true;
			if (!matches()) return;
			this.status.set(
				operation === 'Copy'
					? messageText('app.state.documents-copied-047a0c', 'Documents copied.')
					: messageText('app.state.documents-moved-00a77f', 'Documents moved.'),
			);
			if (documentRouteMatches(this.router.url, target)) {
				await firstValueFrom(this.manager.reloadDocument(target.uid, repository));
			}
		} catch {
			if (matches())
				this.error.set(
					committed
						? messageText(
								'app.state.the-documents-were-saved-but-the-current-loca-c6e66d',
								'The documents were saved, but the current location could not be refreshed.',
							)
						: messageText(
								'app.settingsShared.operation-select-copy-the-documents-could-not-b-ea6d40',
								'{operation, select, Copy {The documents could not be copied. Check the destination and try again.} other {The documents could not be moved. Check the destination and try again.}}',
								{ operation },
							),
				);
		} finally {
			this.checking.set(false);
			done();
		}
	}
}
