import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { WebUiMessagePipe, WebUiNumberPipe } from '@maretha/webui-sdk';
import { DocumentDistributionNode } from '../../helpers/analytics.service';
interface Segment {
	path: string;
	name: string;
	count: number;
	shape: string;
	color: string;
}
@Component({
	selector: 'nx-distribution-chart',
	imports: [WebUiMessagePipe, WebUiNumberPipe],
	template: `<div class="distribution-chart">
		<svg
			viewBox="-310 -310 620 620"
			role="img"
			[attr.aria-label]="'distributionAnalytics.heading' | webuiMessage: 'Document Distribution'"
		>
			@for (segment of segments(); track segment.path) {
				<path
					[attr.d]="segment.shape"
					[attr.fill]="segment.color"
					role="button"
					tabindex="0"
					[attr.aria-label]="segment.path + ': ' + (segment.count | webuiNumber)"
					(click)="navigate.emit(segment.path)"
					(keydown.enter)="navigate.emit(segment.path)"
					(keydown.space)="$event.preventDefault(); navigate.emit(segment.path)"
				>
					<title>{{ segment.path }}: {{ segment.count | webuiNumber }}</title>
				</path>
			}
		</svg>
		<ul>
			@for (segment of segments(); track segment.path) {
				<li>
					<button type="button" (click)="navigate.emit(segment.path)">
						<span [style.background]="segment.color"></span>{{ segment.name }} ({{
							segment.count | webuiNumber
						}})
					</button>
				</li>
			}
		</ul>
	</div>`,
	styles: `
		.distribution-chart {
			display: flex;
			align-items: center;
			gap: 24px;
		}
		svg {
			display: block;
			width: min(70%, 650px);
			min-width: 0;
		}
		path {
			stroke: var(--nuxeo-box);
			stroke-width: 1;
		}
		ul {
			max-height: 500px;
			overflow: auto;
			list-style: none;
			padding: 0;
		}
		button {
			display: flex;
			align-items: center;
			gap: 8px;
			border: 0;
			background: transparent;
			color: inherit;
			padding: 8px;
			text-align: start;
		}
		span {
			width: 12px;
			height: 12px;
			display: inline-block;
			flex-shrink: 0;
		}
		@media (max-width: 720px) {
			.distribution-chart {
				flex-direction: column;
			}
			svg {
				width: 100%;
			}
			ul {
				max-height: 180px;
				width: 100%;
			}
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DistributionChartComponent {
	readonly nodes = input.required<DocumentDistributionNode[]>();
	readonly path = input.required<string>();
	readonly navigate = output<string>();
	readonly segments = computed(() => distributionSegments(this.nodes(), this.path()));
}
export function distributionSegments(nodes: DocumentDistributionNode[], path: string): Segment[] {
	const palette = ['#b8e5f8', '#b3b8ff', '#c3e7d0', '#f8d7a5', '#dabef1', '#f5bfc7'];
	const maxDepth = (entries: DocumentDistributionNode[]): number =>
		entries.length ? 1 + Math.max(...entries.map((node) => maxDepth(node.children))) : 0;
	const width = 260 / (maxDepth(nodes) + 1);
	const result: Segment[] = [];
	const visit = (
		entries: DocumentDistributionNode[],
		prefix: string,
		start: number,
		end: number,
		depth: number,
		total: number,
		color?: string,
	) => {
		let angle = start;
		entries.forEach((node, index) => {
			const next = angle + ((end - start) * node.count) / (total || 1);
			const inner = (depth + 1) * width;
			const outer = (depth + 2) * width;
			const point = (radius: number, a: number) =>
				`${radius * Math.cos(a)},${radius * Math.sin(a)}`;
			const a = angle - Math.PI / 2;
			const b = Math.min(next, angle + 2 * Math.PI - 0.000001) - Math.PI / 2;
			const large = b - a > Math.PI ? 1 : 0;
			const current = `${prefix.replace(/\/$/, '')}/${node.name}/`;
			const fill = color ?? palette[index % palette.length];
			if (node.count > 0) {
				result.push({
					path: current,
					name: node.name,
					count: node.count,
					color: fill,
					shape: `M${point(inner, a)} L${point(outer, a)} A${outer},${outer} 0 ${large} 1 ${point(outer, b)} L${point(inner, b)} A${inner},${inner} 0 ${large} 0 ${point(inner, a)} Z`,
				});
				visit(node.children, current, angle, next, depth + 1, node.count, fill);
			}
			angle = next;
		});
	};
	visit(
		nodes,
		path,
		0,
		2 * Math.PI,
		0,
		nodes.reduce((sum, node) => sum + node.count, 0),
	);
	return result;
}
