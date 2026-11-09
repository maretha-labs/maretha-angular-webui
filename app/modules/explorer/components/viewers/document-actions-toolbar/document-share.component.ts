import { localizedText, messageText } from 'app/helpers/localized-message';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	ElementRef,
	inject,
	input,
	viewChild,
} from '@angular/core';
import { DOCUMENT, Location } from '@angular/common';
import { Router } from '@angular/router';
import { DocumentActionContext, WebUiIconComponent, WebUiMessagePipe } from '@maretha/webui-sdk';
import { documentUrl } from 'app/helpers/document-route';
@Component({
	selector: 'nx-document-share',
	imports: [TooltipDirective, WebUiIconComponent, WebUiMessagePipe],
	template: `<button
			type="button"
			[disabled]="!permalink()"
			(click)="open()"
			[tooltip]="'shareButton.tooltip' | webuiMessage: 'Share'"
			#actionTip="bs-tooltip"
			container="body"
			containerClass="document-action-tooltip"
			placement="bottom"
			triggers="mouseenter:mouseleave focus:blur"
			[delay]="250"
			(keydown.escape)="actionTip.hide()"
			(pointerdown)="actionTip.hide()"
			[attr.aria-label]="'shareButton.tooltip' | webuiMessage: 'Share'"
		>
			<nx-webui-icon name="nuxeo:share" /><span class="action-label">{{
				'shareButton.tooltip' | webuiMessage: 'Share'
			}}</span>
		</button>
		<dialog #dialog (close)="closed()">
			<h2>{{ 'shareButton.dialog.heading' | webuiMessage: 'Share document' }}</h2>
			<label
				>{{ 'shareButton.link.label' | webuiMessage: 'Link to {0}' : title()
				}}<input #link type="url" readonly [value]="permalink()" (focus)="link.select()"
			/></label>
			<p>
				{{
					'app.modules.document-share.people-opening-this-link-need-permission-t-899177'
						| webuiMessage: 'People opening this link need permission to access the document.'
				}}
			</p>
			<p role="status">{{ status() }}</p>
			<div>
				<button
					type="button"
					[attr.aria-label]="'shareButton.operation.copy' | webuiMessage: 'Copy link'"
					(click)="copy()"
				>
					<nx-webui-icon name="nuxeo:copy" /><span class="visually-hidden">{{
						'shareButton.operation.copy' | webuiMessage: 'Copy link'
					}}</span>
				</button>
				<button type="button" class="primary" (click)="dialog.close()">
					{{ 'shareButton.dialog.close' | webuiMessage: 'Close' }}
				</button>
			</div>
		</dialog>`,
	styles:
		':host {display:block;} button {display:inline-flex;align-items:center;gap:8px;padding:8px;background:transparent;color:inherit;border:0;} dialog {width:min(480px,90vw);border:1px solid var(--nuxeo-border);background:var(--nuxeo-box);color:var(--nuxeo-text-default);padding:24px;} dialog::backdrop {background:#0008;} h2 {font-size:20px;} label {display:flex;flex-direction:column;gap:8px;} input {width:100%;padding:8px 0;border:0;border-bottom:1px solid var(--nuxeo-border);background:transparent;color:inherit;} .primary{background:var(--nuxeo-primary-color);color:#fff;} button:focus-visible {outline:2px solid var(--nuxeo-primary-color);}',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentShareComponent {
	readonly context = input.required<DocumentActionContext>();
	readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
	readonly link = viewChild<ElementRef<HTMLInputElement>>('link');
	readonly status = localizedText('');
	private readonly element = inject(ElementRef<HTMLElement>);
	closed(): void {
		this.status.set('');
		this.element.nativeElement.dispatchEvent(
			new CustomEvent('document-action-complete', { bubbles: true }),
		);
	}
	private readonly dom = inject(DOCUMENT);
	private readonly location = inject(Location);
	private readonly router = inject(Router);
	readonly title = computed(() => String(this.context().document?.['title'] ?? 'document'));
	readonly permalink = computed(() => {
		const document = this.context().document as any;
		const route = this.router.serializeUrl(
			this.router.parseUrl(documentUrl({ uid: document?.uid, repository: document?.repository })),
		);
		if (!route) return '';
		return new URL(this.location.prepareExternalUrl(route), this.dom.baseURI).href;
	});
	constructor() {
		effect(() => {
			void this.permalink();
			this.dialog()?.nativeElement.close();
		});
	}
	open(): void {
		if (this.permalink()) {
			this.status.set('');
			this.dialog()?.nativeElement.showModal();
			this.element.nativeElement.dispatchEvent(
				new CustomEvent('document-native-dialog-opened', { bubbles: true }),
			);
		}
	}
	async copy(): Promise<void> {
		const link = this.permalink();
		if (!link) return;
		try {
			const clipboard = this.dom.defaultView?.navigator.clipboard;
			if (!clipboard) throw new Error('Clipboard unavailable');
			await clipboard.writeText(link);
			if (link === this.permalink())
				this.status.set(messageText('app.state.link-copied-71af38', 'Link copied.'));
		} catch {
			if (link === this.permalink()) {
				this.link()?.nativeElement.focus();
				this.link()?.nativeElement.select();
				this.status.set(
					messageText(
						'app.state.copy-the-selected-link-using-your-keyboard-17309d',
						'Copy the selected link using your keyboard.',
					),
				);
			}
		}
	}
}
