// Capture committed base/checkout fixtures for review, independently of the full axe/IBM scans.
// THEME_COMPARISON_BASE_SHA=<40-character SHA> node e2e/a11y/theme-comparison.mjs
// Outputs a before/after gallery and raw measurements in the accessibility CI artifact.
import http from 'node:http';
import fs from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'package.json'));
const { chromium, expect } = require('@playwright/test');
const { restrictToLoopback } = await import(path.join(root, 'e2e/local-boundary.mjs'));
const { comparePixels } = await import(path.join(root, 'e2e/parity/pixels.mjs'));
const out = path.join(root, 'dist/verification/a11y/theme-comparison');
const base = process.env.THEME_COMPARISON_BASE_SHA;
if (!/^[0-9a-f]{40}$/i.test(base ?? ''))
	throw new Error('THEME_COMPARISON_BASE_SHA must be a full Git commit SHA.');
const candidate = execFileSync('git', ['rev-parse', 'HEAD'], {
	cwd: root,
	encoding: 'utf8',
}).trim();
const temporary = await fs.mkdtemp(path.join(tmpdir(), 'maretha-theme-comparison-'));
const builds = [
	{ side: 'base', commit: base },
	{ side: 'candidate', commit: candidate },
].map((build) => ({
	...build,
	source: path.join(temporary, build.side),
	folder: path.join(temporary, build.side + '-build'),
}));
const mime = {
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.html': 'text/html',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.ico': 'image/x-icon',
	'.ttf': 'font/ttf',
};
const servers = [];
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
const report = {
	revisions: Object.fromEntries(builds.map((build) => [build.side, build.commit])),
	method:
		'Actual deterministic local a11y fixtures built from isolated base and candidate source archives. Same Chrome/viewport/fonts-ready waits. Raw full and component screenshots; no image masks or API responses from Nuxeo. Default theme is also compared to verify unchanged appearance.',
	viewport: { width: 1280, height: 900 },
	states: [],
	errors: [],
};
const measure = async (locator) =>
	locator.evaluate((element) => {
		const ancestors = [];
		for (let node = element; node; node = node.parentElement) ancestors.push(node);
		const rgba = (value) => {
			const c = value.match(/[\d.]+/g)?.map(Number);
			if (!c || c.length < 3) throw Error('Unexpected computed color');
			return [c[0], c[1], c[2], c[3] ?? 1];
		};
		const blend = (front, back) =>
			front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3]));
		let background = [255, 255, 255];
		for (const node of [...ancestors].reverse())
			background = blend(rgba(getComputedStyle(node).backgroundColor), background);
		const style = getComputedStyle(element),
			foreground = blend(rgba(style.color), background);
		const luminance = (rgb) =>
			rgb
				.map((v) => v / 255)
				.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
				.reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
		const fg = luminance(foreground),
			bg = luminance(background),
			rect = element.getBoundingClientRect();
		return {
			text: element.textContent.trim(),
			color: style.color,
			foreground,
			background,
			contrast: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
			fontSize: style.fontSize,
			fontWeight: style.fontWeight,
			rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
			ancestors: ancestors.map((n) => ({
				tag: n.tagName,
				class: n.className,
				background: getComputedStyle(n).backgroundColor,
				opacity: getComputedStyle(n).opacity,
			})),
		};
	});
