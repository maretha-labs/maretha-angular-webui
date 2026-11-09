import type { WorkflowGraph } from 'app/helpers/workflows.service';

/**
 * Geometry of stock nuxeo-workflow-graph: jsPlumb 2.15 Flowchart connectors from a bottom anchor
 * of the source node to the top centre of the target node, or the transition's own Studio path.
 */
export interface GraphPoint {
	readonly x: number;
	readonly y: number;
}
export interface GraphBox {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}
export interface WorkflowGraphConnection {
	readonly color: string;
	/** SVG path data of the connector. */
	readonly path: string;
	/** SVG path data of the arrow overlay. */
	readonly arrow: string;
	readonly source: GraphPoint;
	readonly target: GraphPoint;
	readonly label: (GraphPoint & { readonly text: string }) | null;
}

const DYNAMIC_ANCHORS = [0.5, 0.25, 0.75, 0, 1, 0.375, 0.625, 0.125, 0.875];
const CONNECTION_COLORS = [
	'#92e1aa',
	'#F7BE81',
	'#BDBDBD',
	'#5882FA',
	'#E1F5A9',
	'#FA5858',
	'#FFFF00',
	'#FF0000',
	'#D8F781',
];
const STUB = 30;
const CORNER_RADIUS = 5;
const ARROW_LOCATION = 0.8;
const ARROW_LENGTH = 20;
const ARROW_WIDTH = 14;
const ARROW_FOLDBACK = 0.9;
const LABEL_LOCATION = 0.6;

export function layoutWorkflowGraph(
	graph: WorkflowGraph | null | undefined,
	boxes: ReadonlyMap<string, GraphBox>,
	translate: (label: string) => string = (label) => label,
): WorkflowGraphConnection[] {
	const transitions = graph?.transitions ?? [];
	const counts = new Map<string, number>();
	for (const { nodeSourceId } of transitions)
		counts.set(nodeSourceId, (counts.get(nodeSourceId) ?? 0) + 1);
	const seen: string[] = [];
	const connections: WorkflowGraphConnection[] = [];
	for (const transition of transitions) {
		const sourceId = transition.nodeSourceId;
		let anchorIndex = seen.filter((id) => id === sourceId).length;
		if (anchorIndex > 9) anchorIndex = 0;
		seen.push(sourceId);
		const source = boxes.get(sourceId);
		const target = boxes.get(transition.nodeTargetId);
		if (!source || !target) continue;
		// Stock sorts these with the default comparator; for these values it is numeric order.
		const anchors = DYNAMIC_ANCHORS.slice(0, counts.get(sourceId)).sort((a, b) => a - b);
		const anchor = anchors[anchorIndex] ?? 0.5;
		const start = { x: source.left + anchor * source.width, y: source.top + source.height };
		const end = { x: target.left + target.width / 2, y: target.top };
		const studio = transition.path && transition.path.length > 2 ? transition.path : null;
		const points = studio
			? studioRoute(studio, start, end)
			: flowchartRoute(
					start,
					end,
					sourceId === transition.nodeTargetId ? { anchor, width: source.width } : null,
				);
		const text = transition.label ? translate(transition.label) : '';
		const labelPoint = pointAt(points, LABEL_LOCATION);
		connections.push({
			color: CONNECTION_COLORS[anchorIndex] ?? CONNECTION_COLORS[0],
			path: studio ? straightPath(points) : roundedPath(points),
			arrow: arrowPath(points),
			source: start,
			target: end,
			label: text ? { ...labelPoint, text } : null,
		});
	}
	return connections;
}

/** Studio paths are relative to the top-left corner of the box spanned by both anchors. */
function studioRoute(
	path: readonly { x: number; y: number }[],
	start: GraphPoint,
	end: GraphPoint,
): GraphPoint[] {
	const left = Math.min(start.x, end.x);
	const top = Math.min(start.y, end.y);
	return path.map((point) => ({ x: left + Number(point.x), y: top + Number(point.y) }));
}

