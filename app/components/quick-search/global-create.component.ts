import { GlobalCreateDestination } from './global-create-destination.service';
import { LayoutService } from 'app/modules/explorer/helpers/layout.service';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	inject,
	input,
	signal,
	effect,
	HostListener,
} from '@angular/core';
import { Observable, ReplaySubject, Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BsModalService } from 'ngx-bootstrap/modal';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import {
	ShellActionContext,
	DocumentCreateContext,
	WebUiIconComponent,
	WebUiMessagePipe,
	WebUiSlotComponent,
} from '@maretha/webui-sdk';
import {
	CreationDestination,
	CreationParentService,
} from 'app/modules/explorer/helpers/creation-parent.service';
import { DestinationCreateDialogComponent } from './destination-create-dialog.component';
@Component({
	selector: 'nx-global-create',
	imports: [WebUiIconComponent, WebUiMessagePipe, WebUiSlotComponent, TooltipModule],
	template: `@if (layout.createButtonPlacement() === 'floating') {
		<div
			class="tray"
			tabindex="-1"
			(mouseenter)="loadShortcuts()"
			(mouseleave)="shortcuts.set(false)"
			(focusin)="loadShortcuts()"
			(focusout)="leaveShortcuts($event)"
			(keydown.escape)="shortcuts.set(false)"
		>
			@if (shortcuts() && shortcutContext(); as context) {
				<nx-webui-slot name="DOCUMENT_CREATE_ACTIONS" layout="stack" [context]="context" />
			}
			<button
				class="create"
				type="button"
				[attr.aria-label]="'documentCreateButton.tooltip' | webuiMessage: 'Create document'"
				[tooltip]="'documentCreateButton.tooltip' | webuiMessage: 'Create document'"
				placement="left"
				container="nx-shell-actions"
				aria-haspopup="dialog"
				(click)="open()"
			>
				<nx-webui-icon name="nuxeo-navigation:create" />
			</button>
		</div>
	}`,
	styles: `
		.tray {
			position: fixed;
			inset-inline-end: var(--nuxeo-document-create-button-offset, 32px);
			inset-block-end: calc(
				var(--nuxeo-document-create-button-offset, 32px) + var(--nuxeo-app-bottom, 0px)
			);
			z-index: 10;
			display: flex;
			align-items: flex-end;
			flex-direction: column;
			gap: 16px;
		}
		.create {
			width: var(--nuxeo-document-create-button-width, 56px);
			height: var(--nuxeo-document-create-button-height, 56px);
			display: flex;
			align-items: center;
			justify-content: center;
			border: 0;
			border-radius: 16px;
			background: var(
				--hyland-document-create-button-background,
				var(--nuxeo-button-primary, var(--nuxeo-primary-color))
			);
			color: var(
				--hyland-document-create-button-icon-color,
				var(--nuxeo-button-primary-text, #fff)
			);
			box-shadow: var(
				--hyland-document-create-button-box-shadow,
				0 4px 8px 3px rgb(0 0 0 / 15%),
				0 1px 3px rgb(0 0 0 / 30%)
			);
			transition: color 0.25s ease-in-out;
			cursor: pointer;
		}
		.create:hover,
		.create:focus {
			background: var(
				--hyland-document-create-button-hover-background,
				var(--nuxeo-button-primary-focus, var(--nuxeo-primary-color))
			);
		}
		.create:focus-visible {
			outline: 2px solid var(--nuxeo-button-primary-text);
			outline-offset: -5px;
		}
		nx-webui-icon {
			width: 24px;
			height: 24px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalCreateComponent {
	readonly layout = inject(LayoutService);
	readonly context = input.required<ShellActionContext>();
	private readonly modal = inject(BsModalService);
	private readonly parents = inject(CreationParentService);
	private readonly destroy = inject(DestroyRef);
	readonly shortcuts = signal(false);
	readonly shortcutContext = signal<DocumentCreateContext | null>(null);
	private readonly retainedDestination = inject(GlobalCreateDestination);
	readonly destination = computed(() => this.retainedDestination.forUser(this.context().user?.id));
	readonly path = computed(() => this.destination()?.path ?? '/');
	readonly repository = computed(() => this.destination()?.repository ?? 'default');
	private active = false;
	private shortcutRequest?: Subscription;
	private shortcutLoad?: Subscription;
	/**
	 * The destination the hover loaded for its shortcuts. Moving onto the button to click it starts
	 * that load, so the dialog opened by the same gesture takes it instead of reading again.
	 */
	private shortcutDestination?: {
		path: string;
		repository: string;
		userId?: string;
		loaded: Observable<CreationDestination>;
	};
	constructor() {
		effect(() => {
			const context = this.context();
			this.retainedDestination.remember(context.user?.id, context.document, context.route);
		});
		effect(() => {
			this.context();
			this.path();
			this.repository();
			this.shortcutRequest?.unsubscribe();
			this.shortcutLoad?.unsubscribe();
			this.shortcutDestination = undefined;
			this.shortcuts.set(false);
			this.shortcutContext.set(null);
		});
	}
	open(type?: string, bulk = false, view = 'create'): void {
		if (this.active) return;
		this.active = true;
		this.shortcuts.set(false);
		// The dialog now owns a read this gesture already started; nothing here cancels it.
		const initialDestination = this.loadedDestination();
		this.shortcutLoad = undefined;
		this.shortcutDestination = undefined;
		const ref = this.modal.show(DestinationCreateDialogComponent, {
			class: 'modal-lg modal-dialog-centered',
			ignoreBackdropClick: true,
			keyboard: false,
			initialState: {
				initialPath: this.path(),
				repository: this.repository(),
				initialType: type,
				initialBulk: bulk,
				initialView: view,
				...(initialDestination ? { initialDestination } : {}),
			},
		});
		ref.onHidden?.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
			this.active = false;
		});
	}
	@HostListener('document:keydown', ['$event'])
	createShortcut(event: KeyboardEvent): void {
		if (
			event.defaultPrevented ||
			event.key !== 'c' ||
			event.repeat ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey ||
			event.shiftKey ||
			this.active ||
			this.modal.getModalsCount() > 0 ||
			this.layout.createButtonPlacement() !== 'floating'
		)
			return;
		const target = event.target as HTMLElement | null;
		if (
			target?.closest(
				'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
			)
		)
			return;
		event.preventDefault();
		this.open();
	}
	leaveShortcuts(event: FocusEvent): void {
		if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
			this.shortcuts.set(false);
	}
	loadShortcuts(): void {
		if (this.shortcuts() || !this.destination() || this.active) return;
		this.shortcuts.set(true);
		this.shortcutContext.set(null);
		const path = this.path();
		const repository = this.repository();
		const userId = this.context().user?.id;
		this.shortcutRequest?.unsubscribe();
		// One read for the gesture: the shortcuts show it, and a dialog opened by the same click
		// takes it (see open()). Leaving the tray hides the shortcuts but keeps the read.
		const loaded = new ReplaySubject<CreationDestination>(1);
		this.shortcutLoad?.unsubscribe();
		this.shortcutLoad = this.parents
			.load(path, repository)
			.pipe(takeUntilDestroyed(this.destroy))
			.subscribe(loaded);
		const destination = { path, repository, userId, loaded: loaded.asObservable() };
		this.shortcutDestination = destination;
		this.shortcutRequest = destination.loaded.subscribe({
			next: (d) => {
				if (
					path !== this.path() ||
					repository !== this.repository() ||
					userId !== this.context().user?.id
				)
					return;
				this.shortcutContext.set({
					document: d.document,
					types: d.types,
					noEdit: !d.allowed,
					open: () => this.open(),
					create: (type, bulk) => this.open(type, bulk),
					importFiles: () => this.open(undefined, false, 'import'),
				});
			},
			error: () => {
				// A failed read is not handed on: the dialog then reads the destination itself.
				if (this.shortcutDestination === destination) this.shortcutDestination = undefined;
				this.shortcutContext.set(null);
			},
		});
	}
	private loadedDestination(): Observable<CreationDestination> | undefined {
		const loaded = this.shortcutDestination;
		return loaded &&
			loaded.path === this.path() &&
			loaded.repository === this.repository() &&
			loaded.userId === this.context().user?.id
			? loaded.loaded
			: undefined;
	}
}
