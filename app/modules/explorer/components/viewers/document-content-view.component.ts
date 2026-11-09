import {
	AfterViewInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ComponentRef,
	ViewChild,
	ViewContainerRef,
	computed,
	effect,
	inject,
	input,
	reflectComponentType,
	signal,
	Type,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
	DocumentInfoBarContext,
	DocumentLayoutRegistry,
	documentLayoutContext,
	DocumentViewContext,
	SuggestionScope,
	WebUiSlotComponent,
} from '@maretha/webui-sdk';
import { merge } from 'rxjs';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { DocumentSearchService } from 'app/modules/search/helpers/document-search.service';
import { DocumentViewerRegistryService } from './document-viewer-registry.service';
import { GenericFolderishViewerComponent } from './generic-folderish-viewer/generic-folderish-viewer.component';

@Component({
	selector: 'nx-document-content-view',
	standalone: true,
	imports: [GenericFolderishViewerComponent, WebUiSlotComponent],
	// Stock nuxeo-document-page and nuxeo-collapsible-document-page open with the info bar.
	template: `<nx-webui-slot name="DOCUMENT_INFO_BAR" layout="stack" [context]="infoBarContext()" />
		@if (folderFallback()) {
			<nx-generic-folderish-viewer [document]="context().document" />
		}
		<ng-template #container />`,
	styles: `
		:host {
			display: flex;
			flex: 1;
			min-width: 0;
			min-height: 0;
			flex-direction: column;
		}
		nx-generic-folderish-viewer,
		nx-generic-non-folderish-viewer {
			flex: 1;
			min-height: 0;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
	// The view layout's id scopes the suggestion fields it contains.
	providers: [SuggestionScope],
})
export class DocumentContentViewComponent implements AfterViewInit {
	readonly context = input.required<DocumentViewContext>();
	private readonly viewers = inject(DocumentViewerRegistryService);
	private readonly layouts = inject(DocumentLayoutRegistry);
	private readonly suggestionScope = inject(SuggestionScope);
	private readonly cdr = inject(ChangeDetectorRef);
	private readonly documents = inject(DocumentsManagerService);
	private readonly searchActive = inject(DocumentSearchService).searchPaneVisibility;
	private readonly loading = signal(false);
	readonly infoBarContext = computed<DocumentInfoBarContext>(() => ({
		...this.context(),
		loading: this.loading(),
		searchActive: this.searchActive(),
	}));
	private mounted?: ComponentRef<unknown>;
	private mountedComponent?: Type<unknown>;
	private mountedUid?: unknown;
	private ready = false;
	@ViewChild('container', { read: ViewContainerRef, static: true })
	private container?: ViewContainerRef;

	private readonly isFolder = () => {
		const document = this.context().document;
		const ng = document?.['ng'] as Record<string, unknown> | undefined;
		return !document || !!ng?.['isFolder'];
	};
	readonly folderFallback = (): boolean => {
		if (!this.isFolder()) return false;
		const context = this.context();
		const layout = this.layouts.resolve(
			documentLayoutContext({
				documentType: context.document?.['type'],
				mode: 'view',
				document: context.document,
				noEdit: context.noEdit,
			}),
		);
		return !layout?.component && !layout?.disabled;
	};

	constructor() {
		this.documents.fetchingDocument$
			.pipe(takeUntilDestroyed())
			.subscribe(() => this.loading.set(true));
		merge(this.documents.documentFetched$, this.documents.documentsUpdated$)
			.pipe(takeUntilDestroyed())
			.subscribe(() => this.loading.set(false));
		effect(() => {
			this.context();
			this.layouts.revision();
			if (this.ready) this.mount();
		});
	}

	ngAfterViewInit(): void {
		this.ready = true;
		this.mount();
	}

	private mount(): void {
		const viewContext = this.context();
		const layoutContext = documentLayoutContext({
			documentType: viewContext.document?.['type'],
			mode: 'view',
			document: viewContext.document,
			noEdit: viewContext.noEdit,
		});
		if (this.folderFallback()) {
			this.clear();
			return;
		}
		try {
			const layout = this.layouts.resolve(layoutContext);
			this.suggestionScope.layout.set(layout?.id ?? null);
			if (layout?.disabled) {
				this.clear();
				return;
			}
			const component =
				layout?.component ??
				(this.isFolder() ? GenericFolderishViewerComponent : this.viewers.getComponent());
			if (layout?.component && !layout.disabled && !this.inputName(component, 'layoutContext'))
				throw new Error('Document view layouts must declare a layoutContext input.');
			const uid = viewContext.document?.['uid'];
			if (this.mountedComponent !== component || this.mountedUid !== uid) {
				this.clear();
				this.mounted = this.container?.createComponent(component);
				this.mountedComponent = component;
				this.mountedUid = uid;
			}
			this.setInput('layoutContext', layoutContext);
			this.setInput('document', viewContext.document);
			this.setInput('context', viewContext);
			this.setInput('noEdit', viewContext.noEdit);
			this.mounted?.changeDetectorRef.detectChanges();
		} catch {
			// A client extension must never strand a routed document view.  Fall back to
			// the registered legacy viewer, which owns its tabs, draft state and navigation.
			this.clear();
			this.mounted = this.container?.createComponent(
				this.isFolder() ? GenericFolderishViewerComponent : this.viewers.getComponent(),
			);
			this.mountedComponent = this.mounted?.componentType;
			this.mountedUid = viewContext.document?.['uid'];
			this.setInput('document', viewContext.document);
			this.setInput('context', viewContext);
			this.setInput('noEdit', viewContext.noEdit);
			this.mounted?.changeDetectorRef.detectChanges();
		}
		this.cdr.markForCheck();
	}

	private clear(): void {
		this.mounted?.destroy();
		this.mounted = undefined;
		this.mountedComponent = undefined;
		this.mountedUid = undefined;
		this.container?.clear();
	}

	private inputName(component: Type<unknown>, name: string): string | undefined {
		return reflectComponentType(component)?.inputs.find(
			(input) => input.templateName === name || input.propName === name,
		)?.templateName;
	}

	private setInput(name: string, value: unknown): void {
		const publicName = this.mounted && this.inputName(this.mounted.componentType, name);
		if (this.mounted && publicName) this.mounted.setInput(publicName, value);
	}
}
