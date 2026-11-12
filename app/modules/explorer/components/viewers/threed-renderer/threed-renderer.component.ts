import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiPercentPipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	Component,
	ElementRef,
	Input,
	ViewChild,
	ViewContainerRef,
	HostListener,
	ChangeDetectionStrategy,
} from '@angular/core';
import { ToastService } from 'app/helpers/toast.service';
import '@google/model-viewer';
import { LegacyGltfRenderer } from 'app/modules/explorer/helpers/legacy-gltf-renderer';
import { LazyCacheService } from 'app/helpers/lazy-cache.service';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
	BsDropdownDirective,
	BsDropdownToggleDirective,
	BsDropdownMenuDirective,
} from 'ngx-bootstrap/dropdown';
import { LazyLoadDirective } from '../../../../../directives/lazy-load.directive';
import { NxLegacyModelViewerComponent } from '../legacy-model-vewer/legacy-model-vewer.component';
import { TitleCasePipe, KeyValuePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FileSizePipe } from 'app/pipes/file-size.pipe';
import { SizePipe } from '../../../../../pipes/size.pipe';

@Component({
	selector: 'nx-threed-renderer',
	templateUrl: './threed-renderer.component.html',
	styleUrls: ['./threed-renderer.component.scss'],
	imports: [
		WebUiNumberPipe,
		TooltipDirective,
		FontAwesomeModule,
		BsDropdownDirective,
		BsDropdownToggleDirective,
		BsDropdownMenuDirective,
		LazyLoadDirective,
		NxLegacyModelViewerComponent,
		WebUiPercentPipe,
		TitleCasePipe,
		KeyValuePipe,
		TranslateModule,
		FileSizePipe,
		SizePipe,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThreedRendererComponent {
	private readonly uiThreedRendererComponentMessages = injectUiMessages(RuntimeUiMessages);

	private _boundingRect: any;
	private _contentUrl = '';
	private defaultCameraZoom?: string;
	private readonly _legacyGltfRenderer = new LegacyGltfRenderer();

	@Input() document: any;
	@ViewChild('modelViewer', { read: ViewContainerRef, static: true })
	modelViewer: ViewContainerRef | undefined;
	// @ViewChild('canvas', { read: ViewContainerRef, static: true })
	// canvas: ViewContainerRef | undefined;
	loaded = false;
	error = false;
	animate = false;
	canAnimate = false;
	autoRotate = false;
	addHotspotMode = false;
	hotspots: ModelViewerHotspot[] = [];
	availableVariants: string[] = [];
	views: Record<string, string> = {
		isometric: '45deg 55deg',
		top: '90deg 23deg',
		bottom: '90deg 160deg',
		left: '180deg 90deg',
		right: '0deg 75deg',
		front: '90deg 90deg',
		back: '270deg 90deg',
	};
	exporting = false;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly elementRef: ElementRef,
		private readonly toastrService: ToastService,
		private readonly lazyCacheService: LazyCacheService,
	) {}

	// --------------------------------------------------------------------------------------------------
	@HostListener('window:keyup', ['$event'])
	handleKeyboardEvent(event: KeyboardEvent) {
		if (event.key === 'Escape') this.resetCrosshair();
	}

	// --------------------------------------------------------------------------------------------------
	@Input()
	set contentUrl(value: string) {
		this.loaded = false;

		// this.lazyCacheService.getBlob(value).subscribe(x =>
		// {
		// 	this._legacyGltfRenderer.src = x[Object.keys(x)[0]]

		// 	this._contentUrl = value;
		// });

		this._contentUrl = value;
	}

	get contentUrl() {
		return this._contentUrl;
	}

	// --------------------------------------------------------------------------------------------------
	toggleHotspotMode() {
		this.addHotspotMode = !this.addHotspotMode;

		if (this.addHotspotMode)
			this._boundingRect = this.modelViewer?.element.nativeElement.getBoundingClientRect();
	}

	// --------------------------------------------------------------------------------------------------
	drawCrosshair(event: any) {
		if (!this.addHotspotMode) return;

		this.elementRef.nativeElement.style.setProperty(
			'--xpos',
			`${event.pageX - this._boundingRect.left - 3}px`,
		);
		this.elementRef.nativeElement.style.setProperty(
			'--ypos',
			`${event.pageY - this._boundingRect.top - 3}px`,
		);
	}

	// --------------------------------------------------------------------------------------------------
	private resetCrosshair() {
		this.addHotspotMode = false;

		this.elementRef.nativeElement.style.setProperty('--xpos', `0px`);
		this.elementRef.nativeElement.style.setProperty('--ypos', `0px`);
	}

	// --------------------------------------------------------------------------------------------------
	addHotspot(event: MouseEvent) {
		if (!this.addHotspotMode) {
			this.resetCrosshair();
			return;
		}

		const modelViewer = this.modelViewer!.element.nativeElement;

		const hotspot: ModelViewerHotspot = {
			slot: `hotspot-${this.getHotspotName()}`,
			label: '',
			user: '',
			placement: {},
			interactiveOrbit: modelViewer.getCameraOrbit().toString(),
			interactiveTarget: modelViewer.getCameraTarget().toString(),
			interactiveFieldOfView: this.getFov(),
		};

		const surface = modelViewer.surfaceFromPoint(event.clientX, event.clientY);

		if (surface) {
			// const point = modelViewer.positionAndNormalFromPoint(event.clientX, event.clientY);

			// if (modelViewer.availableAnimations?.length)
			// {
			// 	if (surface)
			hotspot.placement = { surface };
			// }
			// else
			// {
			// 	if (point)
			// 		hotspot.placement = {
			// 			normal: point.normal,
			// 			position: point.position
			// 		};
			// }

			this.hotspots.push(hotspot);
		} else
			this.toastrService.warning(
				this.uiThreedRendererComponentMessages.text(
					'app.notices.you-need-to-choose-a-point-on-the-d-model-its-d4b8d5',
					'You need to choose a point on the 3D model itself.',
				),
				this.uiThreedRendererComponentMessages.text(
					'app.notices.hotspot-outside-model-3cf200',
					'Hotspot outside model',
				),
				{ enableHtml: false },
			);

		this.resetCrosshair();
	}

	// --------------------------------------------------------------------------------------------------
	private getHotspotName() {
		for (let index = 0; index < this.hotspots.length; index++)
			if (!this.hotspots.find((x) => x.slot.split('-')[1] === index.toString())) return index;

		return this.hotspots.length + 1;
	}

	// --------------------------------------------------------------------------------------------------
	removeHotspot(hotspot: ModelViewerHotspot) {
		this.hotspots = this.hotspots.filter((x) => x.slot !== hotspot.slot);
	}

	// --------------------------------------------------------------------------------------------------
	hotspotAction(hotspot: ModelViewerHotspot) {
		if (this.addHotspotMode) return;

		const modelViewer = this.modelViewer!.element.nativeElement;

		if (hotspot.interactiveOrbit) modelViewer.cameraOrbit = hotspot.interactiveOrbit;

		if (hotspot.interactiveTarget) modelViewer.cameraTarget = hotspot.interactiveTarget;

		if (hotspot.interactiveFieldOfView) modelViewer.fieldOfView = hotspot.interactiveFieldOfView;

		// modelViewer.jumpCameraToGoal();
	}

	// --------------------------------------------------------------------------------------------------
	annotationClick(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
	}

	// --------------------------------------------------------------------------------------------------
	private getCameraOrbit(): string {
		const orbit = this.modelViewer!.element.nativeElement.getCameraOrbit();
		const yaw = this.roundToDigits(this.radToDeg(orbit.theta), 2);
		const pitch = this.roundToDigits(this.radToDeg(orbit.phi), 2);

		return `${yaw}deg ${pitch}deg ${this.roundToDigits(orbit.radius, 2)}m`;
	}

	// --------------------------------------------------------------------------------------------------
	private getCameraTarget(): string {
		const target = this.modelViewer!.element.nativeElement.getCameraTarget();

		return `${this.roundToDigits(target.x, 2)}m ${this.roundToDigits(target.y, 2)}m ${this.roundToDigits(target.z, 2)}m`;
	}

	// --------------------------------------------------------------------------------------------------
	private getFov(): string {
		const fov = this.roundToDigits(this.modelViewer!.element.nativeElement.getFieldOfView(), 2);

		return `${fov}deg`;
	}

	// --------------------------------------------------------------------------------------------------
	switchView(cameraOrbit: string) {
		const modelViewer = this.modelViewer!.element.nativeElement;

		// console.log(this.getCameraOrbit())

		modelViewer.resetTurntableRotation();

		modelViewer.cameraOrbit = `${cameraOrbit} ${this.defaultCameraZoom}`;
		modelViewer.cameraTarget = null;
		modelViewer.fieldOfView = null;
	}

	// --------------------------------------------------------------------------------------------------
	async exportView(view: string) {
		const modelViewer = this.modelViewer!.element.nativeElement;

		const staticModelViewer = customElements.get('model-viewer') as ModelViewerStatic;
		const initialMinimumRenderScale = staticModelViewer.minimumRenderScale;
		staticModelViewer.minimumRenderScale = 1;

		const height = modelViewer.clientHeight / devicePixelRatio;
		modelViewer.style.width = `${height}px`;
		modelViewer.style.height = `${height}px`;

		const initialCameraOrbit = modelViewer.getCameraOrbit().toString();
		const initialCameraTarget = modelViewer.getCameraTarget().toString();
		const initialAnimationTime = modelViewer.currentTime;
		const animate = this.animate;
		const autoRotate = this.autoRotate;
		const variantName = modelViewer.variantName;

		this.exporting = true;

		this.switchView(this.views[view]);
		modelViewer.jumpCameraToGoal();

		// Wait for model-viewer to resize and render
		await this.rafPasses();
		await this.rafPasses();

		const posterBlob = await modelViewer.toBlob({
			idealAspect: true,
			mimeType: 'image/png',
			qualityArgument: 0.85,
		});

		const glTF = await modelViewer.exportScene();
		const file = new File([glTF], `${this.document.title}-${view}-export.png`);
		const link = document.createElement('a');
		link.download = file.name;
		link.href = URL.createObjectURL(posterBlob);
		link.click();

		// Reset everything back
		modelViewer.variantName = null;
		modelViewer.variantName = variantName;

		staticModelViewer.minimumRenderScale = initialMinimumRenderScale;

		modelViewer.style.width = '';
		modelViewer.style.height = '';

		modelViewer.cameraOrbit = initialCameraOrbit;
		modelViewer.cameraTarget = initialCameraTarget;
		modelViewer.jumpCameraToGoal();

		modelViewer.animate = animate;
		modelViewer.currentTime = initialAnimationTime;

		this.autoRotate = autoRotate;

		this.exporting = false;
	}

	// --------------------------------------------------------------------------------------------------
	showVariant(variantName?: string) {
		const modelViewer = this.modelViewer!.element.nativeElement;

		modelViewer.variantName = variantName;
	}

	// --------------------------------------------------------------------------------------------------
	toggleAutoPlay() {
		this.animate = !this.animate;

		if (!this.error) {
			if (this.animate) this.modelViewer!.element.nativeElement.play();
			else this.modelViewer!.element.nativeElement.pause();
		}
	}

	// --------------------------------------------------------------------------------------------------
	toggleAutoRotate() {
		this.autoRotate = !this.autoRotate;

		this.setAutoRotate();
	}

	// --------------------------------------------------------------------------------------------------
	private setAutoRotate() {
		if (this.autoRotate) this.modelViewer!.element.nativeElement.setAttribute('auto-rotate', true);
		else this.modelViewer!.element.nativeElement.removeAttribute('auto-rotate');
	}

	// --------------------------------------------------------------------------------------------------
	updateProgressBar(event: any) {
		const progressBar = event.target.querySelector('.progress-bar');
		const updatingBar = event.target.querySelector('.update-bar');

		updatingBar.style.width = `${event.detail.totalProgress * 100}%`;

		if (event.detail.totalProgress === 1) {
			progressBar.classList.add('hide');

			this.loaded = true;
		} else {
			progressBar.classList.remove('hide');

			this.loaded = false;
		}
	}

	// --------------------------------------------------------------------------------------------------
	handleError(_event: any) {
		this.error = true;
	}

	// --------------------------------------------------------------------------------------------------
	handleLegacyError(event: any) {
		this.toastrService.error(
			event,
			this.uiThreedRendererComponentMessages.text(
				'app.notices.error-loading-d-model-0755bd',
				'Error loading 3D model',
			),
			{ enableHtml: false },
		);
	}

	// --------------------------------------------------------------------------------------------------
	modelLoaded(_event: any) {
		const modelViewer = this.modelViewer!.element.nativeElement;

		this.availableVariants = modelViewer.availableVariants;
		if (modelViewer.availableVariants.length)
			modelViewer.variantName = modelViewer.availableVariants[0];

		this.defaultCameraZoom = `${this.roundToDigits(modelViewer.getCameraOrbit().radius, 2)}m`;

		this.canAnimate = modelViewer.availableAnimations.length > 0;

		if (this.canAnimate) this.toggleAutoPlay();

		this.setAutoRotate();

		this.error = false;
	}

	// --------------------------------------------------------------------------------------------------
	private convertAzimuthZenithToThetaPhi(azimuth: number, zenith: number) {
		const cosTheta = Math.cos(zenith) * Math.cos(azimuth);
		const theta = Math.acos(cosTheta);
		const phi = Math.atan2(Math.tan(zenith), Math.sin(azimuth));
		const modPhi = (phi + 2 * Math.PI) % (2 * Math.PI);

		return [theta * (180 / Math.PI), modPhi * (180 / Math.PI)];
	}

	// --------------------------------------------------------------------------------------------------
	private degToRad = (degrees: number): number => (degrees * Math.PI) / 180.0;

	// --------------------------------------------------------------------------------------------------
	private radToDeg = (radians: number): number => (radians * 180.0) / Math.PI;

	// --------------------------------------------------------------------------------------------------
	private roundToDigits(value: number, digits: number): number {
		if (!value) return 0;

		const x = 10 ** (Math.floor(digits) - Math.floor(Math.log10(Math.abs(value))) - 1);
		return Math.round(value * x) / x;
	}

	// --------------------------------------------------------------------------------------------------
	private rafPasses = (): Promise<void> =>
		new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export interface ModelViewerHotspot {
	// Needs to start with "hotspot-" and be unique among all hotspots
	slot: string;
	label: string;
	placement: ModelViewerHotspotLocation;
	interactiveOrbit?: string;
	interactiveFieldOfView?: string;
	interactiveTarget?: string;
	user: string;
}

export interface ModelViewerHotspotLocation {
	surface?: string;
	position?: string;
	normal?: string;
}

export interface ModelViewerStatic extends CustomElementConstructor {
	minimumRenderScale: number;
}
