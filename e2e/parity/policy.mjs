import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const validateSchema = new Ajv2020({ strict: true, allErrors: true }).compile(
	JSON.parse(readFileSync(resolve('e2e/parity/scenarios.schema.json'), 'utf8')),
);

const localBase = 'http://127.0.0.1:4314/';
// Hosted comparisons name their two origins at run time; nothing in the tree defaults to a host.
const hostedTargets = {
	reference: ['PARITY_REFERENCE_ORIGIN', '/nuxeo/ui/'],
	candidate: ['PARITY_CANDIDATE_ORIGIN', '/nuxeo/ng/'],
};
const secret =
	/(?:access.?token|refresh.?token|password|passwd|credential|authorization|client.?secret|code|ticket|saml|session|jwt)/i;
const slug = /^[a-z0-9][a-z0-9_-]{0,100}$/;
const identifier = /^[a-z0-9][a-z0-9_.-]{0,120}$/;
const properties = new Set([
	'width',
	'height',
	'x',
	'y',
	'font-size',
	'font-weight',
	'font-family',
	'line-height',
	'letter-spacing',
	'padding',
	'border-radius',
	'opacity',
	'background-color',
	'color',
	'border-bottom-width',
	'box-shadow',
]);
const keys = new Set([
	'Escape',
	'Enter',
	'Tab',
	'Shift+Tab',
	'Space',
	'ArrowDown',
	'ArrowUp',
	'Home',
	'End',
]);
// POST is denied unless its exact Nuxeo automation operation is a known read.
const reads = new Set(['Document.Query', 'Document.PageProvider', 'Repository.PageProvider']);
function check(condition, message) {
	if (!condition) throw new Error(`PARITY PRECONDITION: ${message}`);
}
/** The https origin named by `variable`: scheme and host only, no path, credentials, query or fragment. */
function hostedOrigin(env, variable) {
	const value = env[variable];
	check(
		Boolean(value),
		`${variable} must name the hosted origin, for example https://nuxeo.example.`,
	);
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`PARITY PRECONDITION: ${variable} is not a URL.`);
	}
	check(
		url.protocol === 'https:' &&
			!url.username &&
			!url.password &&
			url.pathname === '/' &&
			!url.search &&
			!url.hash,
		`${variable} must be an https origin without path, credentials, query or fragment.`,
	);
	return url.origin;
}
export function settings(env = process.env) {
	const mode = env.PARITY_MODE || 'local';
	check(['local', 'hosted'].includes(mode), 'mode must be local or hosted.');
	if (mode === 'hosted') {
		check(
			env.PARITY_ALLOW_HOSTED === 'read-only',
			'hosted access requires explicit read-only opt-in.',
		);
		check(
			Boolean(env.PARITY_USERNAME && env.PARITY_PASSWORD),
			'hosted credentials must be supplied at runtime.',
		);
	}
	const bases = { local: localBase };
	const origins = [];
	if (mode === 'hosted')
		for (const [name, [variable, path]] of Object.entries(hostedTargets)) {
			const origin = hostedOrigin(env, variable);
			bases[name] = `${origin}${path}`;
			origins.push(origin);
		}
	const runId = env.PARITY_RUN_ID || `capture-${randomUUID()}`;
	check(slug.test(runId), 'run ID must be a short lowercase identifier.');
	check(
		!env.PARITY_SCENARIO || identifier.test(env.PARITY_SCENARIO),
		'scenario filter is invalid.',
	);
	return {
		mode,
		runId,
		output: resolve('dist/verification/parity', runId),
		baseline: env.PARITY_BASELINE_DIR ? resolve(env.PARITY_BASELINE_DIR) : undefined,
		scenario: env.PARITY_SCENARIO,
		username: mode === 'hosted' ? env.PARITY_USERNAME : undefined,
		password: mode === 'hosted' ? env.PARITY_PASSWORD : undefined,
		bases,
		origins: [...new Set(origins)],
	};
}
export function routeUrl(base, route) {
	check(typeof route === 'string' && route.length < 2048, 'a concrete route is required.');
	check(!/^(?:[a-z]+:|\/\/)/i.test(route), 'routes must stay inside their application.');
	let decoded;
	try {
		decoded = decodeURIComponent(route);
	} catch {
		throw new Error('PARITY PRECONDITION: route encoding is invalid.');
	}
	check(
		!decoded.includes('\\') && !/(?:^|\/)\.\.(?:\/|$|\?)/.test(decoded),
		'route traversal is forbidden.',
	);
	const url = new URL(route.replace(/^\//, ''), base);
	const root = new URL(base);
	check(
		url.origin === root.origin && url.pathname.startsWith(root.pathname),
		'route escaped its application.',
	);
	check(!url.username && !url.password, 'credentials cannot appear in routes.');
	for (const key of url.searchParams.keys())
		check(!secret.test(key), 'authentication parameters cannot appear in capture routes.');
	check(
		!/(?:access_token|refresh_token|id_token|password|code)=/i.test(url.hash),
		'authentication fragments cannot be captured.',
	);
	return url.href;
}
export function safeUrl(value) {
	try {
		const url = new URL(value);
		return `${url.origin}${url.pathname}`;
	} catch {
		return 'invalid-url';
	}
}
export function assetIdentityAllowed(value) {
	try {
		const url = new URL(value);
		return (
			['http:', 'https:'].includes(url.protocol) &&
			/\.(?:js|css)$/i.test(url.pathname) &&
			!/\/(?:env\.js|config\.[^/]+)$/i.test(url.pathname)
		);
	} catch {
		return false;
	}
}
export function identityMatches(record, expected) {
	return Boolean(
		expected?.path &&
		expected.sha256 &&
		expected.source &&
		Array.isArray(record?.assets) &&
		record.assets.some(
			(asset) =>
				assetIdentityAllowed(asset.url) &&
				new URL(asset.url).pathname === expected.path &&
				asset.sha256 === expected.sha256,
		),
	);
}
export function baselineIssue(record, scenario, target, expected) {
	if (
		record?.status !== 'captured-unverified' ||
		record.scenario !== scenario ||
		record.target !== target
	)
		return 'Reference capture identity/status is invalid.';
	if (
		!Array.isArray(record.blocked) ||
		record.blocked.length ||
		!Array.isArray(record.measurements) ||
		record.measurements.some((metric) => metric.matched !== true)
	)
		return 'Reference capture has failed checks or blocked requests.';
	if (!record.images?.viewport || Object.keys(record.images).length === 0)
		return 'Reference images are missing.';
	if (target === 'reference' && !identityMatches(record, expected))
		return 'Reference does not match the current expected bundle identity.';
	return undefined;
}
export function requestAllowed(mode, method, value, origins = []) {
	let url;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return false;
	if (mode === 'local')
		return url.origin === new URL(localBase).origin && ['GET', 'HEAD'].includes(method);
	if (mode !== 'hosted' || !origins.includes(url.origin) || !url.pathname.startsWith('/nuxeo/'))
		return false;
	let path;
	try {
		path = decodeURIComponent(url.pathname);
	} catch {
		return false;
	}
	if (
		/%(?:2f|5c)/i.test(url.pathname) ||
		path.includes('\\') ||
		/\/(?:logout|nxlogout|delete|remove|purge)(?:[/.]|$)/i.test(path)
	)
		return false;
	if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
	if (method !== 'POST') return false;
	const operation = /^\/nuxeo\/site\/automation\/([^/]+)\/?$/.exec(url.pathname)?.[1];
	return reads.has(operation);
}
export function validateManifest(value) {
	check(validateSchema(value), 'manifest schema is invalid.');
	check(
		value?.version === 1 && Array.isArray(value.scenarios),
		'manifest version/scenarios are invalid.',
	);
	check(!value.captureDefaults?.masks?.length, 'capture masks are unsupported.');
	const ids = new Set();
	const inventory = new Set(value.inventoryCoverage.rows.map((row) => row.inventory));
	for (const scenario of value.scenarios) {
		check(
			identifier.test(scenario.id) && !ids.has(scenario.id),
			'scenario IDs must be unique identifiers.',
		);
		ids.add(scenario.id);
		check(
			scenario.fixtures.every((key) => Object.hasOwn(value.fixtures, key)),
			'scenario refers to an unknown fixture.',
		);
		check(
			scenario.inventory.every((id) => inventory.has(id)),
			'scenario refers to an unknown inventory row.',
		);
		const r = scenario.rendering;
		check(
			r &&
				Number.isInteger(r.viewport?.width) &&
				Number.isInteger(r.viewport?.height) &&
				r.viewport.width >= 200 &&
				r.viewport.height >= 200 &&
				r.viewport.width <= 5000 &&
				r.viewport.height <= 5000,
			'viewport is invalid.',
		);
		check(
			r.zoom === 1 &&
				r.deviceScaleFactor > 0 &&
				r.deviceScaleFactor <= 4 &&
				['ltr', 'rtl'].includes(r.direction),
			'rendering scale/direction is invalid.',
		);
		check(
			typeof r.locale === 'string' && typeof r.theme === 'string' && typeof r.timezone === 'string',
			'rendering locale/theme/timezone are required.',
		);
		try {
			new Intl.DateTimeFormat(r.locale, { timeZone: r.timezone });
		} catch {
			throw new Error('PARITY PRECONDITION: rendering locale/timezone is invalid.');
		}
		check(
			Array.isArray(scenario.prerequisites) && Array.isArray(scenario.excludedRegions),
			'prerequisites/exclusions must be explicit.',
		);
		check(!scenario.masks?.length, 'screenshot masks are not supported by this capture contract.');
		for (const name of ['reference', 'candidate', 'local']) {
			const target = scenario.targets?.[name];
			if (!target && name === 'local') continue;
			check(
				target && typeof target.runnable === 'boolean' && Array.isArray(target.blockedBy),
				'target availability/blockers are required.',
			);
			if (!target.runnable) continue;
			check(target.blockedBy.length === 0, 'a runnable target cannot retain blockers.');
			// Routes are validated against the application path; the hosted host is only known at run time.
			routeUrl(
				name === 'local' ? localBase : `https://hosted.invalid${hostedTargets[name][1]}`,
				target.route,
			);
			check(
				Array.isArray(target.ready) &&
					target.ready.length > 0 &&
					Array.isArray(target.steps) &&
					Array.isArray(target.regions) &&
					Array.isArray(target.measurements),
				'runnable target needs explicit readiness, actions, regions and metrics.',
			);
			check(!target.masks?.length, 'target masks are unsupported.');
			for (const condition of target.ready)
				check(
					typeof condition.selector === 'string' &&
						condition.selector.length > 0 &&
						['visible', 'attached', 'hidden'].includes(condition.state),
					'readiness condition is invalid.',
				);
			for (const step of target.steps)
				check(
					step.safe === true &&
						typeof step.selector === 'string' &&
						step.selector.length > 0 &&
						['hover', 'focus', 'click', 'press'].includes(step.type) &&
						(step.type !== 'press' || keys.has(step.key)),
					'only explicit read-only UI actions are permitted.',
				);
			const regionIds = new Set(['viewport']);
			for (const region of target.regions) {
				check(
					slug.test(region.id) &&
						!regionIds.has(region.id) &&
						typeof region.selector === 'string' &&
						region.selector.length > 0,
					'region selector/identity is invalid.',
				);
				regionIds.add(region.id);
			}
			for (const metric of target.measurements)
				check(
					slug.test(metric.id) &&
						typeof metric.selector === 'string' &&
						properties.has(metric.property) &&
						['number', 'string'].includes(typeof metric.expected) &&
						(typeof metric.expected !== 'number' || Number.isFinite(metric.expected)) &&
						(metric.tolerance === undefined ||
							(Number.isFinite(metric.tolerance) && metric.tolerance >= 0)),
					'measurement contract is invalid.',
				);
		}
	}
	check(ids.size > 0, 'manifest cannot be empty.');
	return value;
}
