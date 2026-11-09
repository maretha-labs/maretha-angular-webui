import { RendererInterface, FramingInfo, Camera } from '@google/model-viewer/lib/model-viewer-base';
import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
// `LegacyGLTFLoader` is attached to the global `THREE` namespace at runtime by
// `assets/js/LegacyGLTFLoader.js` (listed in angular.json scripts).
declare let THREE: any;

export class LegacyGltfRenderer implements RendererInterface {
	private readonly gltfLoader = new THREE.LegacyGLTFLoader();

	private camera!: PerspectiveCamera;
	private controls!: OrbitControls;
	private model: any;
	private renderer!: WebGLRenderer;
	private scene = new Scene();

	private _blob?: string;
	private _canvas?: HTMLCanvasElement;
	private initialized = false;

	public set canvas(canvasElement: HTMLCanvasElement | undefined) {
		this._canvas = canvasElement;

		if (!canvasElement) return;

		this.createRenderer();
		this.createCamera();
		this.createControls();
	}

	public set src(value: string | undefined) {
		this._blob = value;
	}

	public get src() {
		return this._blob;
	}

	private createCamera() {
		this.camera = new THREE.PerspectiveCamera(45, this.getAspectRatio(), 1, 2000);
		this.camera.position.x = 20;
		this.camera.position.y = 20;
		this.camera.position.z = 20;
		this.camera.lookAt(this.scene.position);
	}

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

	private createRenderer() {
		this.renderer = new THREE.WebGLRenderer({
			canvas: this._canvas!,
			antialias: true,
			alpha: true,
		});
		this.renderer.setPixelRatio(devicePixelRatio);
		this.renderer.setSize(this._canvas!.clientWidth, this._canvas!.clientHeight);
		this.renderer.setClearColor(0x000000, 0); // the default
	}

	private getAspectRatio = () => this._canvas!.clientWidth / this._canvas!.clientHeight;

	private createControls() {
		const renderer = new CSS2DRenderer();
		renderer.setSize(this._canvas!.clientWidth, this._canvas!.clientHeight);
		renderer.domElement.style.position = 'absolute';
		renderer.domElement.style.top = '0px';
		renderer.domElement.style.left = '0px';
		renderer.domElement.style.bottom = '0px';
		renderer.domElement.style.right = '0px';
		this._canvas!.parentElement!.appendChild(renderer.domElement);

		this.controls = new OrbitControls(this.camera, renderer.domElement);
		// this.controls.minDistance = 180;
		// this.controls.maxDistance = 10;\
		this.controls.autoRotate = true;
		this.controls.enableZoom = true;
		this.controls.enablePan = true;
		this.controls.update();
	}

	private animateModel() {
		if (this.model) this.model.rotation.z += 0.005;
	}

	load(progressCallback: (progress: number) => void): Promise<FramingInfo> {
		return new Promise((resolve, reject) => {
			this.gltfLoader.load(
				this._blob,
				(gltf: any) => {
					if (this._canvas) {
						this.model = gltf.scene.children[0];
						// console.log(this.model);
						const box = new THREE.Box3().setFromObject(this.model);
						box.getCenter(this.model.position); // this re-sets the mesh position
						this.model.position.multiplyScalar(-1);

						this.scene.children = this.scene.children.filter((x: any) => x.type !== 'Object3D');
						this.scene.add(this.model);

						resolve({ framedRadius: 15, fieldOfViewAspect: 1 });
					} else reject('The canvas element is missing');
				},
				(e: any) => progressCallback(e.loaded / e.total),
				(e: any) => {
					console.log('onError', e);

					reject(e);
				},
			);
		});
	}

	render(_camera: Camera): void {
		if (this.renderer) {
			this.renderer.render(this.scene, this.camera);
			this.animateModel();
		}
	}

	resize(_width: number, _height: number): void {
		this.createCamera();
		this.createControls();
	}
}
