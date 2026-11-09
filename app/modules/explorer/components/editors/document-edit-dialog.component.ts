import { NgComponentOutlet } from '@angular/common';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	Injector,
	HostListener,
	Input,
	OnDestroy,
	OnInit,
	inject,
	viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { ViewNavigation, WebUiMessagePipe } from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { NgSelectConfig } from '@ng-select/ng-select';
import { DocumentTypeEditorComponent } from './document-type-editor/document-type-editor.component';

/** Child editors register here; the modal registers one departure guard with the application. */
class DocumentEditNavigation extends ViewNavigation {
	private registrations = 0;
	get hasGuards(): boolean {
		return this.registrations > 0;
	}
	override register(guard: (url: string) => Promise<boolean>): () => void {
		this.registrations++;
		const unregister = super.register(guard);
		return () => {
			this.registrations--;
			unregister();
		};
	}
}

@Component({
	selector: 'nx-document-edit-dialog',
	imports: [NgComponentOutlet, WebUiMessagePipe],
	providers: [
		{ provide: ViewNavigation, useFactory: () => new DocumentEditNavigation() },
		{
			provide: NgSelectConfig,
			useFactory: () =>
				Object.assign(new NgSelectConfig(), inject(NgSelectConfig, { skipSelf: true }), {
					appendTo: 'nx-document-edit-dialog',
				}),
		},
	],
	template: `<h2 [id]="titleId" class="visually-hidden">
			{{ 'documentEditAction.tooltip' | webuiMessage: 'Edit document' }}
		</h2>
		<ng-container
			*ngComponentOutlet="editorComponent; injector: editorInjector; inputs: editorInputs"
		/>`,
	styleUrl: './document-edit-dialog.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentEditDialogComponent implements OnInit, AfterViewInit, OnDestroy {
	@Input() documentType = '';
	@Input() data: Record<string, unknown> = {};
	@Input() titleId = 'document-edit-dialog-title';
	readonly editorComponent = DocumentTypeEditorComponent;
	readonly editor = viewChild(NgComponentOutlet);
	private readonly modal = inject(BsModalRef);
	private readonly injector = inject(Injector);
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly destroy = inject(DestroyRef);
	private readonly navigation = inject(ViewNavigation) as DocumentEditNavigation;
	private readonly applicationNavigation = inject(ViewNavigation, { skipSelf: true });
	private readonly router = inject(Router);
	private fieldWatch?: MutationObserver;
	private closeApproved = false;
	private pendingClose?: Promise<void>;
	readonly editorInjector = Injector.create({
		parent: this.injector,
		providers: [{ provide: BsModalRef, useValue: { hide: () => this.finish() } }],
	});
	get editorInputs(): Record<string, unknown> {
		return { documentType: this.documentType, data: this.data };
	}

	ngOnInit(): void {
		this.destroy.onDestroy(this.applicationNavigation.register((url) => this.canDeactivate(url)));
		this.router.events.pipe(takeUntilDestroyed(this.destroy)).subscribe((event) => {
			if (event instanceof NavigationEnd) this.finish();
		});
	}

	async canDeactivate(url = ''): Promise<boolean> {
		const editor = this.editor()?.componentInstance as DocumentTypeEditorComponent | undefined;
		// Explicit compiled-layout guards own their whole draft. Fallback/binary editors register
		// their BaseEditor guard in this modal's scope instead of adding a second application guard.
		if (typeof editor?.componentRef?.instance?.canDeactivate === 'function')
			return (await editor.canDeactivate()) !== false;
		if (this.navigation.hasGuards) return this.navigation.canLeave(url);
		return (await editor?.canDeactivate()) !== false;
	}

	@HostListener('keydown', ['$event'])
	containConsumedEscape(event: KeyboardEvent): void {
		// Nested controls such as ng-select consume Escape before Bootstrap's window listener.
		if (event.key === 'Escape' && event.defaultPrevented) event.stopPropagation();
	}

	/** Bootstrap invokes this for Escape/backdrop; the editor has already guarded its own Cancel. */
	interceptClose(): Promise<void> {
		if (this.closeApproved) return Promise.resolve();
		if (this.pendingClose) return this.pendingClose;
		this.pendingClose = this.canDeactivate()
			.then((allowed) => {
				if (!allowed) throw new Error('Document edit dismissal declined');
			})
			.finally(() => (this.pendingClose = undefined));
		return this.pendingClose;
	}

	private finish(): void {
		if (this.closeApproved) return;
		this.closeApproved = true;
		this.modal.hide();
	}

	ngAfterViewInit(): void {
		const focusField = (): boolean => {
			const host = this.element.nativeElement;
			if (host.contains(document.activeElement)) return true;
			const field = host.querySelector<HTMLElement>(
				'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]',
			);
			field?.focus();
			return !!field;
		};
		queueMicrotask(() => {
			if (this.destroy.destroyed || focusField()) return;
			this.fieldWatch = new MutationObserver(() => {
				if (focusField()) this.fieldWatch?.disconnect();
			});
			this.fieldWatch.observe(this.element.nativeElement, { childList: true, subtree: true });
		});
	}

	ngOnDestroy(): void {
		this.fieldWatch?.disconnect();
	}
}
