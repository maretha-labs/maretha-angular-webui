import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { boundary, captureTarget, compareBaseline, openContext, settle } from './capture';
import { settings, validateManifest } from './policy.mjs';
import { scan } from '../a11y/scan';

const run = settings();
const manifest = validateManifest(
	JSON.parse(readFileSync(resolve('e2e/parity/scenarios.json'), 'utf8')),
);
test.beforeAll(() => mkdirSync(run.output, { recursive: true }));
function record(id: string, value: unknown) {
	writeFileSync(resolve(run.output, `${id}.result.json`), JSON.stringify(value, null, 2) + '\n', {
		flag: 'wx',
	});
}

for (const scenario of manifest.scenarios.filter(
	(item) => !run.scenario || item.id === run.scenario,
)) {
	test(scenario.id, async ({ browser }) => {
		const targets =
			run.mode === 'local' ? (['local'] as const) : (['reference', 'candidate'] as const);
		const captures = [];
		for (const name of targets) {
			const target = scenario.targets[name];
			if (!target?.runnable) {
				captures.push({
					target: name,
					status: 'unverified',
					reasons: target?.blockedBy ?? ['No local counterpart.'],
				});
				continue;
			}
			try {
				const capture = await captureTarget(browser, run, manifest, scenario, name);
				const comparison =
					name === 'reference'
						? { status: 'fixed-reference-captured' }
						: compareBaseline(run, manifest, scenario, capture);
				captures.push({
					target: name,
					status: capture.status,
					identityVerified: capture.identityVerified,
					comparison,
				});
				if (run.baseline && name !== 'reference')
					expect(comparison.status, 'A requested fixed-baseline comparison must complete.').toBe(
						'pixel-matched',
					);
			} catch {
				captures.push({
					target: name,
					status: 'failed',
					reason: 'Inspect sanitized target capture/failure report.',
				});
				record(scenario.id, {
					scenario: scenario.id,
					status: 'failed',
					rendering: scenario.rendering,
					captures,
				});
				throw new Error(`PARITY CHECK FAILED: ${scenario.id}/${name}.`);
			}
		}
		record(scenario.id, {
			scenario: scenario.id,
			status: captures.every((capture) => capture.status === 'unverified')
				? 'unverified'
				: 'captured-unverified',
			rendering: scenario.rendering,
			captures,
		});
	});
}

test('local responsive shell contracts', async ({ browser }) => {
	test.skip(
		run.mode !== 'local' || Boolean(run.scenario),
		'Separate local contract; hosted captures never interact with this fixture.',
	);
	const seed = manifest.scenarios.find((scenario) => scenario.targets.local?.runnable)!;
	const context = await openContext(browser, run, seed);
	const blocked = await boundary(context, run);
	const page = await context.newPage();
	const evidence = [];
	try {
		for (const locale of ['en-US', 'ar'])
			for (const width of [720, 721, 900, 1024, 1025]) {
				await page.setViewportSize({ width, height: 900 });
				await page.goto(`${run.bases.local}?locale=${locale}&theme=default`);
				await expect(page.locator('[data-fixture-notice]')).toBeVisible();
				if (width <= 720) await page.locator('.nx-mobile-toggle').click();
				await page.locator('[data-maretha-navigation-action="account"]').click();
				await settle(page);
				const anchors = await page.locator('.nx-main').evaluate((element) => {
					const bounds = element.getBoundingClientRect();
					const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
					return { start: rtl ? innerWidth - bounds.right : bounds.x, width: bounds.width };
				});
				expect(Math.abs(anchors.start - (width > 720 ? 350 : 0))).toBeLessThanOrEqual(1);
				await expect(page.locator('#nx-sidebar-drawer')).toHaveCSS(
					'width',
					`${width > 720 ? 298 : width - 52}px`,
				);
				const edge = page.locator('.nx-drawer-edge-toggle');
				if (width > 1024) await expect(edge).toBeVisible();
				else await expect(edge).toBeHidden();
				const file = `responsive-${locale}-${width}.png`;
				await page.screenshot({ path: resolve(run.output, file), caret: 'hide' });
				evidence.push({
					locale,
					viewport: { width, height: 900 },
					anchors,
					screenshot: file,
					status: 'local-contract-passed',
				});
			}
		expect(blocked).toEqual([]);
		record('local-responsive-shell-contracts', {
			scenario: 'local-responsive-shell-contracts',
			status: 'local-contract-passed',
			parityVerified: false,
			evidence,
		});
	} catch {
		record('local-responsive-shell-contracts', {
			scenario: 'local-responsive-shell-contracts',
			status: 'failed',
			evidence,
			parityVerified: false,
		});
		throw new Error('PARITY CHECK FAILED: local responsive shell contract.');
	} finally {
		await context.close();
	}
});

