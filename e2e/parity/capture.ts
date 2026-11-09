import type { Browser, BrowserContext, Page } from '@playwright/test';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { resolve, relative, isAbsolute } from 'path';
import { comparePixels, sha256 } from './pixels.mjs';
import {
	assetIdentityAllowed,
	baselineIssue,
	identityMatches,
	requestAllowed,
	routeUrl,
	safeUrl,
} from './policy.mjs';
import type { ParityManifest, ParityScenario, ParitySettings, ParityTarget } from './types';

const styles = [
	'font-family',
	'font-size',
	'font-weight',
	'line-height',
	'letter-spacing',
	'color',
	'background-color',
	'padding',
	'margin',
	'border-width',
	'border-radius',
	'box-shadow',
	'opacity',
	'display',
	'visibility',
	'direction',
];
export async function settle(page: Page): Promise<void> {
	await page.evaluate(async () => {
		await document.fonts.ready;
		const finite = document.getAnimations().filter((animation) => {
			const timing = animation.effect?.getComputedTiming();
			return timing && Number.isFinite(timing.endTime) && animation.playState !== 'finished';
		});
		await Promise.race([
			Promise.all(finite.map((animation) => animation.finished.catch(() => undefined))),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('finite-animation-timeout')), 5000),
			),
		]);
		await new Promise<void>((resolveFrame) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())),
		);
	});
	await page.waitForFunction(() =>
		[...document.images].every((image) => {
			const bounds = image.getBoundingClientRect();
			return (
				!image.currentSrc ||
				!bounds.width ||
				!bounds.height ||
				(image.complete && image.naturalWidth > 0)
			);
		}),
	);
}
export async function boundary(context: BrowserContext, run: ParitySettings) {
	const blocked: { method: string; path: string; reason: string }[] = [];
	await context.routeWebSocket('**/*', (socket) => socket.close());
	await context.route('**/*', async (route) => {
		const request = route.request();
		if (!requestAllowed(run.mode, request.method(), request.url(), run.origins)) {
			blocked.push({
				method: request.method(),
				path: safeUrl(request.url()),
				reason: 'outside-read-only-policy',
			});
			return route.abort('blockedbyclient');
		}
		try {
			const response = await route.fetch({ maxRedirects: 0 });
			if (response.status() >= 300 && response.status() < 400 && response.headers()['location']) {
				blocked.push({
					method: request.method(),
					path: safeUrl(request.url()),
					reason: 'redirect-requires-canonical-route',
				});
				await response.dispose();
				return route.abort('blockedbyclient');
			}
			await route.fulfill({ response });
			await response.dispose();
		} catch {
			blocked.push({
				method: request.method(),
				path: safeUrl(request.url()),
				reason: 'transport-failed',
			});
			await route.abort('failed').catch(() => undefined);
		}
	});
	return blocked;
}
export async function openContext(
	browser: Browser,
	run: ParitySettings,
	scenario: ParityScenario,
	name: 'reference' | 'candidate' | 'local' = 'local',
) {
	return browser.newContext({
		viewport: scenario.rendering.viewport,
		deviceScaleFactor: scenario.rendering.deviceScaleFactor,
		locale: scenario.rendering.locale,
		timezoneId: scenario.rendering.timezone,
		serviceWorkers: 'block',
		acceptDownloads: false,
		httpCredentials:
			run.mode === 'hosted' && name !== 'local'
				? {
						username: run.username!,
						password: run.password!,
						origin: new URL(run.bases[name]!).origin,
						send: 'always',
					}
				: undefined,
	});
}
async function geometry(page: Page, target: ParityTarget) {
	const records = [];
	for (const region of target.regions) {
		const locator = page.locator(region.selector);
		if ((await locator.count()) !== 1)
			throw new Error(`PARITY CHECK FAILED: region ${region.id} must resolve once.`);
		const value = await locator.evaluate((element, properties) => {
			const bounds = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			const range = document.createRange();
			range.selectNodeContents(element);
			return {
				bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
				styles: Object.fromEntries(properties.map((name) => [name, style.getPropertyValue(name)])),
				text: (element as HTMLElement).innerText || '',
				textRectCount: range.getClientRects().length,
			};
		}, styles);
		records.push({
			id: region.id,
			selector: region.selector,
			bounds: value.bounds,
			styles: value.styles,
			textSha256: sha256(value.text),
			textRectCount: value.textRectCount,
		});
	}
	return records;
}
async function measure(page: Page, target: ParityTarget) {
	const records = [];
	for (const metric of target.measurements) {
		const locator = page.locator(metric.selector);
		if ((await locator.count()) !== 1)
			throw new Error(`PARITY CHECK FAILED: metric ${metric.id} must resolve once.`);
		const actual = await locator.evaluate((element, property) => {
			const bounds = element.getBoundingClientRect();
			return ['x', 'y', 'width', 'height'].includes(property)
				? bounds[property as 'x' | 'y' | 'width' | 'height']
				: getComputedStyle(element).getPropertyValue(property);
		}, metric.property);
		let matched;
		if (typeof metric.expected === 'number') {
			const numeric =
				typeof actual === 'number'
					? actual
					: /^-?\d+(?:\.\d+)?(?:px)?$/.test(actual.trim())
						? Number.parseFloat(actual)
						: Number.NaN;
			matched =
				Number.isFinite(numeric) &&
				Math.abs(numeric - metric.expected) <=
					(metric.tolerance ??
						(['x', 'y', 'width', 'height'].includes(metric.property) ? 1 : 0.01));
		} else matched = actual === metric.expected;
		records.push({ ...metric, actual, matched });
	}
	return records;
}
function imageRecord(directory: string, name: string, bytes: Buffer) {
	const file = `${name}.png`;
	writeFileSync(resolve(directory, file), bytes);
	return { file, sha256: sha256(bytes), bytes: bytes.length };
}
export async function captureTarget(
	browser: Browser,
	run: ParitySettings,
	manifest: ParityManifest,
	scenario: ParityScenario,
	name: 'reference' | 'candidate' | 'local',
) {
	const target = scenario.targets[name]!;
	const directory = resolve(run.output, scenario.id, name);
	mkdirSync(directory, { recursive: true });
	const context = await openContext(browser, run, scenario, name);
	const blocked = await boundary(context, run);
	const assets: { url: string; sha256: string; bytes: number; type: string }[] = [];
	const assetJobs: Promise<void>[] = [];
	const page = await context.newPage();
	page.on('response', (response) => {
		if (
			!['script', 'stylesheet'].includes(response.request().resourceType()) ||
			response.status() !== 200 ||
			!assetIdentityAllowed(response.url())
		)
			return;
		assetJobs.push(
			(async () => {
				try {
					const bytes = await response.body();
					assets.push({
						url: safeUrl(response.url()),
						sha256: sha256(bytes),
						bytes: bytes.length,
						type: response.request().resourceType(),
					});
				} catch {
					/* Missing asset identity remains unverified. Never serialize transport errors. */
				}
			})(),
		);
	});
	try {
		const base = run.bases[name];
		if (!base) throw new Error(`PARITY PRECONDITION: ${name} has no base URL in ${run.mode} mode.`);
		await page.goto(routeUrl(base, target.route), { waitUntil: 'domcontentloaded' });
		if (name === 'local') await page.locator('[data-fixture-notice]').waitFor({ state: 'visible' });
		for (const step of target.steps) {
			const locator = page.locator(step.selector);
			if (step.type === 'press') await locator.press(step.key!);
			else await locator[step.type]();
			for (const condition of step.ready ?? [])
				await page.locator(condition.selector).waitFor({ state: condition.state });
		}
		for (const condition of target.ready)
			await page.locator(condition.selector).waitFor({ state: condition.state });
		if (await page.locator('input[type="password"]:visible').count())
			throw new Error('PARITY CHECK FAILED: authentication must finish before capture.');
		await settle(page);
		const rendering = await page.evaluate(() => ({
			language: document.documentElement.lang,
			direction: getComputedStyle(document.documentElement).direction,
			deviceScaleFactor: devicePixelRatio,
			viewport: { width: innerWidth, height: innerHeight },
			theme: localStorage.getItem('maretha.webui.theme'),
		}));
		if (
			rendering.direction !== scenario.rendering.direction ||
			rendering.deviceScaleFactor !== scenario.rendering.deviceScaleFactor ||
			rendering.viewport.width !== scenario.rendering.viewport.width ||
			rendering.viewport.height !== scenario.rendering.viewport.height ||
			(name === 'local' &&
				(rendering.language !== scenario.rendering.locale ||
					rendering.theme !== `maretha.theme.${scenario.rendering.theme}`))
		)
			throw new Error('PARITY CHECK FAILED: actual rendering profile differs from the manifest.');
		let regions = await geometry(page, target);
		let stableSamples = 0;
		for (let attempt = 0; attempt < 30 && stableSamples < 3; attempt++) {
			await settle(page);
			await page.waitForTimeout(100);
			const next = await geometry(page, target);
			stableSamples =
				JSON.stringify(regions.map((region) => region.bounds)) ===
				JSON.stringify(next.map((region) => region.bounds))
					? stableSamples + 1
					: 0;
			regions = next;
		}
		if (stableSamples < 3) throw new Error('PARITY CHECK FAILED: region geometry did not settle.');
		const measurements = await measure(page, target);
		const images: Record<
			string,
			ReturnType<typeof imageRecord> & {
				repeat: ReturnType<typeof imageRecord>;
				noisePixels: number | null;
			}
		> = {};
		for (const item of [{ id: 'viewport', bounds: undefined }, ...regions]) {
			if (
				item.bounds &&
				(item.bounds.x < 0 ||
					item.bounds.y < 0 ||
					item.bounds.x + item.bounds.width > rendering.viewport.width + 1 ||
					item.bounds.y + item.bounds.height > rendering.viewport.height + 1)
			)
				throw new Error(`PARITY CHECK FAILED: region ${item.id} is outside the agreed viewport.`);
			const options = { clip: item.bounds, caret: 'hide' as const, animations: 'allow' as const };
			const first = await page.screenshot(options);
			await settle(page);
			const repeat = await page.screenshot(options);
			const noise = comparePixels(first, repeat);
			images[item.id] = {
				...imageRecord(directory, item.id, first),
				repeat: imageRecord(directory, `${item.id}.repeat`, repeat),
				noisePixels: noise.changedPixels,
			};
		}
		await Promise.all(assetJobs);
		const expected = manifest.expectedBundleIdentities[name];
		const identityVerified = identityMatches({ assets }, expected);
		const report = {
			status:
				measurements.every((metric) => metric.matched) && !blocked.length
					? 'captured-unverified'
					: 'failed',
			scenario: scenario.id,
			target: name,
			profile: scenario.rendering,
			renderingVerified: name === 'local',
			rendering,
			assets,
			identityVerified,
			measurements,
			regions,
			images,
			blocked,
			masks: [],
			browser: browser.version(),
		};
		writeFileSync(resolve(directory, 'capture.json'), JSON.stringify(report, null, 2) + '\n');
		if (report.status === 'failed')
			throw new Error('PARITY CHECK FAILED: declared measurements or read-only boundary failed.');
		return report;
	} catch (error) {
		// Browser/network errors can include credential-bearing redirect URLs. Keep them out of reports.
		writeFileSync(
			resolve(directory, 'failure.json'),
			JSON.stringify(
				{
					status: 'failed',
					scenario: scenario.id,
					target: name,
					reason:
						error instanceof Error && error.message.startsWith('PARITY CHECK FAILED:')
							? error.message
							: 'Capture did not satisfy declared readiness, rendering, geometry or request policy.',
					blocked,
				},
				null,
				2,
			) + '\n',
		);
		// eslint-disable-next-line preserve-caught-error -- Browser errors can contain authentication redirect parameters.
		throw new Error(
			`PARITY CHECK FAILED: ${scenario.id}/${name}; inspect sanitized capture evidence.`,
		);
	} finally {
		await context.close();
	}
}
export function compareBaseline(
	run: ParitySettings,
	manifest: ParityManifest,
	scenario: ParityScenario,
	target: Awaited<ReturnType<typeof captureTarget>>,
) {
	if (!run.baseline)
		return { status: 'unverified', reason: 'No fixed reference directory selected.' };
	const baselineDirectory = resolve(
		run.baseline,
		scenario.id,
		run.mode === 'local' ? 'local' : 'reference',
	);
	const baselineReport = realpathSync(resolve(baselineDirectory, 'capture.json'));
	const reportWithin = relative(realpathSync(baselineDirectory), baselineReport);
	if (reportWithin.startsWith('..') || isAbsolute(reportWithin))
		throw new Error('PARITY CHECK FAILED: reference report escaped its directory.');
	const baseline = JSON.parse(readFileSync(baselineReport, 'utf8')) as typeof target;
	const issue = baselineIssue(
		baseline,
		scenario.id,
		run.mode === 'local' ? 'local' : 'reference',
		manifest.expectedBundleIdentities['reference'],
	);
	if (issue) return { status: 'unverified', reason: issue };
	if (
		JSON.stringify(baseline.profile) !== JSON.stringify(target.profile) ||
		baseline.browser !== target.browser
	)
		return { status: 'unverified', reason: 'Reference rendering state differs.' };
	if (run.mode === 'hosted' && (!baseline.identityVerified || !target.identityVerified))
		return { status: 'unverified', reason: 'Bundle identities remain unverified.' };
	const regions = [];
	for (const [id, image] of Object.entries(target.images)) {
		const reference = baseline.images[id];
		if (!reference || reference.noisePixels !== 0 || image.noisePixels !== 0)
			return {
				status: 'unverified',
				reason: 'Reference/candidate capture is missing or has repeat noise.',
			};
		if (run.mode === 'hosted' && (!baseline.renderingVerified || !target.renderingVerified))
			return {
				status: 'unverified',
				reason: 'A per-UI hosted locale/theme verification adapter has not been bound.',
			};
		const imagePath = realpathSync(resolve(baselineDirectory, reference.file));
		const within = relative(realpathSync(baselineDirectory), imagePath);
		if (within.startsWith('..') || isAbsolute(within))
			throw new Error('PARITY CHECK FAILED: baseline image escaped its directory.');
		const bytes = readFileSync(imagePath);
		if (sha256(bytes) !== reference.sha256)
			throw new Error('PARITY CHECK FAILED: fixed reference image identity changed.');
		const difference = comparePixels(
			bytes,
			readFileSync(resolve(run.output, scenario.id, target.target, image.file)),
		);
		if (difference.diff)
			writeFileSync(
				resolve(run.output, scenario.id, target.target, `${id}.diff.png`),
				difference.diff,
			);
		regions.push({
			id,
			matched: difference.matched,
			changedPixels: difference.changedPixels,
			reason: difference.reason,
		});
	}
	return {
		status: regions.every((region) => region.matched) ? 'pixel-matched' : 'different',
		regions,
		parityVerified: false,
		reason:
			'Pixel matches do not certify semantic prerequisites, behavior, exclusions or the complete inventory.',
	};
}
