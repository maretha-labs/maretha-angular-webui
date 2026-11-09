import {
	Component,
	AfterViewInit,
	Input,
	ViewChild,
	ElementRef,
	Output,
	EventEmitter,
	HostListener,
	ChangeDetectionStrategy,
} from '@angular/core';
import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
// `LegacyGLTFLoader` is attached to the global `THREE` namespace at runtime by
// `assets/js/LegacyGLTFLoader.js` (listed in angular.json scripts).
declare let THREE: any;
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LazyCacheService } from 'app/helpers/lazy-cache.service';

@Component({
	selector: 'nx-legacy-model-viewer',
	templateUrl: './legacy-model-vewer.component.html',
	styleUrls: ['./legacy-model-vewer.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxLegacyModelViewerComponent implements AfterViewInit {
	@ViewChild('canvas')
	private canvasRef!: ElementRef;

	public get canvas(): HTMLCanvasElement {
		return this.canvasRef.nativeElement;
	}

	@Input()
	public set src(value: string) {
		this.load(value);
	}

	@Input()
	animate = true;

	@Output()
	progress = new EventEmitter();

	@Output()
	error = new EventEmitter();

	private camera!: PerspectiveCamera;
	private controls!: OrbitControls;
	private model: any;
	private gltfLoader = new THREE.LegacyGLTFLoader();
	private renderer!: WebGLRenderer;
	private scene = new Scene();

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly elementRef: ElementRef,
		private readonly lazyCacheService: LazyCacheService,
	) {}

	// --------------------------------------------------------------------------------------------------
	@HostListener('window:resize', ['$event'])
	resize(_event: any) {
		this.canvas.width = this.elementRef.nativeElement.clientWidth;
		this.canvas.height = this.elementRef.nativeElement.clientHeight;

		this.camera.aspect = this.getAspectRatio();
		this.camera.updateProjectionMatrix();

		this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);

		this.fitCameraToCenteredObject();
	}

	// --------------------------------------------------------------------------------------------------
	private createCamera() {
		this.camera = new THREE.PerspectiveCamera(45, this.getAspectRatio(), 1, 2000);
		this.camera.position.x = 20;
		this.camera.position.y = 20;
		this.camera.position.z = 20;
		this.camera.lookAt(this.scene.position);
	}

	// --------------------------------------------------------------------------------------------------
	private createLights() {
		const ambientLight = new THREE.AmbientLight(0x00000, 100);
		this.scene.add(ambientLight);
		const directionalLight = new THREE.DirectionalLight(0xffdf04, 0.4);
		directionalLight.position.set(0, 1, 0);
		directionalLight.castShadow = true;
		this.scene.add(directionalLight);
		const light1 = new THREE.PointLight(0x4b371c, 10);
		light1.position.set(0, 200, 400);
		this.scene.add(light1);
		const light2 = new THREE.PointLight(0x4b371c, 10);
		light2.position.set(500, 100, 0);
		this.scene.add(light2);
		const light3 = new THREE.PointLight(0x4b371c, 10);
		light3.position.set(0, 100, -500);
		this.scene.add(light3);
		const light4 = new THREE.PointLight(0x4b371c, 10);
		light4.position.set(-500, 300, 500);
		this.scene.add(light4);
	}

	// --------------------------------------------------------------------------------------------------
	private createRenderer() {
		this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
		this.renderer.setPixelRatio(devicePixelRatio);
		this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
		this.renderer.setClearColor(0x000000, 0); // the default
	}

	// --------------------------------------------------------------------------------------------------
	private createControls() {
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		// this.controls.minDistance = 180;
		// this.controls.maxDistance = 10;
		this.controls.autoRotate = true;
		this.controls.enableZoom = true;
		this.controls.enablePan = true;
		this.controls.update();
	}

	// --------------------------------------------------------------------------------------------------
	private load(src: string) {
		this.lazyCacheService.getBlob(src).subscribe((x) => {
			const blob = x[Object.keys(x)[0]];

			this.gltfLoader.load(
				blob,
				(gltf: GLTF) => {
					this.model = gltf.scene.children[0];

					// Clear scene first
					this.scene.children = this.scene.children.filter((x: any) => x.type !== 'Object3D');
					this.scene.add(this.model);

					const box = new THREE.Box3().setFromObject(this.model);
					box.getCenter(this.model.position); // this re-sets the mesh position
					this.model.position.multiplyScalar(-1);

					this.fitCameraToCenteredObject();
				},
				(e: any) =>
					this.progress.emit({
						target: this.elementRef.nativeElement,
						detail: {
							totalProgress: e.loaded / e.total,
						},
					}),
				(e: any) => this.error.emit(e),
			);
		});
	}

	// --------------------------------------------------------------------------------------------------
	private getAspectRatio = () => this.canvas.clientWidth / this.canvas.clientHeight;

	// --------------------------------------------------------------------------------------------------
	private animateModel() {
		if (this.model && this.animate) this.model.rotation.z += 0.0025;
	}

	// --------------------------------------------------------------------------------------------------
	private fitCameraToCenteredObject(offset?: number) {
		const boundingBox = new THREE.Box3();
		boundingBox.setFromObject(this.model);

		const center = boundingBox.getCenter(new THREE.Vector3());
		const size = boundingBox.getSize(new THREE.Vector3());

		this.camera.aspect =
			this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight;

		const fov = this.camera.fov * (Math.PI / 180);
		const fovh = 2 * Math.atan(Math.tan(fov / 2) * this.camera.aspect);
		const dx = size.z / 2 + Math.abs(size.x / 2 / Math.tan(fovh / 2));
		const dy = size.z / 2 + Math.abs(size.y / 2 / Math.tan(fov / 2));
		let cameraZ = Math.max(dx, dy);

		// offset the camera, if desired (to avoid filling the whole canvas)
		offset = offset || 1.2;
		if (offset) cameraZ *= offset;

		this.camera.position.set(5, 5, cameraZ);

		// set the far plane of the camera so that it easily encompasses the whole object
		const minZ = boundingBox.min.z;
		const cameraToFarEdge = minZ < 0 ? -minZ + cameraZ : cameraZ - minZ;

		this.camera.far = cameraToFarEdge * 3;
		this.camera.updateProjectionMatrix();

		// set camera to rotate around the center
		this.controls.target = new THREE.Vector3(0, 0, 0);

		// prevent camera from zooming out far enough to create far plane cutoff
		this.controls.maxDistance = cameraToFarEdge * 2;

		this.camera.lookAt(center);
	}

	// --------------------------------------------------------------------------------------------------
	private startRenderingLoop() {
		const render = () => {
			this.renderer.render(this.scene, this.camera);
			this.animateModel();

			requestAnimationFrame(render);
		};
		render();
	}

	// --------------------------------------------------------------------------------------------------
	ngAfterViewInit() {
		this.createRenderer();
		this.createCamera();
		this.createLights();
		this.createControls();
		this.startRenderingLoop();
	}
}
