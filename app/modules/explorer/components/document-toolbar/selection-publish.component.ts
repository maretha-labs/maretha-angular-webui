import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	input,
	signal,
	viewChild,
} from '@angular/core';
import {
	DocumentViewsComponent,
	PublishContext,
	ResultsToolbarContext,
	WebUiIconComponent,
} from '@maretha/webui-sdk';
import { isPublishableDocument } from '../../helpers/selection-publication.service';

@Component({
	selector: 'nx-selection-publish',
	imports: [TooltipDirective, DocumentViewsComponent, WebUiIconComponent, WebUiMessagePipe],
	template: `<button
			type="button"
			class="selection-icon-action"
			[tooltip]="
				'app.modules.selection-publish.publish-selection-cca260' | webuiMessage: 'Publish selection'
			"
			[attr.aria-label]="
				'app.modules.selection-publish.publish-selection-cca260' | webuiMessage: 'Publish selection'
			"
			#actionTip="bs-tooltip"
			container="body"
			containerClass="document-action-tooltip"
			placement="bottom"
			[adaptivePosition]="true"
			boundariesElement="viewport"
			triggers="mouseenter:mouseleave focus:blur"
			[delay]="250"
			(keydown.escape)="actionTip.hide()"
			(pointerdown)="actionTip.hide()"
			[disabled]="context().busy || context().noEdit"
			(click)="open()"
		>
			<nx-webui-icon name="nuxeo:upload" />
		</button>
		<dialog #dialog (cancel)="$event.preventDefault(); close()">
			<header>
				<h2>
					{{
						'app.modules.selection-publish.publish-selection-cca260'
							| webuiMessage: 'Publish selection'
					}}
				</h2>
				<button type="button" (click)="close()">
					{{ 'app.modules.selection-publish.close-3f2518' | webuiMessage: 'Close' }}
				</button>
			</header>
			@if (snapshot(); as scope) {
				<nx-paired-views
					itemSlot="PUBLISH_ITEMS"
					pageSlot="PUBLISH_PAGES"
					[label]="
						'app.modules.selection-publish.publish-destinations-fdc9a4'
							| webuiMessage: 'Publish destinations'
					"
					[context]="scope"
				/>
			}
		</dialog>`,
	styles:
		':host {display:inline-flex;} button {display:inline-flex;gap:6px;padding:8px;background:var(--nuxeo-box);color:inherit;border:1px solid var(--nuxeo-border);} dialog {width:min(90vw,760px);background:var(--nuxeo-box);color:var(--nuxeo-text-default);border:1px solid var(--nuxeo-border);} header {display:flex;justify-content:space-between;align-items:center;} h2 {font-size:18px;} dialog::backdrop {background:#0008;}',
	styleUrls: ['./selection-icon-action.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectionPublishComponent {
	readonly context = input.required<ResultsToolbarContext>();
	readonly snapshot = signal<PublishContext | null>(null);
	private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
	private readonly views = viewChild(DocumentViewsComponent);
	open(): void {
		const context = this.context();
		if (
			context.busy ||
			context.noEdit ||
			!context.selectedDocuments.length ||
			!context.selectedDocuments.every(isPublishableDocument)
		)
			return;
		const documents = [
			...new Map(context.selectedDocuments.map((doc) => [doc['uid'], doc])).values(),
		];
		if (
			documents.some(
				(doc) =>
					String(doc['repository'] ?? 'default') !==
					String(documents[0]['repository'] ?? 'default'),
			)
		)
			return;
		this.snapshot.set({
			document: documents[0],
			noEdit: false,
			selectedDocuments: structuredClone(documents),
		});
		this.dialog()?.nativeElement.showModal();
	}
	async close(): Promise<void> {
		if (
			!(await this.views()?.canDeactivate({ reason: 'navigation', nextViewId: null, nextUrl: '' }))
		)
			return;
		this.dialog()?.nativeElement.close();
		this.snapshot.set(null);
	}
}
