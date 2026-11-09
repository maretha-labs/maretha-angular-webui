import { localizedText, messageText } from 'app/helpers/localized-message';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	effect,
	ElementRef,
	inject,
	input,
	signal,
	viewChild,
	untracked,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { BlobActionContext, WebUiIconComponent, WebUiMessagePipe } from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { StreamMediaDirective } from 'app/directives/stream-media.directive';
import { resolveDocumentBlobTarget } from 'app/helpers/document-blob-target';
export function canPreviewBlob(context: BlobActionContext): boolean {
	return context.blob instanceof Blob || typeof context.blob['data'] === 'string';
}
@Component({
	selector: 'nx-blob-preview',
	imports: [WebUiIconComponent, WebUiMessagePipe, StreamMediaDirective],
	template: `<button
			type="button"
			[title]="'previewButton.tooltip' | webuiMessage: 'Preview'"
			[attr.aria-label]="'previewButton.tooltip' | webuiMessage: 'Preview'"
			(click)="open()"
		>
			<nx-webui-icon name="nuxeo:preview" />
		</button>
		<dialog #dialog (close)="clear()">
			<header>
				<h2>{{ context().blob['name'] || ('previewButton.tooltip' | webuiMessage: 'Preview') }}</h2>
				<button type="button" (click)="dialog.close()">
					{{ 'command.close' | webuiMessage: 'Close' }}
				</button>
			</header>
			@if (loading()) {
				<p role="status">
					{{ 'app.modules.blob-preview.loading-preview-d1d5c4' | webuiMessage: 'Loading preview…' }}
				</p>
			}
			@if (error()) {
				<p role="alert">{{ error() }}</p>
				<button type="button" (click)="load()">
					{{ 'app.modules.blob-preview.retry-2e4838' | webuiMessage: 'Retry' }}
				</button>
			}
			@switch (kind()) {
				@case ('image') {
					<img
						[src]="url()"
						[alt]="
							context().blob['name'] ||
							('app.runtime.blob-preview.document-preview-7d76d8'
								| webuiMessage: 'Document preview')
						"
						(error)="failedMedia()"
					/>
				}
				@case ('video') {
					<video controls [src]="url()" (error)="failedMedia()"></video>
				}
				@case ('audio') {
					<audio controls [src]="url()" (error)="failedMedia()"></audio>
				}
				@case ('stream-video') {
					<video
						controls
						preload="metadata"
						[nxStreamMedia]="context().blob"
						[streamDocument]="context().document"
						(streamReady)="loading.set(false)"
						(streamError)="streamFailed($event)"
						(error)="failedMedia()"
					></video>
				}
				@case ('stream-audio') {
					<audio
						controls
						preload="metadata"
						[nxStreamMedia]="context().blob"
						[streamDocument]="context().document"
						(streamReady)="loading.set(false)"
						(streamError)="streamFailed($event)"
						(error)="failedMedia()"
					></audio>
				}
				@case ('text') {
					<pre>{{ text() }}</pre>
				}
				@case ('pdf') {
					<object
						[data]="pdfUrl()"
						type="application/pdf"
						[attr.aria-label]="
							'app.modules.blob-preview.pdf-preview-aa8636' | webuiMessage: 'PDF preview'
						"
					>
						<p>
							{{
								'app.modules.blob-preview.your-browser-cannot-display-this-pdf-downl-d8ac48'
									| webuiMessage
										: 'Your browser cannot display this PDF. Download the file to view it.'
							}}
						</p>
					</object>
				}
			}
		</dialog>`,
	styles:
		':host {display:inline-flex;} button {display:inline-flex;border:0;background:transparent;color:inherit;padding:8px;} dialog {width:90vw;height:85vh;max-width:none;border:1px solid var(--nuxeo-border);background:var(--nuxeo-box);color:var(--nuxeo-text-default);padding:20px;} dialog::backdrop {background:#0008;} header {display:flex;justify-content:space-between;align-items:center;} h2 {font-size:18px;} img,video {width:100%;height:calc(100% - 60px);object-fit:contain;} audio {width:100%;} object {display:block;width:100%;height:calc(100% - 60px);} pre {white-space:pre-wrap;overflow-wrap:anywhere;} button:focus-visible {outline:2px solid var(--nuxeo-primary-color);}',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlobPreviewComponent {
	readonly context = input.required<BlobActionContext>();
	readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
	readonly loading = signal(false);
	readonly error = localizedText('');
	readonly url = signal('');
	readonly pdfUrl = signal<SafeResourceUrl | null>(null);
	readonly text = signal('');
	readonly kind = signal('');
	private readonly http = inject(HttpClient);
	private readonly dom = inject(DOCUMENT);
	private readonly sanitizer = inject(DomSanitizer);
	private readonly destroy = inject(DestroyRef);
	private readonly cancelled = new Subject<void>();
	private generation = 0;
	constructor() {
		effect(() => {
			void this.context();
			const dialog = this.dialog();
			untracked(() => {
				dialog?.nativeElement.close();
				this.clear();
			});
		});
		this.destroy.onDestroy(() => {
			this.clear();
			this.cancelled.complete();
		});
	}
	open(): void {
		if (!canPreviewBlob(this.context())) return;
		this.dialog()?.nativeElement.showModal();
		void this.load();
	}
	clear(): void {
		this.generation++;
		this.cancelled.next();
		if (this.url()) URL.revokeObjectURL(this.url());
		this.url.set('');
		this.pdfUrl.set(null);
		this.kind.set('');
		this.text.set('');
		this.loading.set(false);
		this.error.set('');
	}
	failedMedia(): void {
		this.error.set(
			messageText(
				'app.state.this-browser-could-not-display-the-file-downl-0b935c',
				'This browser could not display the file. Download it to use another viewer.',
			),
		);
	}
	streamFailed(message: string): void {
		this.loading.set(false);
		this.error.set(message);
	}
	async load(): Promise<void> {
		this.clear();
		const generation = this.generation;
		const context = this.context();
		this.loading.set(true);
		try {
			let blob: Blob;
			if (context.blob instanceof Blob) blob = context.blob;
			else {
				const mediaType = String(context.blob['mime-type'] ?? '').split('/')[0];
				if (mediaType === 'audio' || mediaType === 'video') {
					resolveDocumentBlobTarget(context.document, context.blob);
					this.kind.set(`stream-${mediaType}`);
					return;
				}
				const base = new URL(environment.nuxeoUrl, this.dom.baseURI);
				const source = new URL(String(context.blob['data']), this.dom.baseURI);
				const prefix = base.pathname.replace(/\/+$/, '');
				if (
					source.origin !== base.origin ||
					!['http:', 'https:'].includes(source.protocol) ||
					source.username ||
					source.password ||
					!source.pathname.startsWith(prefix + '/')
				)
					throw new Error('Unsupported preview source');
				const mime = String(context.blob['mime-type'] ?? '');
				let target = source.href;
				if (!/^(image\/|video\/|audio\/|text\/|application\/pdf$)/.test(mime)) {
					// Draft attachment positions can differ from persisted XPath indexes.
					if (context.draft) throw new Error('Save the draft before requesting server conversion');
					const uid = context.document?.['uid'];
					if (typeof uid !== 'string' || !context.blob['digest'])
						throw new Error('No conversion available');
					const repository = String(context.document?.['repository'] ?? 'default');
					const xpath = context.xpath.split('/').map(encodeURIComponent).join('/');
					target = `${base.href.replace(/\/+$/, '')}/api/v1/repo/${encodeURIComponent(repository)}/id/${encodeURIComponent(uid)}/@blob/${xpath}/@convert?converter=any2pdf`;
				}
				blob = await firstValueFrom(
					this.http.get(target, { responseType: 'blob' }).pipe(takeUntil(this.cancelled)),
				);
			}
			if (generation !== this.generation || this.destroy.destroyed) return;
			const mime = blob.type.toLowerCase().split(';')[0];
			const kind = mime.startsWith('image/')
				? 'image'
				: mime.startsWith('video/')
					? 'video'
					: mime.startsWith('audio/')
						? 'audio'
						: mime.startsWith('text/')
							? 'text'
							: mime === 'application/pdf'
								? 'pdf'
								: '';
			if (!kind) throw new Error('No browser preview available');
			if (kind === 'text') {
				const text = await blob.text();
				if (generation !== this.generation || this.destroy.destroyed) return;
				this.text.set(text);
			} else {
				this.url.set(URL.createObjectURL(blob));
				// Only a freshly created PDF object URL reaches the resource-URL sink.
				if (kind === 'pdf')
					this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.url()));
			}
			this.kind.set(kind);
		} catch {
			if (generation === this.generation && !this.destroy.destroyed)
				this.error.set(
					messageText(
						'app.state.preview-is-unavailable-check-access-or-server-160777',
						'Preview is unavailable. Check access or server conversion support, or download the file.',
					),
				);
		} finally {
			if (generation === this.generation && !this.kind().startsWith('stream-'))
				this.loading.set(false);
		}
	}
}
