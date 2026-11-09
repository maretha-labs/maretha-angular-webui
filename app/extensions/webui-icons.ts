import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	ElementRef,
	inject,
	Injectable,
	input,
	makeEnvironmentProviders,
	provideEnvironmentInitializer,
	signal,
	viewChild,
} from '@angular/core';

export interface WebUiSvgNode {
	readonly tag: string;
	readonly attributes?: Readonly<Record<string, string>>;
	readonly text?: string;
	readonly children?: readonly WebUiSvgNode[];
}
export interface WebUiIcon {
	readonly viewBox: string;
	readonly nodes: readonly WebUiSvgNode[];
}
const tags = new Set([
	'g',
	'path',
	'polygon',
	'polyline',
	'circle',
	'ellipse',
	'rect',
	'line',
	'text',
]);
const attributes = new Set([
	'd',
	'points',
	'transform',
	'fill',
	'fill-opacity',
	'fill-rule',
	'clip-rule',
	'stroke',
	'stroke-width',
	'stroke-opacity',
	'stroke-linecap',
	'stroke-linejoin',
	'x',
	'y',
	'x1',
	'x2',
	'y1',
	'y2',
	'cx',
	'cy',
	'r',
	'rx',
	'ry',
	'width',
	'height',
	'font-family',
	'font-size',
	'text-anchor',
	'xml:space',
]);

function copyNode(node: WebUiSvgNode, depth = 0): WebUiSvgNode {
	if (!tags.has(node.tag) || depth > 20) throw new Error('Unsupported SVG node.');
	for (const [key, value] of Object.entries(node.attributes ?? {})) {
		if (
			!attributes.has(key) ||
			typeof value !== 'string' ||
			/url\s*\(|javascript:|expression\s*\(/i.test(value)
		)
			throw new Error('Unsupported SVG attribute.');
	}
	if (node.text !== undefined && typeof node.text !== 'string')
		throw new Error('SVG text must be a string.');
	return Object.freeze({
		...node,
		attributes: Object.freeze({ ...node.attributes }),
		children: Object.freeze((node.children ?? []).map((child) => copyNode(child, depth + 1))),
	});
}

@Injectable({ providedIn: 'root' })
export class WebUiIcons {
	private readonly layers = signal<
		ReadonlyMap<string, { token: symbol; icons: Readonly<Record<string, WebUiIcon>> }>
	>(new Map());
	readonly catalog = computed(
		() =>
			Object.assign(
				Object.create(null),
				...[...this.layers().values()].map((layer) => layer.icons),
			) as Readonly<Record<string, WebUiIcon>>,
	);
	register(owner: string, icons: Readonly<Record<string, WebUiIcon>>): () => void {
		const token = Symbol(owner);
		const entries: Record<string, WebUiIcon> = {};
		for (const [name, icon] of Object.entries(icons)) {
			if (
				!/^[a-z][a-z0-9-]*:[a-z0-9.-]+$/.test(name) ||
				!/^-?[\d.]+(?:\s+-?[\d.]+){3}$/.test(icon.viewBox)
			)
				throw new Error('Invalid icon name or view box.');
			entries[name] = Object.freeze({
				viewBox: icon.viewBox,
				nodes: Object.freeze(icon.nodes.map((node) => copyNode(node))),
			});
		}
		this.layers.update((layers) =>
			new Map(layers).set(owner, { token, icons: Object.freeze(entries) }),
		);
		return () => {
			if (this.layers().get(owner)?.token !== token) return;
			this.layers.update((layers) => {
				const next = new Map(layers);
				next.delete(owner);
				return next;
			});
		};
	}
}

export function provideWebUiIcons(owner: string, icons: Readonly<Record<string, WebUiIcon>>) {
	return makeEnvironmentProviders([
		provideEnvironmentInitializer(() => {
			inject(DestroyRef).onDestroy(inject(WebUiIcons).register(owner, icons));
		}),
	]);
}

@Component({
	selector: 'nx-webui-icon',
	templateUrl: './webui-icons.html',
	styles:
		':host { display: inline-flex; width: var(--webui-icon-size, 24px); height: var(--webui-icon-size, 24px); flex-shrink: 0; } svg { width: 100%; height: 100%; fill: currentColor; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebUiIconComponent {
	readonly name = input.required<string>();
	readonly label = input('');
	private readonly icons = inject(WebUiIcons);
	readonly icon = computed<WebUiIcon | undefined>(() => this.icons.catalog()[this.name()]);
	private readonly svg = viewChild<ElementRef<SVGElement>>('svg');
	constructor() {
		effect(() => {
			const svg = this.svg()?.nativeElement;
			const icon = this.icon();
			if (!svg) return;
			const render = (node: WebUiSvgNode): SVGElement => {
				const element = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', node.tag);
				for (const [key, value] of Object.entries(node.attributes ?? {})) {
					if (key === 'xml:space')
						element.setAttributeNS('http://www.w3.org/XML/1998/namespace', key, value);
					else element.setAttribute(key, value);
				}
				if (node.text) element.textContent = node.text;
				for (const child of node.children ?? []) element.appendChild(render(child));
				return element;
			};
			svg.replaceChildren(...(icon?.nodes ?? []).map(render));
		});
	}
}
