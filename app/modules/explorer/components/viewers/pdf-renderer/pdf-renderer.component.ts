import { WebUiMessagePipe, WebUiMessages } from '@maretha/webui-sdk';
import { localizedState } from '@maretha/webui-sdk';
import { PdfLocaleAdapter } from './pdf-locale-adapter';
import { WebUiLocale } from '@maretha/webui-sdk';
import {
	Component,
	CUSTOM_ELEMENTS_SCHEMA,
	OnDestroy,
	Input,
	Output,
	EventEmitter,
	OnChanges,
	SimpleChanges,
	signal,
	inject,
	ChangeDetectionStrategy,
	computed,
	effect,
	ElementRef,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
	NgxExtendedPdfViewerService,
	PDFScriptLoaderService,
	PageViewModeType,
	ProgressBarEvent,
	NgxExtendedPdfViewerModule,
} from 'ngx-extended-pdf-viewer';
import { ActiveToast, ToastService } from 'app/helpers/toast.service';
import { Subscription } from 'rxjs';
import { PdfRangeSource, PdfInitialData } from './pdf-range-source';
import { PdfRangeBridge, PdfRangeTransport } from './pdf-range-bridge';
import {
	ButtonCheckboxDirective,
	ButtonRadioGroupDirective,
	ButtonRadioDirective,
} from 'ngx-bootstrap/buttons';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
	BsDropdownDirective,
	BsDropdownToggleDirective,
	BsDropdownMenuDirective,
} from 'ngx-bootstrap/dropdown';

export const PDF_VIEWER_READY_TIMEOUT_MS = 60_000;