test('local custom font contract', async ({ browser }) => {
	test.skip(
		run.mode !== 'local' || Boolean(run.scenario),
		'Local-only theme customization regression.',
	);
	const seed = manifest.scenarios.find((scenario) => scenario.targets.local?.runnable)!;
	const context = await openContext(browser, run, seed);
	const blocked = await boundary(context, run);
	const page = await context.newPage();
	try {
		await page.goto(run.bases.local);
		await expect(page.locator('[data-fixture-notice]')).toBeVisible();
		await page.locator('[data-maretha-navigation-action="account"]').click();
		await settle(page);
		const elements = ['body', '.nx-sidebar', '.nx-drawer'];
		const original = await Promise.all(
			elements.map((selector) =>
				page.locator(selector).evaluate((element) => getComputedStyle(element).fontFamily),
			),
		);
		const originalInline = await page.evaluate(() =>
			document.documentElement.style.getPropertyValue('--maretha-style-font-family'),
		);
		await page.evaluate(() =>
			document.documentElement.style.setProperty('--maretha-style-font-family', 'monospace'),
		);
		for (const selector of elements)
			await expect(page.locator(selector)).toHaveCSS('font-family', 'monospace');
		await page.evaluate((value) => {
			document.documentElement.style.removeProperty('--maretha-style-font-family');
			if (value) document.documentElement.style.setProperty('--maretha-style-font-family', value);
		}, originalInline);
		for (let index = 0; index < elements.length; index++)
			await expect(page.locator(elements[index])).toHaveCSS('font-family', original[index]);
		expect(blocked).toEqual([]);
		record('local-custom-font-contract', {
			scenario: 'local-custom-font-contract',
			status: 'local-contract-passed',
			parityVerified: false,
			original,
			override: 'monospace',
			restored: true,
		});
	} catch {
		record('local-custom-font-contract', {
			scenario: 'local-custom-font-contract',
			status: 'failed',
			parityVerified: false,
		});
		throw new Error('PARITY CHECK FAILED: local custom font contract.');
	} finally {
		await context.close();
	}
});

test('local simulated drawer tree contract', async ({ browser }) => {
	test.skip(
		run.mode !== 'local' || Boolean(run.scenario),
		'Local-only simulated drawer context; no hosted DOM mutation.',
	);
	const seed = manifest.scenarios.find((scenario) => scenario.targets.local?.runnable)!;
	const context = await openContext(browser, run, seed);
	const blocked = await boundary(context, run);
	const page = await context.newPage();
	try {
		await page.goto(`${run.bases.local}?surface=runtime-document-tree&locale=en-US&theme=default`);
		const tree = page.locator('nx-runtime-tree-fixture nx-document-tree');
		await expect(tree).toBeVisible();
		const root = tree.locator('[data-tree-node="fixture-root"]');
		const branch = tree.locator('[data-tree-node="fixture-branch"]');
		await expect(root).toHaveAttribute('aria-expanded', 'true');
		await expect(root.locator(':scope > .tree-item')).toHaveCSS('min-height', '30px');
		await expect(root.locator(':scope > .tree-item .tree-toggle')).toHaveCSS('width', '20px');
		await expect(branch.locator(':scope > .tree-item .tree-indent')).toHaveCSS('width', '14px');
		await expect(root.locator(':scope > .tree-item .tree-icon')).toBeVisible();
		await tree.evaluate((element) => {
			const wrapper = document.createElement('div');
			wrapper.className = 'nx-drawer';
			wrapper.setAttribute('data-simulated-drawer', 'true');
			Object.assign(wrapper.style, {
				position: 'relative',
				width: '298px',
				height: '400px',
				inset: 'auto',
				overflow: 'visible',
			});
			element.replaceWith(wrapper);
			wrapper.appendChild(element);
		});
		await settle(page);
		await expect(root.locator(':scope > .tree-item')).toHaveCSS('min-height', '24px');
		await expect(root.locator(':scope > .tree-item .tree-toggle')).toHaveCSS('width', '24px');
		await expect(root.locator(':scope > .tree-item .tree-toggle')).toHaveCSS('height', '24px');
		await expect(branch.locator(':scope > .tree-item .tree-indent')).toHaveCSS('width', '13px');
		await expect(root.locator(':scope > .tree-item .tree-icon')).toBeVisible();
		await root.focus();
		await page.keyboard.press('ArrowLeft');
		await expect(root).toHaveAttribute('aria-expanded', 'false');
		await page.keyboard.press('ArrowRight');
		await expect(branch).toBeVisible();
		await page.keyboard.press('ArrowRight');
		await expect(branch).toBeFocused();
		await page.keyboard.press('ArrowRight');
		await expect(tree.locator('[data-tree-node="fixture-first"]')).toBeVisible();
		const evidence = await tree.evaluate((element) => ({
			bounds: element.getBoundingClientRect().toJSON(),
			padding: getComputedStyle(element).padding,
			scope: 'Simulated local drawer ancestor; component-only evidence.',
		}));
		await page.screenshot({
			path: resolve(run.output, 'simulated-drawer-tree.png'),
			caret: 'hide',
		});
		expect(blocked).toEqual([]);
		record('local-simulated-drawer-tree-contract', {
			scenario: 'local-simulated-drawer-tree-contract',
			status: 'local-contract-passed',
			parityVerified: false,
			evidence,
			separateExpandTarget:
				'24x24px; intentional accessibility difference from the reference glyph width.',
		});
	} catch {
		record('local-simulated-drawer-tree-contract', {
			scenario: 'local-simulated-drawer-tree-contract',
			status: 'failed',
			parityVerified: false,
		});
		throw new Error('PARITY CHECK FAILED: local simulated drawer tree contract.');
	} finally {
		await context.close();
	}
});

