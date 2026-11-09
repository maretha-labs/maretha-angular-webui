import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	computed,
	inject,
	input,
	viewChild,
} from '@angular/core';
import { DocumentActionContext, WebUiIconComponent, WebUiMessagePipe } from '@maretha/webui-sdk';

/** A rendition entry from the `renditions` document enricher. */
export interface DocumentRendition {
	name: string;
	kind?: string;
	icon?: string;
	url: string;
}

/** Stock nuxeo-export-button hides the picture and video conversions. */
const HIDDEN_RENDITION_KINDS = ['nuxeo:video:conversion', 'nuxeo:picture:conversion'];
@Component({
	selector: 'nx-document-export',
	imports: [WebUiIconComponent, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<button type="button" (click)="open()">
			<nx-webui-icon name="nuxeo:export" /><span class="action-label">{{
				'exportButton.tooltip' | webuiMessage: 'Export'
			}}</span>
		</button>
		<dialog #dialog (close)="closed()">
			<h2>{{ 'exportButton.dialog.heading' | webuiMessage: 'Export' }}</h2>
			<ul class="renditions">
				@for (rendition of renditions(); track rendition.name) {
					<li class="item">
						@if (rendition.icon) {
							<img [src]="rendition.icon" alt="" />
						}
						<a [href]="rendition.url" download>{{
							'exportButton.' + rendition.name | webuiMessage: rendition.name
						}}</a>
					</li>
				}
			</ul>
			<footer>
				<button type="button" (click)="dialog.close()">
					{{ 'exportButton.dialog.cancel' | webuiMessage: 'Cancel' }}
				</button>
			</footer>
		</dialog>`,
	styles: `
		button {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			border: 0;
			background: transparent;
			color: inherit;
			padding: 8px;
		}
		dialog {
			width: min(480px, 90vw);
			border: 0;
			background: var(--nuxeo-box);
			color: inherit;
			padding: 24px;
		}
		dialog::backdrop {
			background: #0005;
		}
		h2 {
			font-size: 20px;
		}
		.renditions {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		.item {
			display: flex;
			align-items: center;
			padding: 0.4em 0;
		}
		.item img {
			width: 16px;
			height: 16px;
			margin-right: 1em;
		}
		.item a {
			color: var(--nuxeo-link-color, #3a3a54);
		}
		.item a:hover {
			color: var(--nuxeo-link-hover-color, #0066ff);
		}
		footer {
			text-align: end;
			margin-top: 24px;
		}
	`,
})
export class DocumentExportComponent {
	readonly context = input.required<DocumentActionContext>();
	/** Every server rendition except the conversions, in server order, as stock does. */
	readonly renditions = computed<DocumentRendition[]>(() => {
		const context = this.context().document?.['contextParameters'] as
			| { renditions?: DocumentRendition[] }
			| undefined;
		return (context?.renditions ?? []).filter(
			(rendition) => !!rendition?.url && !HIDDEN_RENDITION_KINDS.includes(rendition.kind ?? ''),
		);
	});
	private readonly element = inject(ElementRef<HTMLElement>);
	readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
	open(): void {
		this.dialog()?.nativeElement.showModal();
		this.element.nativeElement.dispatchEvent(
			new CustomEvent('document-native-dialog-opened', { bubbles: true }),
		);
	}
	closed(): void {
		this.element.nativeElement.dispatchEvent(
			new CustomEvent('document-action-complete', { bubbles: true }),
		);
	}
}
