import { errorMessage } from 'app/helpers/localized-message';
import { localizedText, messageText } from 'app/helpers/localized-message';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	inject,
	input,
	signal,
} from '@angular/core';
import { ResultsToolbarContext, WebUiIconComponent, WebUiMessagePipe } from '@maretha/webui-sdk';
import { DocumentEnhancerService } from '../../helpers/document-enhancer.service';
import {
	pageTypeSchemas,
	SelectionDownloadService,
} from '../../helpers/selection-download.service';
@Component({
	selector: 'nx-results-csv-export',
	imports: [WebUiIconComponent, WebUiMessagePipe],
	template: `<button
			type="button"
			[attr.aria-label]="'csvExportButton.label' | webuiMessage: 'Export CSV'"
			[attr.title]="'csvExportButton.label' | webuiMessage: 'Export CSV'"
			[disabled]="busy() || context().busy || context().totalCount === 0 || !context().queryScope"
			(click)="start()"
		>
			<nx-webui-icon name="nuxeo:csv-export" /><span class="visually-hidden">{{
				'csvExportButton.label' | webuiMessage: 'Export CSV'
			}}</span>
		</button>
		@if (busy()) {
			<span role="status">{{
				'app.modules.results-csv-export.exporting-all-results-matching-the-applied-3db9b7'
					| webuiMessage: 'Exporting all results matching the applied filters…'
			}}</span
			><button type="button" (click)="stop()">
				{{ 'app.modules.results-csv-export.stop-waiting-5bc5b3' | webuiMessage: 'Stop waiting' }}
			</button>
		}
		@if (url()) {
			<span role="status">{{
				'app.modules.results-csv-export.export-ready-d9bdeb' | webuiMessage: 'Export ready.'
			}}</span
			><a [href]="url()" [download]="filename()">{{
				'app.modules.results-csv-export.save-export-430afe' | webuiMessage: 'Save export'
			}}</a>
		}
		@if (error()) {
			<span role="alert">{{ error() }}</span>
		}`,
	styles:
		':host {display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;} button {display:inline-flex;align-items:center;justify-content:center;gap:6px;background:transparent;color:inherit;border:0;padding:6px;border-radius:0.2rem;} button:hover {background:color-mix(in srgb, var(--nuxeo-primary-color, #06c) 5%, transparent);}',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsCsvExportComponent {
	readonly context = input.required<ResultsToolbarContext>();
	readonly busy = signal(false);
	readonly error = localizedText('');
	readonly url = signal('');
	readonly filename = signal('results.csv');
	private readonly service = inject(SelectionDownloadService);
	private readonly enhancer = inject(DocumentEnhancerService);
	private readonly destroy = inject(DestroyRef);
	private controller?: AbortController;
	constructor() {
		this.destroy.onDestroy(() => {
			this.controller?.abort();
			this.release();
		});
	}
	private release(): void {
		if (this.url()) URL.revokeObjectURL(this.url());
		this.url.set('');
	}
	stop(): void {
		this.controller?.abort();
		this.busy.set(false);
	}
	async start(): Promise<void> {
		const context = this.context();
		if (!context.queryScope || context.busy || context.totalCount === 0 || this.busy()) return;
		const scope = structuredClone(context.queryScope);
		const controller = new AbortController();
		this.controller = controller;
		this.release();
		this.error.set('');
		this.busy.set(true);
		try {
			const options = context as ResultsToolbarContext & {
				csvSchemas?: readonly string[];
				csvSort?: { readonly sortBy: string; readonly sortOrder: 'asc' | 'desc' };
			};
			const blob = await this.service.exportCsv(
				scope,
				controller.signal,
				options.csvSchemas ? { schemas: options.csvSchemas, ...options.csvSort } : undefined,
				pageTypeSchemas(context.items, await this.enhancer.loadDocumentTypes()),
			);
			if (this.destroy.destroyed || controller.signal.aborted) return;
			this.filename.set(
				blob.type === 'application/gzip'
					? 'results.csv.gz'
					: blob.type.includes('zip')
						? 'results.zip'
						: 'results.csv',
			);
			this.url.set(URL.createObjectURL(blob));
		} catch (error) {
			if (!this.destroy.destroyed && !controller.signal.aborted)
				this.error.set(
					error instanceof Error
						? errorMessage(error)
						: messageText(
								'app.state.csv-export-failed-retry-the-export-8c140a',
								'CSV export failed. Retry the export.',
							),
				);
		} finally {
			if (this.controller === controller) this.busy.set(false);
		}
	}
}