test('local user-adjustable drawer widths contract', async ({ browser }) => {
	test.setTimeout(120_000);
	test.skip(
		run.mode !== 'local' || Boolean(run.scenario),
		'Local-only persisted drawer layout regression; hosted captures remain read-only.',
	);
	const seed = manifest.scenarios.find((scenario) => scenario.targets.local?.runnable)!;
	const evidence = [];
	try {
		for (const locale of ['en-US', 'ar']) {
			const context = await openContext(browser, run, {
				...seed,
				rendering: {
					...seed.rendering,
					viewport: { width: 1280, height: 900 },
					locale,
					direction: locale === 'ar' ? 'rtl' : 'ltr',
				},
			});
			const blocked = await boundary(context, run);
			const page = await context.newPage();
			try {
				await page.goto(`${run.bases.local}?surface=browse-drawer&locale=${locale}&theme=default`);
				await expect(page.locator('[data-fixture-notice]')).toBeVisible();
				const browse = page.locator('nx-drawer-item > button').first();
				const search = page.locator('nx-drawer-item > button').nth(2);
				const account = page.locator('[data-maretha-navigation-action="account"]');
				const drawer = page.locator('#nx-sidebar-drawer');
				const handle = page.locator('.nx-drawer-resize-handle');
				const increase = locale === 'ar' ? 'ArrowLeft' : 'ArrowRight';
				const decrease = locale === 'ar' ? 'ArrowRight' : 'ArrowLeft';
				const verifyWidth = async (width: number) => {
					await settle(page);
					await expect(drawer).toHaveCSS('width', `${width}px`);
					await expect(handle).toHaveAttribute('aria-valuenow', `${width}`);
					const geometry = await drawer.evaluate((panel) => {
						const bounds = panel.getBoundingClientRect();
						const main = document.querySelector('.nx-main')!.getBoundingClientRect();
						const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
						return {
							panel: bounds.toJSON(),
							mainStart: rtl ? innerWidth - main.right : main.left,
							documentWidth: document.documentElement.scrollWidth,
						};
					});
					expect(Math.abs(geometry.mainStart - (52 + width))).toBeLessThanOrEqual(1);
					expect(geometry.documentWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
					return geometry;
				};
				const beginDrag = async () => {
					const bounds = (await handle.boundingBox())!;
					const point = { x: bounds.x + bounds.width / 2, y: bounds.y + 150 };
					await page.mouse.move(point.x, point.y);
					await page.mouse.down();
					return point;
				};
				await browse.click();
				await verifyWidth(240);
				await expect(handle).toHaveAttribute('role', 'separator');
				await expect(handle).toHaveAttribute('aria-orientation', 'vertical');
				await expect(handle).toHaveAttribute('aria-controls', 'nx-sidebar-drawer');
				await expect(handle).toHaveAttribute('aria-valuemin', '200');
				await expect(handle).toHaveAttribute('aria-valuemax', '640');
				expect(await handle.getAttribute('aria-label')).toBeTruthy();
				const start = await beginDrag();
				await page.mouse.move(start.x + (locale === 'ar' ? -100 : 100), start.y, {
					steps: 5,
				});
				await page.mouse.up();
				await verifyWidth(340);
				await page.reload();
				await expect(page.locator('[data-fixture-notice]')).toBeVisible();
				await browse.click();
				const persistedBrowse = await verifyWidth(340);
				await handle.focus();
				await page.keyboard.press('Escape');
				await settle(page);
				await expect(handle).toBeHidden();
				await expect(drawer).toHaveCSS('width', '0px');
				await browse.click();
				await verifyWidth(340);
				const cancelledStart = await beginDrag();
				await page.mouse.move(cancelledStart.x + (locale === 'ar' ? -100 : 100), cancelledStart.y, {
					steps: 5,
				});
				await verifyWidth(440);
				await page.keyboard.press('Escape');
				await page.mouse.up();
				await expect(browse).toHaveAttribute('aria-expanded', 'true');
				await verifyWidth(340);
				const closingStart = await beginDrag();
				await page.mouse.move(closingStart.x + (locale === 'ar' ? -50 : 50), closingStart.y);
				await verifyWidth(390);
				await browse.focus();
				await page.keyboard.press('Space');
				await page.mouse.up();
				await settle(page);
				await expect(handle).toBeHidden();
				await expect(drawer).toHaveCSS('width', '0px');
				await browse.click();
				await verifyWidth(340);
				const switchingStart = await beginDrag();
				await page.mouse.move(switchingStart.x + (locale === 'ar' ? -50 : 50), switchingStart.y);
				await verifyWidth(390);
				await search.focus();
				await page.keyboard.press('Space');
				await page.mouse.up();
				await verifyWidth(298);
				await browse.click();
				await verifyWidth(340);
				await search.click();
				await verifyWidth(298);
				await handle.focus();
				await page.keyboard.press('Home');
				await page.keyboard.press(`Shift+${increase}`);
				await verifyWidth(250);
				await account.click();
				await verifyWidth(298);
				await handle.focus();
				await page.keyboard.press('Home');
				await page.keyboard.press(increase);
				await verifyWidth(210);
				await browse.click();
				await verifyWidth(340);
				await search.click();
				await verifyWidth(250);
				await account.click();
				await verifyWidth(210);
				await page.reload();
				await expect(page.locator('[data-fixture-notice]')).toBeVisible();
				await search.click();
				await verifyWidth(250);
				await account.click();
				await verifyWidth(210);
				await browse.click();
				await verifyWidth(340);
				await handle.focus();
				await page.keyboard.press('Home');
				await verifyWidth(200);
				await page.keyboard.press(increase);
				await verifyWidth(210);
				await page.keyboard.press(`Shift+${increase}`);
				await verifyWidth(260);
				await page.keyboard.press(decrease);
				await verifyWidth(250);
				await page.keyboard.press('End');
				await verifyWidth(640);
				await page.keyboard.press('Enter');
				await verifyWidth(240);
				await page.keyboard.press('Home');
				for (let step = 0; step < 8; step++) await page.keyboard.press(`Shift+${increase}`);
				await verifyWidth(600);
				await page.setViewportSize({ width: 900, height: 900 });
				const clamped = await verifyWidth(528);
				await expect(handle).toHaveAttribute('aria-valuemax', '528');
				await page.setViewportSize({ width: 320, height: 900 });
				await settle(page);
				await expect(handle).toBeHidden();
				await expect(drawer).toHaveCSS('width', '268px');
				const mobileStart = await page.locator('.nx-main').evaluate((main) => {
					const bounds = main.getBoundingClientRect();
					return getComputedStyle(document.documentElement).direction === 'rtl'
						? innerWidth - bounds.right
						: bounds.left;
				});
				expect(mobileStart).toBe(0);
				await page.setViewportSize({ width: 1280, height: 900 });
				await verifyWidth(600);
				await page.reload();
				await expect(page.locator('[data-fixture-notice]')).toBeVisible();
				await browse.click();
				await verifyWidth(600);
				const resetBounds = (await handle.boundingBox())!;
				await handle.dblclick({ position: { x: resetBounds.width / 2, y: 150 } });
				await verifyWidth(240);
				await page.reload();
				await expect(page.locator('[data-fixture-notice]')).toBeVisible();
				await browse.click();
				await verifyWidth(240);
				await search.click();
				await verifyWidth(250);
				await account.click();
				await verifyWidth(210);
				expect(blocked).toEqual([]);
				evidence.push({
					locale,
					persistedBrowse,
					independentPersistedWidths: { browse: 340, search: 250, account: 210 },
					escapeCancelsPreviewWithoutClosingDrawer: true,
					idleEscapeClosesDrawerWithoutChangingPreference: true,
					closingAndSwitchingDrawersCancelPreview: true,
					viewportClamp: clamped,
					mobileOverlayWidth: 268,
					desktopPreferenceRestoredAfterViewportChange: 600,
					resetBrowsePreservesOtherDrawers: true,
				});
			} finally {
				await context.close();
			}
		}
		record('local-user-adjustable-drawer-widths-contract', {
			scenario: 'local-user-adjustable-drawer-widths-contract',
			status: 'local-contract-passed',
			parityVerified: false,
			evidence,
		});
	} catch (error) {
		record('local-user-adjustable-drawer-widths-contract', {
			scenario: 'local-user-adjustable-drawer-widths-contract',
			status: 'failed',
			parityVerified: false,
			evidence,
		});
		throw error;
	}
});

test('local real Browse drawer contract', async ({ browser }, info) => {
	test.setTimeout(180_000);
	test.skip(
		run.mode !== 'local' || Boolean(run.scenario),
		'Local-only real Browse contribution with synthetic root providers.',
	);
	const phase = process.env['PARITY_BROWSE_PHASE'] ?? 'after';
	expect(['before', 'after']).toContain(phase);
	const seed = manifest.scenarios.find((scenario) => scenario.targets.local?.runnable)!;
	const evidence = [];
	try {
		for (const locale of ['en-US', 'ar'])
			for (const theme of ['default', 'dark']) {
				const context = await openContext(browser, run, {
					...seed,
					rendering: {
						...seed.rendering,
						viewport: { width: 1280, height: 900 },
						locale,
						direction: locale === 'ar' ? 'rtl' : 'ltr',
						theme,
					},
				});
				const blocked = await boundary(context, run);
				const page = await context.newPage();
				const responsiveEvidence: Record<string, unknown> = {};
				try {
					await page.goto(
						`${run.bases.local}?surface=browse-drawer&locale=${locale}&theme=${theme}`,
					);
					await expect(page.locator('[data-fixture-notice]')).toBeVisible();
					const browse = page.locator('nx-drawer-item > button').first();
					await browse.click();
					await expect(browse).toHaveAttribute('aria-expanded', 'true');
					const drawer = page.locator('#nx-sidebar-drawer');
					const desktopGeometry = async (width: number) => {
						await settle(page);
						await expect(drawer).toHaveCSS('width', `${width}px`);
						const geometry = await drawer.evaluate((panel) => {
							const bounds = panel.getBoundingClientRect();
							const main = document.querySelector('.nx-main')!.getBoundingClientRect();
							const edge = document
								.querySelector('.nx-drawer-edge-toggle')!
								.getBoundingClientRect();
							const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
							return {
								panel: bounds.toJSON(),
								mainStart: rtl ? innerWidth - main.right : main.left,
								edgeGap: rtl ? bounds.left - edge.right : edge.left - bounds.right,
							};
						});
						expect(Math.abs(geometry.mainStart - (52 + width))).toBeLessThanOrEqual(1);
						expect(Math.abs(geometry.edgeGap)).toBeLessThanOrEqual(1);
						expect(geometry.panel.left).toBe(locale === 'ar' ? 1280 - 52 - width : 52);
						return geometry;
					};
					if (phase === 'after') responsiveEvidence['desktop'] = await desktopGeometry(240);
					const tree = drawer.locator('nx-document-tree');
					const root = tree.locator('[data-tree-node="browse-root"]');
					const domain = tree.locator('[data-tree-node="browse-domain"]');
					const workspaces = tree.locator('[data-tree-node="browse-workspaces"]');
					const workspace = tree.locator('[data-tree-node="browse-workspace"]');
					const nested = tree.locator('[data-tree-node="browse-nested"]');
					const longNested = tree.locator('[data-tree-node="browse-long-nested"]');
					const expand = locale === 'ar' ? 'ArrowLeft' : 'ArrowRight';
					const collapse = locale === 'ar' ? 'ArrowRight' : 'ArrowLeft';
					await expect(drawer.locator('.nx-drawer__header h6')).toHaveText(
						locale === 'ar' ? 'تصفح' : 'Browse',
					);
					await expect(root).toHaveAttribute('aria-expanded', 'true');
					await expect(tree.getByRole('alert')).toHaveCount(0);
					await root.focus();
					await page.keyboard.press(collapse);
					await expect(domain).toHaveCount(0);
					await expect(root).toBeFocused();
					await expect(root.locator(':scope > .tree-item .tree-toggle svg')).toHaveAttribute(
						'data-icon',
						'chevron-right',
					);
					await expect(root.locator(':scope > .tree-item .tree-icon svg')).toHaveAttribute(
						'data-icon',
						'folder',
					);
					await page.keyboard.press(expand);
					await expect(domain).toBeVisible();
					for (const [parent, child] of [
						[domain, workspaces],
						[workspaces, workspace],
						[workspace, nested],
					]) {
						await parent.focus();
						await page.keyboard.press(expand);
						await expect(parent).toHaveAttribute('aria-expanded', 'true');
						await expect(child).toBeVisible();
						await page.keyboard.press(expand);
						await expect(child).toBeFocused();
					}
					await workspace.focus();
					await page.keyboard.press(collapse);
					await expect(nested).toHaveCount(0);
					await page.keyboard.press(expand);
					await expect(nested).toBeVisible();
					await nested.focus();
					await page.keyboard.press(expand);
					await expect(longNested).toBeVisible();
					await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
					for (const target of await tree.locator('.tree-toggle').all()) {
						const bounds = await target.boundingBox();
						expect(bounds!.width).toBeGreaterThanOrEqual(24);
						expect(bounds!.height).toBeGreaterThanOrEqual(24);
					}
					await expect(tree.locator('.tree-icon:visible')).toHaveCount(8);
					await expect(root.locator(':scope > .tree-item .tree-icon svg')).toHaveAttribute(
						'data-icon',
						'folder-open',
					);
					await expect(
						tree.locator(
							'[data-tree-node="browse-interaction-results"] > .tree-item .tree-icon svg',
						),
					).toHaveAttribute('data-icon', 'file');
					await expect(
						tree.locator('[data-tree-node="browse-workflows"] > .tree-item .tree-icon svg'),
					).toHaveAttribute('data-icon', 'folder');
					await page.locator('[data-fixture-notice]').hover();
					await settle(page);
					if (phase === 'after') {
						const rootToggle = root.locator(':scope > .tree-item .tree-toggle');
						const hitTargets = await rootToggle.evaluate((toggle) => {
							const bounds = toggle.getBoundingClientRect();
							const link = toggle
								.parentElement!.querySelector('.tree-link')!
								.getBoundingClientRect();
							const panel = toggle.closest('.nx-drawer')!.getBoundingClientRect();
							return {
								bounds: bounds.toJSON(),
								link: link.toJSON(),
								panel: panel.toJSON(),
								// Chromium rounds half-pixel hit-test coordinates onto the adjacent box.
								edges: [bounds.left + 1, bounds.right - 1].map((x) =>
									toggle.contains(document.elementFromPoint(x, bounds.top + bounds.height / 2)),
								),
								hitClasses: [bounds.left + 1, bounds.right - 1].map((x) =>
									document
										.elementFromPoint(x, bounds.top + bounds.height / 2)
										?.getAttribute('class'),
								),
							};
						});
						expect(hitTargets.edges, JSON.stringify(hitTargets)).toEqual([true, true]);
						expect(hitTargets.bounds.left).toBeGreaterThanOrEqual(hitTargets.panel.left);
						expect(hitTargets.bounds.right).toBeLessThanOrEqual(hitTargets.panel.right);
						if (locale === 'ar')
							expect(hitTargets.link.right).toBeLessThanOrEqual(hitTargets.bounds.left + 1);
						else expect(hitTargets.link.left).toBeGreaterThanOrEqual(hitTargets.bounds.right - 1);
						await expect(rootToggle.locator('fa-icon')).toBeVisible();
						await expect(rootToggle.locator('svg')).toHaveAttribute('data-icon', 'chevron-down');
						await expect(rootToggle.locator('svg.tree-chevron')).toHaveCount(0);
						const wrapped = await longNested.locator(':scope > .tree-item').evaluate((item) => {
							const label = item.querySelector<HTMLElement>('.tree-label')!;
							const toggle = item.querySelector<HTMLElement>('.tree-toggle')!;
							return {
								label: label.getBoundingClientRect().toJSON(),
								toggle: toggle.getBoundingClientRect().toJSON(),
								lineHeight: Number.parseFloat(getComputedStyle(label).lineHeight),
								whiteSpace: getComputedStyle(label).whiteSpace,
								clientWidth: label.clientWidth,
								scrollWidth: label.scrollWidth,
								clientHeight: label.clientHeight,
								scrollHeight: label.scrollHeight,
							};
						});
						expect(wrapped.whiteSpace).toBe('normal');
						expect(wrapped.label.height).toBeGreaterThan(wrapped.lineHeight * 1.5);
						expect(wrapped.scrollWidth).toBeLessThanOrEqual(wrapped.clientWidth + 1);
						expect(wrapped.scrollHeight).toBeLessThanOrEqual(wrapped.clientHeight + 1);
						expect(wrapped.toggle.y).toBeLessThanOrEqual(wrapped.label.y + 4);
						if (locale === 'ar')
							expect(wrapped.label.x + wrapped.label.width).toBeLessThanOrEqual(
								wrapped.toggle.x + 1,
							);
						else
							expect(wrapped.label.x).toBeGreaterThanOrEqual(
								wrapped.toggle.x + wrapped.toggle.width - 1,
							);
						await root.locator(':scope > .tree-item .tree-link').hover();
						const hovered = await root.locator(':scope > .tree-item').evaluate((item) => ({
							background: getComputedStyle(item).backgroundColor,
							fontWeight: getComputedStyle(item).fontWeight,
						}));
						expect(hovered).toEqual({ background: 'rgba(0, 0, 0, 0)', fontWeight: '400' });
						await page.setViewportSize({ width: 1280, height: 300 });
						const lastRow = tree.locator('[data-tree-node="browse-workflows"] > .tree-item');
						await lastRow.scrollIntoViewIfNeeded();
						const scrolling = await lastRow.evaluate((item) => {
							const content = item.closest('.nx-drawer__content')!;
							return {
								row: item.getBoundingClientRect().toJSON(),
								viewport: content.getBoundingClientRect().toJSON(),
								scrollTop: content.scrollTop,
								clientWidth: content.clientWidth,
								scrollWidth: content.scrollWidth,
							};
						});
						expect(scrolling.scrollTop).toBeGreaterThan(0);
						expect(scrolling.scrollWidth).toBeLessThanOrEqual(scrolling.clientWidth + 1);
						expect(scrolling.row.top).toBeGreaterThanOrEqual(scrolling.viewport.top);
						expect(scrolling.row.bottom).toBeLessThanOrEqual(scrolling.viewport.bottom + 1);
						responsiveEvidence['shortHeight'] = {
							viewport: { width: 1280, height: 300 },
							geometry: scrolling,
						};
						await page.setViewportSize({ width: 320, height: 900 });
						await settle(page);
						const narrow = await longNested.locator('.tree-label').evaluate((label) => ({
							label: label.getBoundingClientRect().toJSON(),
							content: label.closest('.nx-drawer__content')!.getBoundingClientRect().toJSON(),
							panel: label.closest('.nx-drawer')!.getBoundingClientRect().toJSON(),
							documentWidth: Math.max(
								document.documentElement.scrollWidth,
								document.body.scrollWidth,
							),
							clientWidth: label.clientWidth,
							scrollWidth: label.scrollWidth,
						}));
						expect(narrow.panel.width).toBe(268);
						expect(narrow.panel.left).toBe(locale === 'ar' ? 0 : 52);
						expect(narrow.panel.right).toBe(locale === 'ar' ? 268 : 320);
						expect(narrow.documentWidth).toBeLessThanOrEqual(320);
						expect(narrow.content.left, JSON.stringify(narrow)).toBeGreaterThanOrEqual(
							narrow.panel.left,
						);
						expect(narrow.content.right, JSON.stringify(narrow)).toBeLessThanOrEqual(
							narrow.panel.right,
						);
						expect(narrow.label.left).toBeGreaterThanOrEqual(narrow.panel.left);
						expect(narrow.label.right).toBeLessThanOrEqual(narrow.panel.right);
						expect(narrow.scrollWidth).toBeLessThanOrEqual(narrow.clientWidth + 1);
						const narrowFile = `browse-real-${phase}-${locale}-${theme}-narrow.png`;
						await page.screenshot({ path: resolve(run.output, narrowFile), caret: 'hide' });
						responsiveEvidence['narrow'] = {
							viewport: { width: 320, height: 900 },
							screenshot: narrowFile,
							...narrow,
						};
						await page.setViewportSize({ width: 1280, height: 900 });
						await drawer
							.locator('.nx-drawer__content')
							.evaluate((content) => content.scrollTo(0, 0));
					}
					await page.locator('[data-fixture-notice]').hover();
					await settle(page);
					const metrics = await tree.evaluate((element) => ({
						bounds: element.getBoundingClientRect().toJSON(),
						padding: getComputedStyle(element).padding,
						rows: [...element.querySelectorAll('.tree-node')].map((node) => {
							const item = node.querySelector(':scope > .tree-item')!;
							const label = item.querySelector('.tree-label')!;
							const toggle = item.querySelector('.tree-toggle');
							const icon = item.querySelector('.tree-icon')!;
							const iconStyle = getComputedStyle(icon);
							return {
								id: node.getAttribute('data-tree-node'),
								level: node.getAttribute('aria-level'),
								label: label.textContent?.trim(),
								row: item.getBoundingClientRect().toJSON(),
								labelBounds: label.getBoundingClientRect().toJSON(),
								iconBounds: icon.getBoundingClientRect().toJSON(),
								iconMargins:
									Number.parseFloat(iconStyle.marginInlineStart) +
									Number.parseFloat(iconStyle.marginInlineEnd),
								toggle: toggle?.getBoundingClientRect().toJSON(),
								rowMargin: getComputedStyle(item).marginBlock,
								lineHeight: getComputedStyle(label).lineHeight,
							};
						}),
					}));
					const file = `browse-real-${phase}-${locale}-${theme}.png`;
					if (phase === 'after') {
						for (const row of metrics.rows) {
							const inset =
								locale === 'ar'
									? metrics.bounds.right - row.labelBounds.right
									: row.labelBounds.left - metrics.bounds.left;
							const iconSpace = row.iconBounds.width + row.iconMargins;
							expect(
								Math.abs(inset - (24 + (Number(row.level) - 1) * 13 + iconSpace)),
							).toBeLessThanOrEqual(0.1);
						}
						for (let index = 1; index < 6; index++)
							expect(
								Math.abs(metrics.rows[index].row.top - metrics.rows[index - 1].row.top - 25.3),
							).toBeLessThanOrEqual(0.1);
					}
					await page.screenshot({ path: resolve(run.output, file), caret: 'hide' });
					const panelFile = `browse-real-${phase}-${locale}-${theme}-panel.png`;
					await page.screenshot({
						path: resolve(run.output, panelFile),
						clip: { x: metrics.bounds.x, y: 0, width: metrics.bounds.width, height: 400 },
						caret: 'hide',
					});
					await scan(
						page,
						info,
						`real-browse-${locale}-${theme}`,
						'deterministic real production Browse contribution with synthetic repository providers; not hosted parity',
					);
					expect(info.errors, 'Real Browse accessibility scans must pass.').toEqual([]);
					if (phase === 'after') {
						const search = page.locator('nx-drawer-item > button').nth(2);
						const account = page.locator('[data-maretha-navigation-action="account"]');
						await search.click();
						await expect(search).toHaveAttribute('aria-expanded', 'true');
						responsiveEvidence['search'] = await desktopGeometry(298);
						await account.click();
						await expect(account).toHaveAttribute('aria-expanded', 'true');
						responsiveEvidence['account'] = await desktopGeometry(298);
						await browse.click();
						responsiveEvidence['browseRestored'] = await desktopGeometry(240);
						await browse.click();
						await settle(page);
						await expect(drawer).toHaveCSS('width', '0px');
						const closedStart = await page.locator('.nx-main').evaluate((main) => {
							const bounds = main.getBoundingClientRect();
							return getComputedStyle(document.documentElement).direction === 'rtl'
								? innerWidth - bounds.right
								: bounds.left;
						});
						expect(closedStart).toBe(52);
						await browse.click();
						responsiveEvidence['browseReopened'] = await desktopGeometry(240);
						await page.evaluate(() =>
							document.documentElement.style.setProperty('--nuxeo-drawer-width', '220px'),
						);
						responsiveEvidence['narrowGlobalOverride'] = await desktopGeometry(220);
						await account.click();
						responsiveEvidence['accountGlobalOverride'] = await desktopGeometry(220);
						await page.evaluate(() => {
							document.documentElement.style.removeProperty('--nuxeo-drawer-width');
							document.documentElement.style.setProperty('--nx-browse-drawer-width', '260px');
						});
						await browse.click();
						responsiveEvidence['browseOverride'] = await desktopGeometry(260);
						await account.click();
						responsiveEvidence['accountWithBrowseOverride'] = await desktopGeometry(298);
						await page.evaluate(() =>
							document.documentElement.style.setProperty('--nx-browse-drawer-width', '360px'),
						);
						await browse.click();
						responsiveEvidence['browseOverrideCapped'] = await desktopGeometry(298);
						await page.evaluate(() =>
							document.documentElement.style.removeProperty('--nx-browse-drawer-width'),
						);
						responsiveEvidence['defaultRestored'] = await desktopGeometry(240);
					}
					expect(blocked).toEqual([]);
					evidence.push({
						locale,
						theme,
						viewport: { width: 1280, height: 900 },
						screenshot: file,
						panelScreenshot: panelFile,
						metrics,
						responsive: responsiveEvidence,
						accessibility: { engines: ['axe-core', 'IBM Equal Access'], status: 'passed' },
						scope:
							'Real production Browse drawer and contribution with synthetic local repository providers; not hosted parity.',
					});
				} finally {
					await context.close();
				}
			}
		record('local-real-browse-drawer-contract', {
			scenario: 'local-real-browse-drawer-contract',
			phase,
			status: 'local-contract-passed',
			parityVerified: false,
			evidence,
		});
	} catch (error) {
		record('local-real-browse-drawer-contract', {
			scenario: 'local-real-browse-drawer-contract',
			phase,
			status: 'failed',
			parityVerified: false,
			evidence,
		});
		// This contract is restricted to synthetic loopback data, so retain assertion diagnostics.
		throw new Error('PARITY CHECK FAILED: local real Browse drawer contract.', { cause: error });
	}
});