/** jsPlumb Flowchart routing for opposite (down → up) anchors: stub 30, midpoint 0.5. */
function flowchartRoute(
	start: GraphPoint,
	end: GraphPoint,
	loop: { anchor: number; width: number } | null,
): GraphPoint[] {
	const startStubY = start.y + STUB;
	const endStubY = end.y - STUB;
	const inProximity =
		(startStubY > endStubY && end.y > startStubY) || (start.y > endStubY && end.y > start.y);
	const middleY = (start.y + end.y) / 2;
	const [stubStartX, ss, stubEndX, es] = inProximity
		? [start.x, middleY, end.x, middleY]
		: [start.x, startStubY, end.x, endStubY];
	const midx = start.x + (end.x - start.x) / 2;
	const midy = startStubY + (endStubY - startStubY) / 2;
	let middle: GraphPoint[] = [];
	if (loop) {
		const x = stubStartX + (1 - loop.anchor) * loop.width + STUB;
		middle = [
			{ x, y: ss },
			{ x, y: es },
		];
	} else if (Math.abs(start.y - end.y) <= STUB * 2 || ss > es) {
		middle = [
			{ x: midx, y: ss },
			{ x: midx, y: es },
		];
	} else if (ss < es) {
		middle = [
			{ x: start.x, y: midy },
			{ x: end.x, y: midy },
		];
	}
	const points = [start, { x: stubStartX, y: ss }, ...middle, { x: stubEndX, y: es }, end];
	return points.filter(
		(point, index) =>
			index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
	);
}

const format = (value: number) => Number(value.toFixed(2));
const move = (point: GraphPoint) => `${format(point.x)},${format(point.y)}`;

function straightPath(points: readonly GraphPoint[]): string {
	return points.map((point, index) => `${index ? 'L' : 'M'}${move(point)}`).join(' ');
}

/** Flowchart corners turn with a 5px radius, never more than half the shorter segment. */
function roundedPath(points: readonly GraphPoint[]): string {
	if (points.length < 3) return straightPath(points);
	const commands = [`M${move(points[0])}`];
	for (let index = 1; index < points.length - 1; index++) {
		const previous = points[index - 1];
		const corner = points[index];
		const next = points[index + 1];
		const vertical = (from: GraphPoint, to: GraphPoint) => from.x === to.x;
		if (vertical(previous, corner) === vertical(corner, next)) {
			commands.push(`L${move(corner)}`);
			continue;
		}
		const radius = Math.min(
			CORNER_RADIUS,
			distance(previous, corner) / 2,
			distance(corner, next) / 2,
		);
		const before = toward(corner, previous, radius);
		const after = toward(corner, next, radius);
		commands.push(`L${move(before)}`, `Q${move(corner)} ${move(after)}`);
	}
	commands.push(`L${move(points[points.length - 1])}`);
	return commands.join(' ');
}

/** jsPlumb Arrow overlay at location 0.8: length 20, width 14, foldback 0.9, centred on the point. */
function arrowPath(points: readonly GraphPoint[]): string {
	const total = length(points);
	if (!total) return '';
	const mid = pointAtDistance(points, total * ARROW_LOCATION);
	const head = pointAtDistance(points, total * ARROW_LOCATION + ARROW_LENGTH / 2);
	const tail = toward(head, mid, ARROW_LENGTH);
	const dx = tail.x - head.x;
	const dy = tail.y - head.y;
	const size = Math.hypot(dx, dy) || 1;
	const half = ARROW_WIDTH / 2;
	const left = { x: tail.x - (dy / size) * half, y: tail.y + (dx / size) * half };
	const right = { x: tail.x + (dy / size) * half, y: tail.y - (dx / size) * half };
	const fold = toward(head, tail, ARROW_FOLDBACK * ARROW_LENGTH);
	return `M${move(head)} L${move(left)} L${move(fold)} L${move(right)} L${move(head)}`;
}

function pointAt(points: readonly GraphPoint[], location: number): GraphPoint {
	return pointAtDistance(points, length(points) * location);
}

function pointAtDistance(points: readonly GraphPoint[], wanted: number): GraphPoint {
	let travelled = 0;
	for (let index = 1; index < points.length; index++) {
		const segment = distance(points[index - 1], points[index]);
		if (travelled + segment >= wanted && segment > 0)
			return toward(points[index - 1], points[index], wanted - travelled);
		travelled += segment;
	}
	return points[points.length - 1];
}

function length(points: readonly GraphPoint[]): number {
	let total = 0;
	for (let index = 1; index < points.length; index++)
		total += distance(points[index - 1], points[index]);
	return total;
}

function distance(from: GraphPoint, to: GraphPoint): number {
	return Math.hypot(to.x - from.x, to.y - from.y);
}

function toward(from: GraphPoint, to: GraphPoint, by: number): GraphPoint {
	const size = distance(from, to);
	if (!size) return from;
	return { x: from.x + ((to.x - from.x) / size) * by, y: from.y + ((to.y - from.y) / size) * by };
}
