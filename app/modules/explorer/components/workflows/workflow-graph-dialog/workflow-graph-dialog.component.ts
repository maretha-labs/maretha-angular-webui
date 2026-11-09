import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	inject,
	signal,
	viewChild,
	ViewEncapsulation,
} from '@angular/core';
import { WebUiMessagePipe, WebUiMessages } from '@maretha/webui-sdk';
import { BsModalRef, ModalOptions } from 'ngx-bootstrap/modal';
import type { WorkflowGraph, WorkflowGraphNode } from 'app/helpers/workflows.service';
import { GraphBox, layoutWorkflowGraph, WorkflowGraphConnection } from './workflow-graph-layout';

let workflowGraphDialogSequence = 0;

/** The stock nuxeo-workflow-graph dialog: the 880×720 graph canvas and a Close button. */
@Component({
	selector: 'nx-workflow-graph-dialog',
	imports: [WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	encapsulation: ViewEncapsulation.None,
	host: { class: 'nx-workflow-graph' },
	template: `
		<h2 class="visually-hidden" [id]="titleId">
			{{ 'documentPage.route.view.graph' | webuiMessage: 'View Graph' }}
		</h2>
		<div class="nx-workflow-graph__scroller">
			<div #container class="nx-workflow-graph__container">
				<svg class="nx-workflow-graph__connections" aria-hidden="true">
					@for (connection of connections(); track $index) {
						<path class="nx-workflow-graph__outline" [attr.d]="connection.path" />
						<path
							class="nx-workflow-graph__connector"
							[attr.d]="connection.path"
							[attr.stroke]="connection.color"
						/>
						<path
							class="nx-workflow-graph__arrow"
							[attr.d]="connection.arrow"
							[attr.fill]="connection.color"
							[attr.stroke]="connection.color"
						/>
					}
				</svg>
				@for (node of nodes; track node.id) {
					<div
						class="workflow_node"
						[class]="nodeClass(node)"
						[attr.data-node-id]="node.id"
						[style.left.px]="node.x"
						[style.top.px]="node.y"
					>
						{{ node.title }}
					</div>
				}
				<svg class="nx-workflow-graph__endpoints" aria-hidden="true">
					@for (connection of connections(); track $index) {
						<circle
							[attr.cx]="connection.source.x"
							[attr.cy]="connection.source.y"
							r="6"
							fill="#92e1aa"
						/>
						<circle
							[attr.cx]="connection.target.x"
							[attr.cy]="connection.target.y"
							r="6"
							fill="#003f7d"
						/>
					}
				</svg>
				@for (connection of connections(); track $index) {
					@if (connection.label; as label) {
						<div
							class="workflow_connection_label"
							[style.left.px]="label.x"
							[style.top.px]="label.y"
						>
							<span [attr.title]="label.text">{{ label.text }}</span>
						</div>
					}
				}
			</div>
		</div>
		<div class="nx-workflow-graph__buttons">
			<button type="button" class="nx-workflow-graph__close" (click)="close()">
				{{ 'command.close' | webuiMessage: 'Close' }}
			</button>
		</div>
	`,
	styles: `
		.modal-dialog.nx-workflow-graph-dialog {
			width: max-content;
			max-width: calc(100vw - 80px);
			margin: 24px auto;

			> .modal-content {
				max-height: calc(100dvh - 48px);
				overflow: hidden;
				border: 0;
				border-radius: 0;
				color: var(--nuxeo-text-default);
				background: var(--nuxeo-box, #fff);
				font-family: var(--nuxeo-app-font);
				font-size: 13px;
				line-height: 1.54;
				box-shadow:
					0 16px 24px 2px #00000024,
					0 6px 30px 5px #0000001f,
					0 8px 10px -5px #0006;
			}
		}
		body:has(modal-container > .nx-workflow-graph-dialog) > .modal-backdrop {
			opacity: 0.6;
		}
		.nx-workflow-graph {
			display: flex;
			flex-direction: column;
			min-height: 0;
			max-height: calc(100dvh - 48px);
		}
		.nx-workflow-graph__scroller {
			flex: 1 1 auto;
			min-height: 0;
			margin-top: 24px;
			padding: 0 24px;
			overflow: auto;
		}
		.nx-workflow-graph__container {
			position: relative;
			width: 880px;
			height: 720px;
		}
		.nx-workflow-graph__connections,
		.nx-workflow-graph__endpoints {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
			overflow: visible;
			pointer-events: none;
		}
		.nx-workflow-graph__endpoints {
			z-index: 110;
		}
		.nx-workflow-graph__outline,
		.nx-workflow-graph__connector {
			fill: none;
			stroke-linejoin: round;
		}
		.nx-workflow-graph__outline {
			stroke: #fff;
			stroke-width: 7;
		}
		.nx-workflow-graph__connector {
			stroke-width: 3;
		}
		.nx-workflow-graph__arrow {
			stroke-width: 3;
		}
		.nx-workflow-graph .workflow_node {
			position: absolute;
			text-align: center;
			font-size: 0.92em;
			z-index: 100;
		}
		.nx-workflow-graph .workflow_simple_task,
		.nx-workflow-graph .workflow_multiple_task {
			height: 80px;
			width: 80px;
			color: #006da6;
			padding-top: 1.2em;
			background-color: #f7f8f9;
			border-radius: 0.5em;
			box-sizing: border-box;
		}
		.nx-workflow-graph .workflow_simple_task {
			border: 1px solid #3c9ae2;
		}
		.nx-workflow-graph .workflow_multiple_task {
			border: 3px double #3c9ae2;
		}
		.nx-workflow-graph .workflow_fork_node,
		.nx-workflow-graph .workflow_merge_node {
			width: 0;
			height: 0;
			border-bottom: 40px solid #a4c9da;
			border-left: 20px solid transparent;
			border-right: 20px solid transparent;
			line-height: 100%;
		}
		.nx-workflow-graph .workflow_merge_node {
			border-top: 40px solid #dededd;
			border-bottom: 0;
			line-height: 0;
		}
		.nx-workflow-graph .workflow_start_node,
		.nx-workflow-graph .workflow_end_node {
			width: 40px;
			height: 40px;
			background: #92c938;
			border-radius: 40px;
			color: #fff;
			line-height: 40px;
		}
		.nx-workflow-graph .workflow_end_node {
			background: #f04545;
		}
		.nx-workflow-graph .workflow_subworkflow_task {
			border: 2px solid #3c9ae2;
		}
		.nx-workflow-graph .workflow_node_suspended {
			background-color: #3c9ae2;
			font-weight: bold;
			color: #fff;
		}
		.nx-workflow-graph .workflow_connection_label {
			position: absolute;
			transform: translate(-50%, -50%);
			background-color: white;
			padding: 0.15em 0.25em;
			font: 12px sans-serif;
			color: #3780b9;
			z-index: 120;
			border: 1px dotted rgba(0, 0, 0, 0.2);
			opacity: 0.85;
			width: max-content;
			max-width: 170px;
			overflow-wrap: break-word;
		}
		.nx-workflow-graph__buttons {
			display: flex;
			justify-content: space-between;
			margin-top: 16px;
			padding: 8px 8px 8px 24px;
		}
		.nx-workflow-graph__close {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			box-sizing: border-box;
			min-width: 96px;
			min-height: 40px;
			margin: 0;
			padding: 8px 16px;
			border: 1px solid var(--nuxeo-primary-color, #0066ff);
			border-radius: 0.1em;
			color: var(--nuxeo-button-primary-text, #fff);
			background-color: var(--nuxeo-button-primary, #0066ff);
			font-family: var(--nuxeo-app-font);
			font-size: 13px;
			font-weight: 600;
			text-transform: capitalize;
			cursor: pointer;
		}
		.nx-workflow-graph__close:hover,
		.nx-workflow-graph__close:focus {
			border-color: var(--nuxeo-button-primary-focus, #1f28bf);
			background-color: var(--nuxeo-button-primary-focus, #1f28bf);
		}
	`,
})
export class WorkflowGraphDialogComponent {
	private readonly modal = inject(BsModalRef);
	private readonly messages = inject(WebUiMessages);
	private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');
	/** Set through the modal's initial state. */
	titleId = 'workflow-graph-dialog-title';
	graph: WorkflowGraph | null = null;
	readonly connections = signal<readonly WorkflowGraphConnection[]>([]);

	get nodes(): readonly WorkflowGraphNode[] {
		return this.graph?.nodes ?? [];
	}

	constructor() {
		// Connectors follow the rendered node boxes, as jsPlumb measures its elements.
		afterNextRender(() => this.connections.set(this.layout()));
	}

	nodeClass(node: WorkflowGraphNode): string {
		const kind = node.isStartNode
			? 'workflow_start_node'
			: node.isEndNode
				? 'workflow_end_node'
				: node.isForkNode
					? 'workflow_fork_node'
					: node.isMerge
						? 'workflow_merge_node'
						: node.isMultiTask
							? 'workflow_multiple_task'
							: node.hasSubWorkflow
								? 'workflow_subworkflow_task'
								: 'workflow_simple_task';
		return `workflow_node ${kind}${node.state === 'suspended' ? ' workflow_node_suspended' : ''}`;
	}

	close(): void {
		this.modal.hide();
	}

	private layout(): WorkflowGraphConnection[] {
		const boxes = new Map<string, GraphBox>();
		const elements = this.container().nativeElement.querySelectorAll<HTMLElement>('[data-node-id]');
		elements.forEach((element) => {
			const node = this.nodes.find((entry) => entry.id === element.dataset['nodeId']);
			if (!node) return;
			const fallback = /start|end|fork|merge/.test(this.nodeClass(node)) ? 40 : 80;
			boxes.set(node.id, {
				left: Number(node.x) || 0,
				top: Number(node.y) || 0,
				width: element.offsetWidth || fallback,
				height: element.offsetHeight || fallback,
			});
		});
		return layoutWorkflowGraph(this.graph, boxes, (label) => this.messages.text(label, label));
	}
}

export function workflowGraphDialogOptions(graph: WorkflowGraph): ModalOptions {
	const titleId = `workflow-graph-dialog-title-${++workflowGraphDialogSequence}`;
	return {
		class: 'nx-workflow-graph-dialog',
		keyboard: true,
		ignoreBackdropClick: false,
		ariaLabelledBy: titleId,
		initialState: { graph, titleId },
	};
}
