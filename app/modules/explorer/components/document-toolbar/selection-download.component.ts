import { errorMessage } from 'app/helpers/localized-message';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	untracked,
	inject,
	input,
	signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ResultsToolbarContext, WebUiIconComponent, WebUiMessagePipe } from '@maretha/webui-sdk';
import { firstValueFrom } from 'rxjs';
import { BulkZipJob, BlobDeliveryGrant, bulkZipFilename } from 'app/helpers/blob-delivery.service';
import { SelectionDownloadService } from '../../helpers/selection-download.service';
@Component({
	selector: 'nx-selection-download',
	imports: [TooltipDirective, WebUiIconComponent, WebUiMessagePipe],
	templateUrl: './selection-download.component.html',
	styles:
		':host {display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap;} button {display:inline-flex;gap:6px;align-items:center;padding:8px;border:1px solid var(--nuxeo-border);background:var(--nuxeo-box);color:inherit;} [role=alert] {max-width:30em;}',
	styleUrls: ['./selection-icon-action.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectionDownloadComponent {
	readonly context = input.required<ResultsToolbarContext>();
	readonly filename = input('selection.zip');
	/** Visible button text; the results toolbar keeps the icon-only form. */
	readonly label = input<string | null>(null);
	readonly autoStart = input(false);
	readonly phase = signal<'idle' | 'creating' | 'waiting' | 'cancelling' | 'cancelled'>('idle');
	readonly loading = computed(() => ['creating', 'waiting', 'cancelling'].includes(this.phase()));
	readonly error = localizedText('');
	readonly count = signal(0);
	readonly job = signal<BulkZipJob | null>(null);
	readonly started = signal(false);
	readonly canCancel = computed(
		() =>
			!this.started() &&
			(this.loading() || ['queued', 'preparing', 'ready'].includes(this.job()?.state ?? '')) &&
			this.phase() !== 'cancelled',
	);
	readonly canRetry = computed(
		() =>
			!this.loading() &&
			!this.started() &&
			!!this.error() &&
			['queued', 'preparing', 'ready'].includes(this.job()?.state ?? ''),
	);
	readonly canRegenerate = computed(
		() =>
			!this.loading() &&
			!!this.job() &&
			(this.started() ||
				this.phase() === 'cancelled' ||
				['ready', 'consumed', 'failed', 'cancelled', 'expired'].includes(this.job()!.state)),
	);
	private readonly service = inject(SelectionDownloadService);
	private readonly dom = inject(DOCUMENT);
	private readonly destroy = inject(DestroyRef);
	private controller?: AbortController;
	private capturedFilename = 'selection.zip';

	private preparationError(error: unknown): string | MessageText {
		if (error instanceof HttpErrorResponse) {
			const message: unknown = error.error?.error;
			if (
				typeof message === 'string' &&
				message.trim() &&
				message.length <= 1000 &&
				!Array.from(message).some(
					(character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
				)
			)
				return message.trim();
		} else if (error instanceof Error) return errorMessage(error);
		return messageText(
			'download.unconfirmed',
			'Archive preparation could not be confirmed. Retry status or regenerate the ZIP.',
		);
	}

	constructor() {
		let autoStarted = false;
		effect(() => {
			if (this.autoStart() && !autoStarted) {
				autoStarted = true;
				untracked(() => void this.download());
			}
		});
		const session = this.service.sessionEnded$?.subscribe(() => {
			this.controller?.abort();
			this.started.set(false);
		});
		this.destroy.onDestroy(() => {
			session?.unsubscribe();
			if (this.controller) this.controller.abort();
			else if (
				!this.started() &&
				this.phase() !== 'cancelled' &&
				this.job() &&
				['queued', 'preparing', 'ready'].includes(this.job()!.state)
			)
				this.service.cancelDownload(this.job()!.id).subscribe({ error: () => undefined });
		});
	}

	async cancel(): Promise<void> {
		if (!this.canCancel()) return;
		this.phase.set('cancelling');
		this.error.set('');
		if (this.controller) {
			this.controller.abort();
			return;
		}
		try {
			await firstValueFrom(this.service.cancelDownload(this.job()!.id));
			if (!this.destroy.destroyed) this.phase.set('cancelled');
		} catch {
			if (!this.destroy.destroyed) {
				this.phase.set('idle');
				this.error.set(
					messageText(
						'app.state.cancellation-could-not-be-confirmed-retry-can-e54119',
						'Cancellation could not be confirmed. Retry cancellation.',
					),
				);
			}
		}
	}

	async download(): Promise<void> {
		const context = this.context();
		if (this.loading() || context.busy || !context.selectedDocuments.length) return;
		const repository = String(context.document?.['repository'] ?? 'default');
		if (
			context.selectedDocuments.some(
				(doc) => doc['isTrashed'] || (doc['repository'] && doc['repository'] !== repository),
			)
		)
			return;
		const ids = context.selectedDocuments.map((doc) => String(doc['uid'] ?? ''));
		if (
			this.job() &&
			!this.started() &&
			['queued', 'preparing', 'ready'].includes(this.job()!.state)
		) {
			await this.cancel();
			if (this.phase() !== 'cancelled') return;
		}
		this.count.set(ids.length);
		this.capturedFilename = bulkZipFilename(this.filename());
		this.job.set(null);
		await this.run(
			(signal, progress) =>
				this.service.download(ids, repository, signal, progress, this.capturedFilename),
			true,
		);
	}

	async retryStatus(): Promise<void> {
		const job = this.job();
		if (!job || !this.canRetry()) return;
		await this.run((signal, progress) => this.service.retryDownload(job, signal, progress));
	}

	async regenerate(): Promise<void> {
		const job = this.job();
		if (!job || this.loading()) return;
		await this.run(
			(signal, progress) => this.service.regenerateDownload(job.id, signal, progress),
			true,
		);
	}

	private async run(
		operation: (
			signal: AbortSignal,
			progress: (job: BulkZipJob) => void,
		) => Promise<BlobDeliveryGrant>,
		creating = false,
	): Promise<void> {
		const controller = new AbortController();
		this.controller = controller;
		this.phase.set(creating ? 'creating' : 'waiting');
		this.error.set('');
		this.started.set(false);
		try {
			const grant = await operation(controller.signal, (job) => {
				if (!this.destroy.destroyed && this.controller === controller) {
					this.job.set(job);
					if (!controller.signal.aborted) this.phase.set('waiting');
				}
			});
			if (this.destroy.destroyed || controller.signal.aborted || this.controller !== controller)
				return;
			const link = this.dom.createElement('a');
			link.href = grant.url;
			link.download = this.capturedFilename;
			this.dom.body.appendChild(link);
			try {
				link.click();
				this.started.set(true);
			} finally {
				link.remove();
			}
		} catch (error) {
			if (!this.destroy.destroyed && this.controller === controller) {
				if (
					controller.signal.aborted &&
					error instanceof DOMException &&
					error.name === 'AbortError'
				)
					this.phase.set('cancelled');
				else
					this.error.set(
						controller.signal.aborted
							? messageText(
									'app.state.cancellation-could-not-be-confirmed-retry-can-5d2070',
									'Cancellation could not be confirmed. Retry cancellation if available.',
								)
							: this.preparationError(error),
					);
			}
		} finally {
			if (this.controller === controller) {
				this.controller = undefined;
				if (this.phase() !== 'cancelled') this.phase.set('idle');
			}
		}
	}
}
