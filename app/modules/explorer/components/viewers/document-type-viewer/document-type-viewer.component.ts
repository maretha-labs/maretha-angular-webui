import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	Component,
	ComponentRef,
	Input,
	OnDestroy,
	OnInit,
	OnChanges,
	ViewChild,
	ViewContainerRef,
	ChangeDetectionStrategy,
	inject,
	reflectComponentType,
} from '@angular/core';
import { DocumentLayoutRegistry, documentLayoutContext, SuggestionScope } from '@maretha/webui-sdk';
import { GenericTypeViewerComponent } from '../generic-type-viewer/generic-type-viewer.component';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Component({
	imports: [WebUiMessagePipe],
	selector: 'nx-document-type-viewer',
	templateUrl: './document-type-viewer.component.html',
	styleUrls: ['./document-type-viewer.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	// The view layout's id scopes the suggestion fields it contains.
	providers: [SuggestionScope],
})
export class DocumentTypeViewerComponent implements OnInit, OnChanges, OnDestroy {
	componentRef: ComponentRef<unknown> | undefined;
	private readonly suggestionScope = inject(SuggestionScope);

	@Input()
	documentType: string | undefined;

	@Input()
	data: unknown;

	@ViewChild('container', { read: ViewContainerRef, static: true })
	container: ViewContainerRef | undefined;

	constructor(private readonly layouts: DocumentLayoutRegistry) {}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		if (!this.componentRef) this.mount();
	}

	ngOnChanges(): void {
		// A disabled or invalid prior layout has no component ref, but a later input may
		// select a valid layout.  The static outlet is available before the first change.
		if (this.container) this.mount();
	}

	private mount(): void {
		this.componentRef?.destroy();
		this.componentRef = undefined;
		this.container?.clear();
		const document =
			isRecord(this.data) && isRecord(this.data['document']) ? this.data['document'] : this.data;
		const context = documentLayoutContext({
			documentType: this.documentType,
			mode: 'view',
			document,
		});
		const layout = this.layouts.resolve(context);
		this.suggestionScope.layout.set(layout?.id ?? null);
		if (layout?.disabled) return;
		if (layout?.component && !this.inputName(layout.component, 'layoutContext')) return;
		this.componentRef = this.container?.createComponent(
			layout?.component ?? GenericTypeViewerComponent,
		);

		if (!this.componentRef || !isRecord(this.data)) return;

		this.setInputIfDeclared('layoutContext', context);
		for (const key in this.data)
			if (Object.prototype.hasOwnProperty.call(this.data, key))
				this.setInputIfDeclared(key, this.data[key]);
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.componentRef?.destroy();
	}

	private inputName(component: any, name: string): string | undefined {
		const input = reflectComponentType(component)?.inputs.find(
			(candidate) => candidate.templateName === name || candidate.propName === name,
		);
		return input?.templateName;
	}

	private setInputIfDeclared(name: string, value: unknown): void {
		const publicName = this.componentRef && this.inputName(this.componentRef.componentType, name);
		if (this.componentRef && publicName) this.componentRef.setInput(publicName, value);
	}
}
