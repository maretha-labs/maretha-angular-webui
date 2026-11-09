import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	computed,
	effect,
	inject,
	input,
	signal,
	viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import {
	DocumentActionContext,
	DocumentViewsComponent,
	PublishContext,
	WebUiIconComponent,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { AutomationsService } from '../../../helpers/automations.service';
import { canPublishStandardDocument } from './standard-document-publish-policy';

@Component({
	selector: 'nx-standard-document-publish',
	imports: [TooltipDirective, DocumentViewsComponent, WebUiIconComponent, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<button
			type="button"
			[tooltip]="label"
			[attr.aria-label]="label"
			data-command="publish"
			container="body"
			[disabled]="!available()"
			(click)="open()"
		>
			<nx-webui-icon name="editor:publish" /><span class="action-label">{{ label }}</span>
		</button>
		<dialog
			#dialog
			role="dialog"
			[attr.aria-label]="label"
			(cancel)="$event.preventDefault(); close()"
			(keydown.escape)="$event.stopPropagation()"
		>
			<header>
				<h2>{{ label }}</h2>
				<button type="button" (click)="close()">
					{{ 'app.modules.standard-document-publish.close-010a05' | webuiMessage: 'Close' }}
				</button>
			</header>
			@if (snapshot(); as scope) {
				<nx-paired-views
					itemSlot="PUBLISH_ITEMS"
					pageSlot="PUBLISH_PAGES"
					[label]="
						'app.modules.standard-document-publish.publish-destinations-b30e91'
							| webuiMessage: 'Publish destinations'
					"
					[context]="scope"
				/>
			}
		</dialog>`,
	styles: `
		:host {
			display: inline-block;
		}
		button {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			padding: 8px;
			border: 0;
			color: inherit;
			background: transparent;
		}
		button:hover,
		button:focus-visible {
			background: var(--nuxeo-box);
			outline: 1px solid currentColor;
		}
		dialog {
			width: min(90vw, 760px);
			overflow: visible;
			padding: 20px;
			background: var(--nuxeo-box);
			color: var(--nuxeo-text-default);
			border: 1px solid var(--nuxeo-border);
		}
		header {
			display: flex;
			justify-content: space-between;
			align-items: center;
		}
		h2 {
			font-size: 18px;
		}
		dialog::backdrop {
			background: #0008;
		}
	`,
})
export class StandardDocumentPublishComponent {
	readonly context = input.required<DocumentActionContext>();
	private readonly element = inject(ElementRef<HTMLElement>);
	readonly snapshot = signal<PublishContext | null>(null);
	private readonly messages = inject(WebUiMessages);
	get label(): string {
		return this.messages.text('publication.button.tooltip', 'Publish');
	}
	readonly available = computed(() => canPublishStandardDocument(this.context()));
	private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
	private readonly views = viewChild(DocumentViewsComponent);
	constructor() {
		inject(AutomationsService)
			.documentPublished$.pipe(takeUntilDestroyed())
			.subscribe((event) => {
				const publishedScope = this.snapshot();
				if (
					event.documentUid !== publishedScope?.document?.['uid'] ||
					String(event.repository ?? 'default') !==
						String(publishedScope?.document?.['repository'] ?? 'default')
				)
					return;
				// A committed publication needs no discard guard. Defer until its success handlers finish.
				queueMicrotask(() => {
					if (
						this.snapshot() === publishedScope &&
						this.context().document?.['uid'] === event.documentUid &&
						String(this.context().document?.['repository'] ?? 'default') ===
							String(event.repository ?? 'default')
					)
						this.dismiss();
				});
			});
		effect(() => {
			const document = this.context().document;
			const opened = this.snapshot()?.document;
			if (
				opened &&
				(opened['uid'] !== document?.['uid'] || opened['repository'] !== document?.['repository'])
			) {
				this.dismiss();
			}
		});
	}
	open(): void {
		if (!this.available() || this.snapshot()) return;
		this.snapshot.set({
			...this.context(),
			document: structuredClone(this.context().document),
			selectedDocuments: undefined,
			noEdit: false,
		});
		this.dialog()?.nativeElement.showModal();
		this.element.nativeElement.dispatchEvent(
			new CustomEvent('document-native-dialog-opened', { bubbles: true }),
		);
	}
	async close(): Promise<void> {
		const scope = this.snapshot();
		const views = this.views();
		if (
			views &&
			!(await views.canDeactivate({ reason: 'navigation', nextViewId: null, nextUrl: '' }))
		)
			return;
		if (this.snapshot() === scope) this.dismiss();
	}
	private dismiss(): void {
		const wasOpen = this.dialog()?.nativeElement.open;
		this.dialog()?.nativeElement.close();
		if (wasOpen)
			this.element.nativeElement.dispatchEvent(
				new CustomEvent('document-action-complete', { bubbles: true }),
			);
		this.snapshot.set(null);
	}
}
