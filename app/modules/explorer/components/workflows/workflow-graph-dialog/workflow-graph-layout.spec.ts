import type { WorkflowGraph } from 'app/helpers/workflows.service';
import { GraphBox, layoutWorkflowGraph } from './workflow-graph-layout';

/** The default Serial Document Review model (nuxeo-routing-default) with stock node sizes. */
const boxes = new Map<string, GraphBox>([
	['start', { left: 440, top: 0, width: 40, height: 40 }],
	['choose', { left: 420, top: 100, width: 80, height: 80 }],
	['update', { left: 620, top: 280, width: 80, height: 80 }],
	['stop', { left: 420, top: 620, width: 40, height: 40 }],
	['validate', { left: 240, top: 280, width: 80, height: 80 }],
]);
const graph: WorkflowGraph = {
	transitions: [
		{ nodeSourceId: 'start', nodeTargetId: 'choose', label: 'start' },
		{ nodeSourceId: 'choose', nodeTargetId: 'stop', label: 'cancel' },
		{
			nodeSourceId: 'choose',
			nodeTargetId: 'validate',
			label: 'review',
			path: [
				{ x: 180, y: 0 },
				{ x: 180, y: 24 },
				{ x: 0, y: 24 },
				{ x: 0, y: 100 },
			],
		},
		{
			nodeSourceId: 'validate',
			nodeTargetId: 'stop',
			label: 'finish',
			path: [
				{ x: 0, y: 0 },
				{ x: 0, y: 130 },
				{ x: 200, y: 130 },
				{ x: 200, y: 260 },
			],
		},
		{ nodeSourceId: 'validate', nodeTargetId: 'validate', label: 'reject' },
		{ nodeSourceId: 'validate', nodeTargetId: 'update', label: 'update' },
		{ nodeSourceId: 'validate', nodeTargetId: 'validate', label: 'validate' },
	],
};

describe('layoutWorkflowGraph', () => {
	const connections = layoutWorkflowGraph(graph, boxes, (label) => label.toUpperCase());

	it('anchors each source at stock bottom anchors and targets at their top centre', () => {
		expect(connections.map((c) => [c.source.x, c.source.y, c.target.x, c.target.y])).toEqual([
			[460, 40, 460, 100],
			[440, 180, 440, 620],
			[460, 180, 280, 280],
			[240, 360, 440, 620],
			[260, 360, 280, 280],
			[280, 360, 660, 280],
			[300, 360, 280, 280],
		]);
		expect(connections.map((c) => c.color)).toEqual([
			'#92e1aa',
			'#92e1aa',
			'#F7BE81',
			'#92e1aa',
			'#F7BE81',
			'#BDBDBD',
			'#5882FA',
		]);
	});

	it('routes like the jsPlumb Flowchart connector and keeps Studio paths', () => {
		expect(connections[0].path).toBe('M460,40 L460,70 L460,100');
		expect(connections[1].path).toBe('M440,180 L440,210 L440,400 L440,590 L440,620');
		expect(connections[2].path).toBe('M460,180 L460,204 L280,204 L280,280');
		expect(connections[3].path).toBe('M240,360 L240,490 L440,490 L440,620');
		// A loop without a Studio path goes round the right of its node.
		expect(connections[4].path).toBe(
			'M260,360 L260,385 Q260,390 265,390 L345,390 Q350,390 350,385 L350,255 Q350,250 345,250 L285,250 Q280,250 280,255 L280,280',
		);
	});

	it('goes round when the target sits above the source', () => {
		const [up] = layoutWorkflowGraph(
			{ transitions: [{ nodeSourceId: 'low', nodeTargetId: 'high' }] },
			new Map([
				['low', { left: 0, top: 200, width: 80, height: 80 }],
				['high', { left: 200, top: 0, width: 80, height: 80 }],
			]),
		);
		expect(up.path).toBe(
			'M40,280 L40,305 Q40,310 45,310 L135,310 Q140,310 140,305 L140,-25 Q140,-30 145,-30 L235,-30 Q240,-30 240,-25 L240,0',
		);
		expect(up.label).toBeNull();
	});

	it('places the arrow at 80% and the translated label at 60% of the connector', () => {
		expect(connections[0].arrow).toBe('M460,98 L467,78 L460,80 L453,78 L460,98');
		expect(connections[0].label).toEqual({ x: 460, y: 76, text: 'START' });
	});

	it('skips transitions whose nodes are missing', () => {
		expect(
			layoutWorkflowGraph(
				{ transitions: [{ nodeSourceId: 'start', nodeTargetId: 'gone' }] },
				boxes,
			),
		).toEqual([]);
	});
});