@Component({
	selector: 'nx-pdf-renderer',
	templateUrl: './pdf-renderer.component.html',
	styleUrls: ['./pdf-renderer.component.scss'],
	imports: [
		NgxExtendedPdfViewerModule,
		ButtonCheckboxDirective,
		TooltipDirective,
		FormsModule,
		FontAwesomeModule,
		BsDropdownDirective,
		BsDropdownToggleDirective,
		BsDropdownMenuDirective,
		ButtonRadioGroupDirective,
		ButtonRadioDirective,
		WebUiMessagePipe,
	],
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfRendererComponent implements OnChanges, OnDestroy {
	readonly locale = inject(WebUiLocale).locale;
	private readonly messages = inject(WebUiMessages);
	private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly pdfLoader = inject(PDFScriptLoaderService);
	private readonly localeAdapter = new PdfLocaleAdapter();
	private readonly viewerReady = signal(false);
	readonly localeNotice = signal<'direction' | 'unsupported' | null>(null);
	private printTimer?: number;
	private readyTimer?: ReturnType<typeof setTimeout>;
	private destroyed = false;
	private readonly http = inject(HttpClient);
	private readonly rangeBridge = inject(PdfRangeBridge);
	private request?: Subscription;
	private source?: PdfRangeSource;
	private transport?: PdfRangeTransport;
	private generation = 0;
	readonly pdfData = signal<Uint8Array | { range: PdfRangeTransport } | undefined>(undefined);
	readonly pdfViews = computed(() => {
		const data = this.pdfData();
		return data ? [{ data, generation: this.generation }] : [];
	});
	readonly error = localizedState('');
	readonly fetching = signal(false);

	@Input() document: any;
	@Input() contentUrl = '';
	@Output() loading = new EventEmitter<boolean>();

	zoom = 'auto';
	handTool = 'Y';
	pageViewMode: PageViewModeType = 'multiple';
	readonly showToolbar = signal(false);
	printProgressToastr: ActiveToast | null = null;
	printProgress = 0;
	sideBar = false;
	findbar = false;
	currentPage = 1;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly toastrService: ToastService,
		private pdfService: NgxExtendedPdfViewerService,
	) {
		effect(() => {
			const locale = this.locale();
			this.refreshPrintToast();
			if (this.viewerReady()) void this.refreshLocale(locale);
		});
	}

	private async refreshLocale(locale: string): Promise<void> {
		const generation = this.generation;
		const root = this.host.nativeElement.querySelector<HTMLElement>('ngx-extended-pdf-viewer');
		if (!root) return;
		const result = await this.localeAdapter.update(
			this.pdfLoader.PDFViewerApplication,
			this.pdfLoader.PDFViewerApplicationOptions,
			this.pdfLoader.pdfjsVersion,
			root,
			locale,
		);
		if (!this.destroyed && generation === this.generation && locale === this.locale())
			this.localeNotice.set(
				!result.applied ? 'unsupported' : result.directionDeferred ? 'direction' : null,
			);
	}

	percent(value: number): string {
		return new Intl.NumberFormat(this.locale(), { style: 'percent' }).format(value / 100);
	}

	private refreshPrintToast(): void {
		const toast = this.printProgressToastr;
		if (!toast) return;
		toast.update(
			this.messages.format(
				'pdf.printing',
				{ name: String(this.document?.ng?.attachment?.name || '') },
				'Printing document “{name}”…',
			),
			this.messages.format('pdf.printTitle', {}, 'Print document'),
		);
	}

	// --------------------------------------------------------------------------------------------------

	print() {
		this.pdfService.print();
	}

	// --------------------------------------------------------------------------------------------------
	zoomChanged = (zoomFactor: number) => (this.zoom = `${zoomFactor * 100}`);

	// --------------------------------------------------------------------------------------------------
	pdfLoading = (_event: any, generation = this.generation) => {
		if (generation === this.generation) this.loading.emit(true);
	};

	// --------------------------------------------------------------------------------------------------
	pdfLoadingFailed(_event: any, generation = this.generation) {
		if (generation !== this.generation) return;
		this.cancelLoad();
		this.pdfData.set(undefined);
		this.fetching.set(false);
		this.error.setMessage(
			'pdf.displayFailed',
			'Unable to display this PDF. Retry or download the file to open it.',
		);
		this.showToolbar.set(false);
		this.loading.emit(false);
	}

	// --------------------------------------------------------------------------------------------------
	pdfLoaded(_event: any, generation = this.generation) {
		if (generation !== this.generation || !this.pdfData() || this.error()) return;
		clearTimeout(this.readyTimer);
		this.showToolbar.set(true);
		this.viewerReady.set(true);
		this.loading.emit(false);
	}

	pdfPageRendered(event: unknown, generation = this.generation) {
		if (event && typeof event === 'object' && 'error' in event && event.error) {
			this.pdfLoadingFailed(event, generation);
			return;
		}
		// Range-backed PDFs can render pages before the full-download event fires.
		// A successful page is sufficient to enable controls and stop the ready deadline.
		this.pdfLoaded(event, generation);
	}

	// --------------------------------------------------------------------------------------------------
	beforePrint() {
		const node = document.querySelector('#printServiceDialog') as Element;
		node?.setAttribute('style', 'display:none!important');

		this.printTimer = setTimeout(() => {
			if (this.destroyed) return;
			this.printProgressToastr = this.toastrService.info(
				this.messages.format(
					'pdf.printing',
					{ name: String(this.document?.ng?.attachment?.name || '') },
					'Printing document “{name}”…',
				),
				this.messages.format('pdf.printTitle', {}, 'Print document'),
				{
					disableTimeOut: true,
					tapToDismiss: false,
				},
			);
		});
	}

	// --------------------------------------------------------------------------------------------------
	onPrint = (event: ProgressBarEvent) => {
		if (this.printProgressToastr) this.printProgress = event.percent;
	};

	// --------------------------------------------------------------------------------------------------
	afterPrint() {
		const node = document.querySelector('#printServiceDialog') as Element;
		node?.removeAttribute('style');

		if (this.printProgressToastr) {
			this.toastrService.remove(this.printProgressToastr.toastId);
			this.printProgressToastr = null;
			this.printProgress = 0;
		}
	}

	// --------------------------------------------------------------------------------------------------
	ngOnChanges(changes: SimpleChanges): void {
		if (changes['contentUrl']) this.loadPdf();
	}

	loadPdf(): void {
		this.cancelLoad();
		const generation = this.generation;
		this.pdfData.set(undefined);
		this.error.set('');
		this.showToolbar.set(false);
		this.currentPage = 1;
		this.fetching.set(!!this.contentUrl);
		this.loading.emit(!!this.contentUrl);
		if (!this.contentUrl) return;
		this.readyTimer = setTimeout(
			() => this.pdfLoadingFailed(null, generation),
			PDF_VIEWER_READY_TIMEOUT_MS,
		);
		const declared = Number(this.document?.properties?.['file:content']?.length);
		const source = new PdfRangeSource(
			this.http,
			this.contentUrl,
			Number.isSafeInteger(declared) && declared > 0 ? declared : null,
		);
		this.source = source;
		this.request = source.load().subscribe({
			next: (data) => void this.displayPdf(source, data, generation),
			error: () => this.pdfLoadingFailed(null, generation),
		});
	}

	private async displayPdf(source: PdfRangeSource, data: PdfInitialData, generation: number) {
		if (generation !== this.generation || this.destroyed) return;
		try {
			if (data.complete) {
				this.pdfData.set(data.bytes);
			} else {
				const transport = await this.rangeBridge.create(
					data.length,
					data.bytes,
					(begin, end) => {
						if (generation !== this.generation) return;
						source.read(begin, end).subscribe({
							next: (bytes) => {
								try {
									transport.onDataRange(begin, bytes);
								} catch {
									this.pdfLoadingFailed(null, generation);
								}
							},
							error: () => this.pdfLoadingFailed(null, generation),
						});
					},
					() => source.abort(),
				);
				if (generation !== this.generation) {
					transport.abort();
					return;
				}
				this.transport = transport;
				this.pdfData.set({ range: transport });
			}
			this.fetching.set(false);
		} catch {
			if (generation === this.generation) this.pdfLoadingFailed(null);
		}
	}

	private cancelLoad(): void {
		clearTimeout(this.readyTimer);
		this.localeAdapter.cancel();
		this.viewerReady.set(false);
		this.localeNotice.set(null);
		this.generation++;
		this.request?.unsubscribe();
		this.source?.abort();
		this.transport?.abort();
		this.source = undefined;
		this.transport = undefined;
	}

	ngOnDestroy(): void {
		this.destroyed = true;
		clearTimeout(this.printTimer);
		if (this.printProgressToastr) this.toastrService.remove(this.printProgressToastr.toastId);
		this.cancelLoad();
	}
}
