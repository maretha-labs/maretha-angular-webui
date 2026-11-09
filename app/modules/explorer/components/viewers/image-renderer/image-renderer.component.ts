import { WebUiIconComponent, WebUiNumberPipe } from '@maretha/webui-sdk';
import {
	faArrowLeft,
	faArrowRight,
	faArrowUp,
	faArrowDown,
	faMagnifyingGlassMinus,
	faMagnifyingGlassPlus,
} from '@fortawesome/free-solid-svg-icons';
import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	Component,
	TemplateRef,
	ElementRef,
	HostListener,
	ViewChild,
	OnDestroy,
	OnInit,
	AfterViewInit,
	OnChanges,
	Input,
	ChangeDetectionStrategy,
	inject,
	signal,
	computed,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgTemplateOutlet } from '@angular/common';
import { PictureMetadataCardComponent } from './picture-metadata-card.component';
import { FileSizePipe } from 'app/pipes/file-size.pipe';
import { DocumentAttachmentsService } from 'app/modules/explorer/helpers/document-attachments.service';

interface ImageSource {
	url: string;
	label: string;
	view?: any;
}

@Component({
	selector: 'nx-image-renderer',
	templateUrl: './image-renderer.component.html',
	styleUrls: ['./image-renderer.component.scss'],
	imports: [
		WebUiNumberPipe,
		WebUiIconComponent,
		TooltipDirective,
		FontAwesomeModule,
		PictureMetadataCardComponent,
		FileSizePipe,
		NgTemplateOutlet,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageRendererComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
	readonly zoomOutIcon = faMagnifyingGlassMinus;
	readonly zoomInIcon = faMagnifyingGlassPlus;
	readonly panControls = [
		{ key: 'imagePreviewer.pan.left', label: 'Pan left', x: -20, y: 0, icon: faArrowLeft },
		{ key: 'imagePreviewer.pan.up', label: 'Pan up', x: 0, y: -20, icon: faArrowUp },
		{ key: 'imagePreviewer.pan.down', label: 'Pan down', x: 0, y: 20, icon: faArrowDown },
		{ key: 'imagePreviewer.pan.right', label: 'Pan right', x: 20, y: 0, icon: faArrowRight },
	];
	panImage(x: number, y: number): void {
		if (this.naturalWidth()) this.pan.update((pan) => ({ x: pan.x + x, y: pan.y + y }));
	}
	private readonly mobileBreakpoint = 480;
	private readonly http = inject(HttpClient);
	private readonly attachments = inject(DocumentAttachmentsService);
	private readonly cancelled = new Subject<void>();
	private sources: ImageSource[] = [];
	private sourceIndex = -1;
	private generation = 0;
	private objectUrl = '';
	private onlyPlaceholderRenditions = false;
	private fallBackOnSourceFailure = true;

	@Input() document: any;
	@Input() contentUrl = '';
	@Input() externalCards = false;
	@Input() inlineBlobActions = false;
	@ViewChild('technicalCards', { static: true }) technicalCards!: TemplateRef<unknown>;
	private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
	@ViewChild('imageStage') private imageStage?: ElementRef<HTMLElement>;
	@ViewChild('viewerBody') private viewerBody?: ElementRef<HTMLElement>;
	@ViewChild('viewerToolbar') private viewerToolbar?: ElementRef<HTMLElement>;
	readonly zoom = signal<number | null>(null);
	readonly rotation = signal(0);
	readonly pan = signal({ x: 0, y: 0 });
	readonly dragging = signal(false);
	private readonly stageSize = signal({ width: 0, height: 0 });
	private readonly toolbarHeight = signal(0);
	private stageObserver?: ResizeObserver;
	private pointer?: { id: number; x: number; y: number; panX: number; panY: number };
	readonly naturalWidth = signal(0);
	readonly naturalHeight = signal(0);
	/** Stage ratio for the fit view; a fixed landscape box while the image dimensions are unknown or zoomed. */
	readonly stageAspectRatio = computed(() => {
		if (this.zoom() !== null || !this.naturalWidth() || !this.naturalHeight()) return '16 / 9';
		const quarterTurn = Math.abs(this.rotation() % 180) === 90;
		return quarterTurn
			? this.naturalHeight() + ' / ' + this.naturalWidth()
			: this.naturalWidth() + ' / ' + this.naturalHeight();
	});
	readonly imageScale = computed(() => {
		if (this.zoom() !== null) return this.zoom()! / 100;
		const quarterTurn = Math.abs(this.rotation() % 180) === 90;
		const width = quarterTurn ? this.naturalHeight() : this.naturalWidth();
		const height = quarterTurn ? this.naturalWidth() : this.naturalHeight();
		const stage = this.stageSize();
		return width && height && stage.width && stage.height
			? Math.min(stage.width / width, stage.height / height)
			: 1;
	});
	/** Keep controls over the visible image, including letterboxed panoramas, without leaving the stage. */
	readonly toolbarBottom = computed(() => {
		const inset = 8;
		const stage = this.stageSize();
		const quarterTurn = Math.abs(this.rotation() % 180) === 90;
		const width = (quarterTurn ? this.naturalHeight() : this.naturalWidth()) * this.imageScale();
		const height = (quarterTurn ? this.naturalWidth() : this.naturalHeight()) * this.imageScale();
		const centerX = stage.width / 2 + this.pan().x;
		const centerY = stage.height / 2 + this.pan().y;
		const bottom = Math.min(stage.height, centerY + height / 2);
		const top = Math.max(0, centerY - height / 2);
		if (
			!width ||
			!height ||
			bottom <= top ||
			centerX + width / 2 <= 0 ||
			centerX - width / 2 >= stage.width
		) {
			return inset;
		}
		const maximum = Math.max(inset, stage.height - this.toolbarHeight() - inset);
		return Math.min(maximum, Math.max(inset, stage.height - bottom + inset));
	});
	readonly imageTransform = computed(
		() =>
			`translate(-50%, -50%) translate(${this.pan().x}px, ${this.pan().y}px) rotate(${this.rotation()}deg)`,
	);
	readonly fullscreen = signal(false);
	readonly viewerMessage = localizedText('');
	@HostListener('document:fullscreenchange') onFullscreenChange(): void {
		this.fullscreen.set(globalThis.document.fullscreenElement === this.host.nativeElement);
	}
	fitImage(): void {
		this.zoom.set(null);
		this.pan.set({ x: 0, y: 0 });
		for (const element of [this.imageStage?.nativeElement, this.viewerBody?.nativeElement]) {
			if (element) {
				element.scrollLeft = 0;
				element.scrollTop = 0;
			}
		}
	}
	zoomBy(delta: number): void {
		this.zoom.set(Math.max(10, Math.min(400, Math.round(this.imageScale() * 100 + delta))));
	}
	rotate(degrees: number): void {
		this.rotation.update((angle) => (angle + degrees) % 360);
		this.pan.set({ x: 0, y: 0 });
	}
	startPan(event: PointerEvent): void {
		if (!this.naturalWidth() || event.button !== 0) return;
		this.pointer = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			panX: this.pan().x,
			panY: this.pan().y,
		};
		this.imageStage?.nativeElement.setPointerCapture?.(event.pointerId);
		this.dragging.set(true);
		event.preventDefault();
	}
	movePan(event: PointerEvent): void {
		const pointer = this.pointer;
		if (pointer?.id !== event.pointerId) return;
		this.pan.set({
			x: pointer.panX + event.clientX - pointer.x,
			y: pointer.panY + event.clientY - pointer.y,
		});
	}
	endPan(event: PointerEvent): void {
		if (this.pointer?.id !== event.pointerId) return;
		this.pointer = undefined;
		this.dragging.set(false);
		const stage = this.imageStage?.nativeElement;
		if (stage?.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId);
	}
	panWithKeyboard(event: KeyboardEvent): void {
		const delta: Record<string, [number, number]> = {
			ArrowLeft: [-20, 0],
			ArrowRight: [20, 0],
			ArrowUp: [0, -20],
			ArrowDown: [0, 20],
		};
		if (!this.naturalWidth() || !delta[event.key]) return;
		event.preventDefault();
		const [x, y] = delta[event.key];
		this.pan.update((pan) => ({ x: pan.x + x, y: pan.y + y }));
	}
	async toggleFullscreen(): Promise<void> {
		this.viewerMessage.set('');
		try {
			if (this.fullscreen()) await globalThis.document.exitFullscreen();
			else await this.host.nativeElement.requestFullscreen();
		} catch {
			this.viewerMessage.set(
				messageText(
					'app.state.fullscreen-is-unavailable-in-this-browser-aaff2c',
					'Fullscreen is unavailable in this browser.',
				),
			);
		}
	}

	ngOnChanges(): void {
		this.resetPreview();
	}

	itemsPerSlide = 4;
	exifInfo: any;
	readonly imageUrl = signal('');
	readonly loading = signal(false);
	readonly error = localizedText('');
	readonly selectedUrl = signal('');

	ngOnInit(): void {
		this.itemsPerSlide = window.innerWidth < this.mobileBreakpoint ? 2 : 4;
	}
	ngAfterViewInit(): void {
		const stage = this.imageStage?.nativeElement;
		if (!stage) return;
		const measure = () => {
			this.stageSize.set({ width: stage.clientWidth, height: stage.clientHeight });
			this.toolbarHeight.set(this.viewerToolbar?.nativeElement.offsetHeight ?? 0);
		};
		measure();
		this.stageObserver = new ResizeObserver(measure);
		this.stageObserver.observe(stage);
		if (this.viewerToolbar) this.stageObserver.observe(this.viewerToolbar.nativeElement);
	}

	ngOnDestroy(): void {
		this.stageObserver?.disconnect();
		this.cancelled.next();
		this.cancelled.complete();
		this.revokeObjectUrl();
	}

	selectView(view: any): void {
		const index = this.sources.findIndex((source) => source.url === view?.content?.data);
		if (index >= 0) this.loadSource(index, false);
	}

	selectOriginal(): void {
		const index = this.sources.findIndex((source) => !source.view);
		if (index >= 0) this.loadSource(index, false);
	}

	isSelected(url: string | undefined): boolean {
		return !!url && this.selectedUrl() === url;
	}

	isUsableView(view: any): boolean {
		return !!view?.content?.data && !this.isPlaceholder(view.content.data);
	}

	onImageLoad(objectUrl: string, image?: HTMLImageElement): void {
		if (objectUrl === this.objectUrl) {
			this.loading.set(false);
			if (image) {
				this.naturalWidth.set(image.naturalWidth);
				this.naturalHeight.set(image.naturalHeight);
			}
		}
	}

	onImageError(objectUrl: string): void {
		if (objectUrl !== this.objectUrl) return;
		if (this.fallBackOnSourceFailure) this.loadNextSource();
		else this.showPreviewUnavailable();
	}

	download(url: string, fileName: string): void {
		if (url) this.attachments.downloadAttachment(url, fileName).subscribe();
	}

	downloadBlob(blob: unknown): void {
		this.attachments.downloadDocumentBlob(this.document, blob).subscribe();
	}

	private resetPreview(): void {
		this.rotation.set(0);
		this.pan.set({ x: 0, y: 0 });
		this.pointer = undefined;
		this.dragging.set(false);
		this.zoom.set(null);
		this.naturalWidth.set(0);
		this.naturalHeight.set(0);
		this.generation++;
		this.cancelled.next();
		this.revokeObjectUrl();
		this.imageUrl.set('');
		this.loading.set(false);
		this.error.set('');
		this.selectedUrl.set('');
		this.sourceIndex = -1;
		this.sources = this.buildSources();
		this.exifInfo = this.readExifInfo();
		if (this.sources.length) this.loadSource(0);
		else if (this.onlyPlaceholderRenditions)
			this.error.set(
				messageText(
					'app.state.no-browser-preview-is-available-this-image-ne-279e76',
					'No browser preview is available. This image needs server conversion before it can be viewed.',
				),
			);
		else
			this.error.set(
				messageText(
					'app.state.preview-is-unavailable-for-this-image-downloa-62a90e',
					'Preview is unavailable for this image. Download the file to view it.',
				),
			);
	}

	private buildSources(): ImageSource[] {
		const views = this.document?.properties?.['picture:views'] || [];
		this.onlyPlaceholderRenditions =
			views.length > 0 && views.every((view: any) => this.isPlaceholder(view?.content?.data));
		const preferred = ['fullhd', 'medium', 'originaljpeg', 'small'];
		const validViews = views.filter((view: any) => this.isUsableView(view));
		validViews.sort((a: any, b: any) => {
			const title = (view: any) =>
				String(view.title || '')
					.replace(/[^a-z]/gi, '')
					.toLowerCase();
			const aIndex = preferred.indexOf(title(a));
			const bIndex = preferred.indexOf(title(b));
			return (aIndex < 0 ? preferred.length : aIndex) - (bIndex < 0 ? preferred.length : bIndex);
		});
		const result: ImageSource[] = validViews.map((view: any) => ({
			url: view.content.data,
			label: view.title || view.info?.format || 'Rendition',
			view,
		}));
		const original = this.contentUrl || this.document?.ng?.attachment?.data;
		if (original && !result.some((source) => source.url === original))
			result.push({
				url: original,
				label: this.document?.properties?.['picture:info']?.format || 'Original',
			});
		return result;
	}

	private loadSource(index: number, fallBackOnSourceFailure = true): void {
		const source = this.sources[index];
		if (!source) return;
		this.rotation.set(0);
		this.pan.set({ x: 0, y: 0 });
		this.zoom.set(null);
		this.naturalWidth.set(0);
		this.naturalHeight.set(0);
		this.pointer = undefined;
		this.dragging.set(false);
		this.generation++;
		const generation = this.generation;
		this.cancelled.next();
		this.revokeObjectUrl();
		this.sourceIndex = index;
		this.fallBackOnSourceFailure = fallBackOnSourceFailure;
		this.selectedUrl.set(source.url);
		this.imageUrl.set('');
		this.loading.set(true);
		this.error.set('');
		this.http
			.get(source.url, { responseType: 'blob' })
			.pipe(takeUntil(this.cancelled))
			.subscribe({
				next: (blob) => {
					if (generation !== this.generation) return;
					this.objectUrl = URL.createObjectURL(blob);
					this.imageUrl.set(this.objectUrl);
				},
				error: () => {
					if (generation !== this.generation) return;
					if (this.fallBackOnSourceFailure) this.loadNextSource();
					else this.showPreviewUnavailable();
				},
			});
	}

	private loadNextSource(): void {
		if (this.sourceIndex + 1 < this.sources.length) {
			this.loadSource(this.sourceIndex + 1);
			return;
		}
		this.showPreviewUnavailable();
	}

	private showPreviewUnavailable(): void {
		this.revokeObjectUrl();
		this.imageUrl.set('');
		this.loading.set(false);
		this.error.set(
			this.onlyPlaceholderRenditions
				? messageText(
						'app.state.no-browser-preview-is-available-this-image-ne-279e76',
						'No browser preview is available. This image needs server conversion before it can be viewed.',
					)
				: messageText(
						'app.state.preview-is-unavailable-for-this-image-downloa-62a90e',
						'Preview is unavailable for this image. Download the file to view it.',
					),
		);
	}

	private revokeObjectUrl(): void {
		if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
		this.objectUrl = '';
	}

	private readExifInfo(): any {
		const properties = this.document?.properties || {};
		const keys = Object.keys(properties).filter((key) => key.startsWith('imd'));
		return keys.length ? Object.fromEntries(keys.map((key) => [key, properties[key]])) : undefined;
	}

	private isPlaceholder(url: string | undefined): boolean {
		return /empty_picture\.png(?:[?#]|$)/i.test(url || '');
	}
}
