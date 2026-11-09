import { LocalizedUiError, localizedState } from '@maretha/webui-sdk';
import {
	Directive,
	ElementRef,
	EventEmitter,
	HostListener,
	Input,
	OnChanges,
	OnDestroy,
	Output,
	inject,
	effect,
	untracked,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { BlobDeliveryGrant, BlobDeliveryService } from 'app/helpers/blob-delivery.service';
import { resolveDocumentBlobTarget } from 'app/helpers/document-blob-target';

@Directive({ selector: 'audio[nxStreamMedia],video[nxStreamMedia]' })
export class StreamMediaDirective implements OnChanges, OnDestroy {
	@Input('nxStreamMedia') blob: unknown;
	@Input() streamDocument: unknown;
	@Output() streamReady = new EventEmitter<void>();
	@Output() streamError = new EventEmitter<string>();
	private readonly service = inject(BlobDeliveryService);
	private readonly media = inject<ElementRef<HTMLMediaElement>>(ElementRef).nativeElement;
	private readonly session = this.service.sessionEnded$.subscribe(() => this.stop(false));
	private request?: Subscription;
	private grant?: BlobDeliveryGrant;
	private timer?: ReturnType<typeof setTimeout>;
	private key = '';
	private readonly errorText = localizedState(null);
	private lastError: string | null = null;
	private generation = 0;

	constructor() {
		effect(() => this.publishError());
	}
	private publishError(): void {
		const text = this.errorText();
		if (text !== null && text !== this.lastError) {
			this.lastError = text;
			this.streamError.emit(text);
		}
	}

	ngOnChanges(): void {
		try {
			const target = resolveDocumentBlobTarget(this.streamDocument, this.blob);
			const key = JSON.stringify(target);
			if (key === this.key) return;
			this.stop();
			this.key = key;
			const generation = this.generation;
			this.request = this.service.createGrant(target, 'inline').subscribe({
				next: (grant) => {
					if (generation !== this.generation) {
						this.release(grant);
						return;
					}
					this.grant = grant;
					this.media.src = grant.url;
					this.media.load();
					this.streamReady.emit();
					this.scheduleRenewal();
				},
				error: (error) => this.failed(error),
			});
		} catch (error) {
			this.failed(error);
		}
	}

	ngOnDestroy(): void {
		this.session.unsubscribe();
		this.stop();
	}

	@HostListener('error')
	mediaFailed(): void {
		if (this.grant)
			this.failed(
				new LocalizedUiError(
					'app.viewer.mediaPlaybackFailed',
					'This media could not be played. Check access or refresh the document to try again.',
				),
			);
	}

	private scheduleRenewal(): void {
		const grant = this.grant!;
		const remaining = grant.expiresAt - Date.now();
		if (remaining <= 0) {
			this.failed(
				new LocalizedUiError('app.viewer.streamingExpired', 'The streaming grant expired.'),
			);
			return;
		}
		this.timer = setTimeout(
			() => {
				this.request = this.service.renewGrant(grant).subscribe({
					next: (renewed) => {
						this.grant = renewed;
						this.scheduleRenewal();
					},
					error: (error) => this.failed(error),
				});
			},
			Math.max(1, remaining - Math.min(60_000, remaining / 5)),
		);
	}

	private failed(error: unknown): void {
		this.stop();
		this.errorText.setError(
			error,
			'app.viewer.streamingUnavailable',
			'Streaming is unavailable. Refresh the document to try again.',
		);
		untracked(() => this.publishError());
	}

	private stop(revoke = true): void {
		this.generation++;
		this.key = '';
		this.errorText.set(null);
		this.lastError = null;
		this.request?.unsubscribe();
		clearTimeout(this.timer);
		this.media.pause();
		this.media.removeAttribute('src');
		this.media.load();
		if (this.grant && revoke) this.release(this.grant);
		this.grant = undefined;
	}

	private release(grant: BlobDeliveryGrant): void {
		this.service.revokeGrant(grant).subscribe({ error: () => undefined });
	}
}