let browser;
async function run(command, args, cwd, logPath) {
	const stream = createWriteStream(logPath, { flags: 'a' });
	try {
		await new Promise((resolve, reject) => {
			const child = spawn(command, args, {
				cwd,
				stdio: ['ignore', 'pipe', 'pipe'],
				env: { ...process.env, NG_BUILD_MAX_WORKERS: process.env.NG_BUILD_MAX_WORKERS ?? '2' },
			});
			child.stdout.pipe(stream, { end: false });
			child.stderr.pipe(stream, { end: false });
			child.once('error', reject);
			child.once('close', (code) =>
				code === 0
					? resolve()
					: reject(new Error(`Command failed with exit ${code}; see ${path.basename(logPath)}`)),
			);
		});
	} finally {
		await new Promise((resolve) => stream.end(resolve));
	}
}
async function buildFixture(build) {
	const log = path.join(out, build.side + '-build.log');
	const archive = path.join(temporary, build.side + '.tar');
	await fs.mkdir(build.source);
	await run('git', ['archive', '--format=tar', '--output', archive, build.commit], root, log);
	await run('tar', ['-xf', archive, '-C', build.source], root, log);
	await fs.symlink(
		path.join(root, 'node_modules'),
		path.join(build.source, 'node_modules'),
		'junction',
	);
	const cli = path.join(path.dirname(require.resolve('@angular/cli/package.json')), 'bin/ng.js');
	await run(
		process.execPath,
		[cli, 'build', '--configuration', 'a11y', '--output-path', build.folder, '--progress=false'],
		build.source,
		log,
	);
}
async function gallery() {
	const rows = [];
	for (const theme of ['default', 'dark'])
		for (const surface of ['document-tabs', 'confirmation-dialog']) {
			const [before, after] = report.states.filter(
				(state) => state.theme === theme && state.surface === surface,
			);
			if (!before || !after) continue;
			rows.push(
				`<section><h2>${theme}: ${surface}</h2><div class="pair">` +
					[before, after]
						.map(
							(state) =>
								`<figure><figcaption>${state.side} — contrast ${state.measurement.contrast.toFixed(2)}:1</figcaption><a href="${state.full}"><img src="${state.component}" alt="${state.side} ${theme} ${surface}"></a></figure>`,
						)
						.join('') +
					'</div></section>',
			);
		}
	await fs.writeFile(
		path.join(out, 'index.html'),
		`<!doctype html><html lang="en"><meta charset="utf-8"><title>Theme comparison</title><style>body{font:16px system-ui;max-width:1200px;margin:32px auto;padding:0 20px;background:#fafafa;color:#222}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;min-width:0}figcaption{margin-bottom:8px}img{max-width:100%;height:auto;border:1px solid #aaa}section{margin-block:32px}code{word-break:break-all}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>Theme comparison</h1><p>Actual local component fixtures; no Nuxeo connection. Click an image for the full screenshot.</p><p>Base: <code>${base}</code><br>Candidate checkout: <code>${candidate}</code></p>${rows.join('')}<p><a href="comparison.json">Computed colors, contrast, geometry and exact pixel comparisons</a></p></html>`,
	);
}
try {
	for (const build of builds) await buildFixture(build);
	const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
	const executablePath =
		process.env.CHROME_BIN ||
		(process.platform === 'darwin' && existsSync(macChrome) ? macChrome : undefined);
	browser = await chromium.launch({
		headless: true,
		executablePath,
		args: ['--disable-gpu', '--force-color-profile=srgb'],
	});
	report.browser = browser.version();
	for (const build of builds) {
		const server = http.createServer(async (req, res) => {
			try {
				const u = new URL(req.url, 'http://127.0.0.1');
				const target = path.resolve(
					build.folder,
					decodeURIComponent(u.pathname).replace(/^\//, '') || 'index.html',
				);
				if (!target.startsWith(build.folder + '/')) {
					res.writeHead(400);
					res.end();
					return;
				}
				const data = await fs.readFile(target);
				res.writeHead(200, {
					'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream',
					'Cache-Control': 'no-store',
				});
				res.end(data);
			} catch {
				res.writeHead(404);
				res.end();
			}
		});
		await new Promise((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		servers.push(server);
		const port = server.address().port;
		const context = await browser.newContext({
			viewport: report.viewport,
			locale: 'en-US',
			timezoneId: 'America/New_York',
			serviceWorkers: 'block',
		});
		const assertBoundary = await restrictToLoopback(context);
		const page = await context.newPage();
		page.on('pageerror', (e) =>
			report.errors.push({ side: build.side, name: e.name, message: e.message }),
		);
		for (const theme of ['default', 'dark'])
			for (const surface of ['document-tabs', 'confirmation-dialog']) {
				await page.goto(
					`http://127.0.0.1:${port}/?surface=${surface}&locale=en-US&theme=${theme}`,
					{ waitUntil: 'networkidle' },
				);
				let target, subject;
				if (surface === 'confirmation-dialog') {
					await page.getByRole('button', { name: 'Open confirmation dialog', exact: true }).click();
					const dialog = page.getByRole('dialog');
					await expect(dialog).toBeVisible();
					await expect(dialog).toHaveCSS('opacity', '1');
					await expect(dialog.locator('.modal-dialog')).toHaveCSS('transform', 'none');
					subject = dialog.getByRole('button', { name: 'Cancel', exact: true });
					target = dialog.locator('nx-confirmation-dialog');
				} else {
					await expect(page.getByRole('tab')).toHaveCount(3);
					subject = page.locator('[role=tab][aria-selected=true]');
					target = page.locator('nx-document-views');
				}
				await page.evaluate(() => document.fonts.ready);
				await page.mouse.move(1270, 890);
				await page.waitForTimeout(500);
				const measurement = await measure(subject);
				const id = `${build.side}-${theme}-${surface}`;
				await page.screenshot({
					path: path.join(out, id + '.png'),
					fullPage: true,
					animations: 'disabled',
				});
				await target.screenshot({
					path: path.join(out, id + '-component.png'),
					animations: 'disabled',
				});
				report.states.push({
					id,
					side: build.side,
					commit: build.commit,
					theme,
					surface,
					measurement,
					full: id + '.png',
					component: id + '-component.png',
				});
				console.log(id, measurement.contrast.toFixed(3));
			}
		await context.close();
		assertBoundary();
	}
	report.comparisons = [];
	for (const theme of ['default', 'dark'])
		for (const surface of ['document-tabs', 'confirmation-dialog'])
			for (const kind of ['full', 'component']) {
				const states = report.states.filter((s) => s.theme === theme && s.surface === surface);
				const a = await fs.readFile(path.join(out, states[0][kind])),
					b = await fs.readFile(path.join(out, states[1][kind]));
				const { diff, ...pixels } = comparePixels(a, b);
				const diffName = `diff-${theme}-${surface}-${kind}.png`;
				if (diff && !pixels.matched) await fs.writeFile(path.join(out, diffName), diff);
				report.comparisons.push({
					theme,
					surface,
					kind,
					...pixels,
					...(diff && !pixels.matched ? { diff: diffName } : {}),
				});
			}
	report.complete = true;
	report.passed =
		report.errors.length === 0 &&
		report.states
			.filter((state) => state.side === 'candidate')
			.every((state) => state.measurement.contrast >= 4.5);
	if (!report.passed)
		throw new Error('Candidate theme contrast or page errors failed; see comparison.json.');
} catch (error) {
	report.failure = { name: error.name, message: error.message };
	process.exitCode = 1;
} finally {
	await browser?.close();
	await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
	await gallery();
	await fs.writeFile(path.join(out, 'comparison.json'), JSON.stringify(report, null, 2) + '\n');
	const hashes = {};
	for (const file of await fs.readdir(out)) {
		if (file === 'sha256.json') continue;
		hashes[file] = createHash('sha256')
			.update(await fs.readFile(path.join(out, file)))
			.digest('hex');
	}
	await fs.writeFile(path.join(out, 'sha256.json'), JSON.stringify(hashes, null, 2) + '\n');
	await fs.rm(temporary, { recursive: true, force: true });
	console.log(
		JSON.stringify({
			passed: report.passed === true,
			states: report.states.length,
			report: 'dist/verification/a11y/theme-comparison/index.html',
		}),
	);
}
