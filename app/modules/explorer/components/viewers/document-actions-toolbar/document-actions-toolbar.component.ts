import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { ExtensionRegistry } from 'app/extensions/extension-registry.service';
import { WebUiAppState, withSharedSlotModel } from 'app/extensions/app-state';
import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	DestroyRef,
	Input,
	OnChanges,
	ViewChild,
	inject,
	signal,
} from '@angular/core';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { NavigationStart, Router } from '@angular/router';
import { filter, map, take, Observable } from 'rxjs';
import { DocumentActionContext, POLYMER_SLOTS, WebUiSlotComponent } from '@maretha/webui-sdk';
@Component({
	selector: 'nx-document-actions-toolbar',
	templateUrl: './document-actions-toolbar.component.html',
	styleUrls: ['./document-actions-toolbar.component.scss'],
	imports: [
		TooltipDirective,
		CdkConnectedOverlay,
		CdkOverlayOrigin,
		WebUiSlotComponent,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentActionsToolbarComponent implements OnChanges {
	@Input() document: any;
	@Input() noEdit = false;
	@Input() compact = false;
	@Input() primary = false;
	@Input() referenceLayout = false;
	readonly narrow = toSignal(
		inject(BreakpointObserver)
			.observe('(max-width: 720px)')
			.pipe(map((state) => state.matches)),
		{ initialValue: false },
	);
	@Input() context: DocumentActionContext | null = null;
	@ViewChild('compactTrigger') private compactTrigger?: ElementRef<HTMLButtonElement>;
	@ViewChild('compactMenu') private compactMenu?: ElementRef<HTMLElement>;
	readonly documentActionsSlot = POLYMER_SLOTS.DOCUMENT_ACTIONS;
	actionContext: DocumentActionContext = { document: null, noEdit: false };
	readonly primaryActionIds = [
		'maretha.document.create',
		'maretha.document.edit',
		'maretha.document.trash',
		'maretha.document.collect',
		'maretha.document.favorite',
		'maretha.document.share',
	];
	get referencePrimaryIds(): readonly string[] {
		return [
			'maretha.document.create',
			'maretha.document.edit',
			'maretha.document.compare-versions',
			'maretha.document.restore',
			'maretha.document.purge',
			...(this.document?.ng?.isFolder ? ['maretha.document.trash'] : []),
		];
	}

	readonly referenceMenuIds = [
		'maretha.document.trash',
		'maretha.document.collect',
		'maretha.document.favorite',
		'maretha.document.share',
		'maretha.document.standard-publish',
		'maretha.document.notifications',
		'maretha.document.clipboard',
		'maretha.document.lock',
		'maretha.document.download',
		'maretha.document.download-folder',
		'maretha.document.export',
		'maretha.toolbar.workflow',
	];
	get orderedMenuIds(): readonly string[] {
		return this.document?.ng?.isFolder
			? this.referenceMenuIds.filter(
					(id) => !['maretha.document.lock', 'maretha.document.trash'].includes(id),
				)
			: this.referenceMenuIds;
	}
	get referenceExcludedIds(): readonly string[] {
		return [
			...this.referencePrimaryIds,
			...this.referenceMenuIds,
			'maretha.document.publish',
			'maretha.document.info',
			'maretha.toolbar.versions',
			'maretha.document.pdf',
			'maretha.document.xml',
			'maretha.document.zip',
		];
	}
	readonly menuOpen = signal(false);
	readonly nativeDialogOpen = signal(false);
	readonly compactMenuPositions: ConnectedPosition[] = [
		{ originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
		{ originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
	];
	private readonly destroy = inject(DestroyRef);
	private readonly manager = inject(DocumentsManagerService);
	private readonly registry = inject(ExtensionRegistry);
	private readonly appUser = inject(WebUiAppState).user;
	/** Stock shows no "More" control when nothing would be listed in it (e.g. a trashed document). */
	menuHasItems(): boolean {
		const items = this.registry.resolve(
			this.documentActionsSlot,
			withSharedSlotModel(this.actionContext, this.appUser()),
		).items;
		if (this.referenceLayout) {
			const listed = [...this.orderedMenuIds, ...(this.narrow() ? this.referencePrimaryIds : [])];
			return items.some(
				(item) => listed.includes(item.id) || !this.referenceExcludedIds.includes(item.id),
			);
		}
		const excluded = this.primary ? this.primaryActionIds : [];
		return items.some((item) => !excluded.includes(item.id));
	}
	private readonly router = inject(Router);
	constructor() {
		this.manager.documentFetched$.pipe(takeUntilDestroyed()).subscribe(() => this.ngOnChanges());
		this.router.events
			.pipe(
				filter((event): event is NavigationStart => event instanceof NavigationStart),
				takeUntilDestroyed(),
			)
			.subscribe(() => this.closeActions(false));
	}
	ngOnChanges(): void {
		this.actionContext = {
			...this.context,
			document: this.document ?? null,
			noEdit: this.noEdit,
			standardHeaderActions: this.referenceLayout,
			collection: this.context?.collection ?? this.manager.documentInfo ?? null,
		};
	}

	dialogOpened(event: Event): void {
		const hidden = (event as CustomEvent<{ onHidden?: Observable<unknown> }>).detail?.onHidden;
		this.closeActions(false);
		hidden
			?.pipe(take(1), takeUntilDestroyed(this.destroy))
			.subscribe(() => this.compactTrigger?.nativeElement.focus());
	}
	toggleActions(): void {
		this.menuOpen.update((open) => !open);
	}
	closeActions(restoreFocus = true): void {
		if (!this.menuOpen()) return;
		this.menuOpen.set(false);
		this.nativeDialogOpen.set(false);
		if (restoreFocus) queueMicrotask(() => this.compactTrigger?.nativeElement.focus());
	}
	focusActions(): void {
		queueMicrotask(() => this.compactMenu?.nativeElement.focus());
	}
	onOverlayKeydown(event: KeyboardEvent): void {
		if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
			const buttons = Array.from(
				this.compactMenu?.nativeElement.querySelectorAll<HTMLButtonElement>(
					'nx-contribution-outlet > * > button:not(:disabled)',
				) ?? [],
			);
			if (buttons.length) {
				const index = buttons.indexOf(event.target as HTMLButtonElement);
				const next =
					event.key === 'Home'
						? 0
						: event.key === 'End'
							? buttons.length - 1
							: (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
				buttons[next].focus();
				event.preventDefault();
			}
			return;
		}
		if (event.key !== 'Escape') return;
		event.preventDefault();
		this.closeActions();
	}
}
