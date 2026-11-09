import { expect } from '@playwright/test';
import { isExactDocumentRoute } from '../local-boundary.mjs';
import { test } from './fixture-test';
import { scan } from './scan';

for (const locale of ['en-US', 'ar'])
	for (const theme of ['default', 'dark']) {
		test.describe(`${locale} ${theme}`, () => {
			test.beforeEach(async ({ page }) => {
				await page.goto(`/?locale=${locale}&theme=${theme}`);
				await expect(page.locator('[data-fixture-notice]')).toBeVisible();
				await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
				await expect(page.locator('html')).toHaveAttribute('lang', locale);
			});
			test('shell and actual user-menu keyboard focus', async ({ page }, info) => {
				await scan(page, info, 'shell');
				const menu = page.getByRole('button', {
					name: locale === 'ar' ? 'قائمة المستخدم' : 'User menu',
					exact: true,
				});
				await menu.focus();
				await page.keyboard.press('Enter');
				await expect(menu).toHaveAttribute('aria-expanded', 'true');
				await expect(
					page.getByRole('button', {
						name: locale === 'ar' ? 'إغلاق قائمة المستخدم' : 'Close user menu',
						exact: true,
					}),
				).toBeVisible();
				// Activation dismisses the trigger label before scanning the open drawer.
				await expect(page.locator('.nx-rail-tooltip[role="tooltip"]')).toHaveCount(0);
				const edgeToggle = page.getByRole('button', {
					name: locale === 'ar' ? 'إغلاق التنقل' : 'Close navigation',
					exact: true,
				});
				await expect(edgeToggle).toBeVisible();
				// The toggle is revealed only while the drawer is hovered.
				await page.locator('#nx-sidebar-drawer').hover();
				await expect(edgeToggle).toHaveCSS('opacity', '1');
				const bounds = await edgeToggle.boundingBox();
				expect(bounds).not.toBeNull();
				expect(bounds!.width).toBeGreaterThanOrEqual(24);
				expect(bounds!.height).toBeGreaterThanOrEqual(24);
				await scan(page, info, 'user-menu');
				await page.keyboard.press('Escape');
				await expect(menu).toHaveAttribute('aria-expanded', 'false');
				await expect(menu).toBeFocused();
			});
			test('rail labels support hover, keyboard dismissal and unclipped directional placement', async ({
				page,
			}, info) => {
				const buttons = page.locator('nx-drawer-item > button');
				const first = buttons.first();
				const last = buttons.last();
				const tooltip = page.locator('.nx-rail-tooltip[role="tooltip"]');
				await expect(first).toHaveAccessibleName(locale === 'ar' ? 'تصفح' : 'Browse');
				for (const button of await buttons.all()) await expect(button).not.toHaveAttribute('title');
				await first.hover();
				await expect(tooltip).toHaveCount(1);
				await expect(tooltip).toHaveAttribute('role', 'tooltip');
				await expect(tooltip).toHaveText(locale === 'ar' ? 'تصفح' : 'Browse');
				await expect(tooltip).toHaveCSS('opacity', '0.9');
				const inner = tooltip.locator('.tooltip-inner');
				await expect(inner).toHaveCSS('font-size', '13px');
				await expect(inner).toHaveCSS('line-height', '13px');
				await expect(inner).toHaveCSS('padding', '8px');
				await expect(inner).toHaveCSS('border-radius', '2px');
				await expect(inner).toHaveCSS('color', 'rgb(255, 255, 255)');
				await expect(inner).toHaveCSS('font-family', /Inter/);
				await expect(inner).toHaveCSS(
					'background-color',
					await page
						.locator('.nx-sidebar')
						.evaluate((element) => getComputedStyle(element).backgroundColor),
				);
				await expect(tooltip.locator('.arrow, .tooltip-arrow')).toHaveCount(0);
				// The visible label duplicates the accessible name, so avoid announcing it twice.
				await expect(first).not.toHaveAttribute('aria-describedby');
				// The overlay must remain beside the rail, even when its drawer overlaps that area.
				const checkPlacement = async () => {
					const anchor = await first.boundingBox();
					const label = await tooltip.boundingBox();
					expect(anchor).not.toBeNull();
					expect(label).not.toBeNull();
					const gap =
						locale === 'ar'
							? anchor!.x - (label!.x + label!.width)
							: label!.x - (anchor!.x + anchor!.width);
					expect(Math.abs(gap), 'Label must touch the rail without a gap').toBeLessThanOrEqual(1);
					expect(
						Math.abs(label!.y + label!.height / 2 - (anchor!.y + anchor!.height / 2)),
					).toBeLessThanOrEqual(1);
					expect(label!.x).toBeGreaterThanOrEqual(0);
					expect(label!.x + label!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
					const visibleAtCenter = await tooltip.evaluate((element) => {
						if (element.closest('.nx-sidebar, .nx-drawer')) return false;
						const rect = element.getBoundingClientRect();
						return element.contains(
							document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
						);
					});
					expect(visibleAtCenter, 'An open drawer must not cover the label').toBe(true);
				};
				await checkPlacement();
				await page.setViewportSize({ width: 719, height: 900 });
				await expect(first).toBeHidden();
				await expect(tooltip).toHaveCount(0);
				await page.setViewportSize({ width: 1280, height: 900 });
				await first.hover();
				await expect(tooltip).toHaveCSS('opacity', '0.9');
				await last.hover();
				await expect(tooltip).toHaveCount(1);
				await expect(tooltip).toHaveText((await last.getAttribute('aria-label'))!);
				await page.setViewportSize({ width: 1280, height: 300 });
				await expect(last).not.toBeInViewport();
				await expect(tooltip).toHaveCount(0);
				await page.setViewportSize({ width: 1280, height: 900 });
				await last.hover();
				await expect(tooltip).toHaveText((await last.getAttribute('aria-label'))!);
				await page.locator('[data-fixture-notice]').hover();
				await expect(tooltip).toHaveCount(0);
				await first.focus();
				await expect(tooltip).toHaveText(locale === 'ar' ? 'تصفح' : 'Browse');
				await page.keyboard.press('Escape');
				await expect(tooltip).toHaveCount(0);
				await expect(first).toBeFocused();
				await expect(first).not.toHaveAttribute('aria-describedby');
				await page.keyboard.press('Tab');
				await first.focus();
				await expect(tooltip).toBeVisible();
				await page.keyboard.press('Enter');
				await expect(first).toHaveAttribute('aria-expanded', 'true');
				await expect(tooltip).toHaveCount(0);
				await page.locator('[data-fixture-notice]').hover();
				await first.hover();
				await expect(tooltip).toHaveCSS('opacity', '0.9');
				await checkPlacement();
				const account = page.locator('[data-maretha-navigation-action="account"]');
				await account.hover();
				await expect(tooltip).toHaveText('Fixture Reader');
				await expect(account).toHaveAccessibleDescription('Fixture Reader');
				await account.click();
				await expect(account).toHaveAttribute('aria-expanded', 'true');
				await expect(tooltip).toHaveCount(0);
				await expect(account).not.toHaveAttribute('aria-describedby');
				await first.hover();
				await expect(tooltip).toHaveCSS('opacity', '0.9');
				await checkPlacement();
				await page.screenshot({
					path: `dist/verification/visual-parity/rail-tooltip-${locale}-${theme}.png`,
					fullPage: true,
				});
				await scan(page, info, 'rail-tooltip-over-drawer');
				await page.emulateMedia({ reducedMotion: 'reduce' });
				await expect(tooltip).toHaveCSS('animation-name', 'none');
				await expect(tooltip).toHaveCSS('opacity', '0.9');
				await page.emulateMedia({ reducedMotion: 'no-preference' });
			});
			test('quick search traps focus, supports result arrows, navigates and restores focus on Escape', async ({
				page,
			}, info) => {
				const trigger = page.locator('nx-quick-search > button');
				await trigger.focus();
				await page.keyboard.press('Enter');
				const dialog = page.locator('nx-quick-search dialog');
				const input = dialog.getByRole('searchbox');
				await expect(input).toBeFocused();
				await input.fill('fixture');
				await expect(dialog.getByRole('option')).toHaveCount(1);
				await page.keyboard.press('ArrowDown');
				await expect(dialog.getByRole('option')).toBeFocused();
				await scan(page, info, 'quick-search-results');
				await page.keyboard.press('Enter');
				await expect.poll(() => isExactDocumentRoute(page.url(), 'fixture-document')).toBe(true);
				await expect(dialog).toHaveCount(0);
				await trigger.focus();
				await page.keyboard.press('Enter');
				await expect(input).toBeFocused();
				await page.keyboard.press('Shift+Tab');
				await expect(dialog.locator(':focus')).toHaveCount(1);
				await page.keyboard.press('Escape');
				await expect(trigger).toBeFocused();
			});
			test('real confirmation modal preserves keyboard containment and returns focus', async ({
				page,
			}, info) => {
				const trigger = page.getByRole('button', {
					name: locale === 'ar' ? 'فتح مربع التأكيد' : 'Open confirmation dialog',
				});
				await trigger.focus();
				await page.keyboard.press('Enter');
				const dialog = page.getByRole('dialog');
				await expect(dialog).toBeVisible();
				await expect(dialog).toHaveCSS('opacity', '1');
				await expect(dialog.locator('.modal-dialog')).toHaveCSS('transform', 'none');
				await page.evaluate(() => document.fonts.ready.then(() => undefined));
				const heading = dialog.getByRole('heading', {
					level: 2,
					name: locale === 'ar' ? 'تأكيد الإجراء' : 'Confirm action',
					exact: true,
				});
				await expect(heading).toBeVisible();
				const renderedTitle = await heading.evaluate((element) => {
					const ancestors: Element[] = [];
					for (let current: Element | null = element; current; current = current.parentElement)
						ancestors.push(current);
					const rgba = (color: string) => {
						const channels = color.match(/[\d.]+/g)?.map(Number);
						if (!channels || channels.length < 3)
							throw new Error('Unsupported computed color format');
						return [channels[0], channels[1], channels[2], channels[3] ?? 1];
					};
					const blend = (front: number[], back: number[]) =>
						front
							.slice(0, 3)
							.map((value, index) => value * front[3] + back[index] * (1 - front[3]));
					let background = [255, 255, 255];
					for (const ancestor of [...ancestors].reverse())
						background = blend(rgba(getComputedStyle(ancestor).backgroundColor), background);
					const style = getComputedStyle(element);
					const foreground = blend(rgba(style.color), background);
					const luminance = (rgb: number[]) =>
						rgb
							.map((value) => value / 255)
							.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
							.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
					const foregroundL = luminance(foreground),
						backgroundL = luminance(background);
					const bounds = element.getBoundingClientRect();
					return {
						text: element.textContent?.trim(),
						color: style.color,
						foreground,
						background,
						contrast:
							(Math.max(foregroundL, backgroundL) + 0.05) /
							(Math.min(foregroundL, backgroundL) + 0.05),
						width: bounds.width,
						height: bounds.height,
						ancestors: ancestors.map((ancestor) => ({
							tag: ancestor.tagName,
							class: ancestor.className,
							opacity: getComputedStyle(ancestor).opacity,
							background: getComputedStyle(ancestor).backgroundColor,
						})),
					};
				});
				await info.attach('confirmation-heading-rendering', {
					body: JSON.stringify(renderedTitle, null, 2),
					contentType: 'application/json',
				});
				expect(renderedTitle.width).toBeGreaterThan(0);
				expect(renderedTitle.height).toBeGreaterThan(0);
				expect(renderedTitle.ancestors.every((ancestor) => ancestor.opacity === '1')).toBe(true);
				expect(
					renderedTitle.contrast,
					'Actual heading must remain legible even when an engine does not evaluate Arabic text contrast',
				).toBeGreaterThanOrEqual(4.5);
				await scan(page, info, 'confirmation-dialog');
				await dialog
					.getByRole('button', { name: locale === 'ar' ? 'إلغاء' : 'Cancel', exact: true })
					.focus();
				// The close control is the last tab stop, after Confirm.
				await page.keyboard.press('Shift+Tab');
				await expect(
					dialog.getByRole('button', { name: locale === 'ar' ? 'إغلاق' : 'Close', exact: true }),
				).toBeFocused();
				await page.keyboard.press('Shift+Tab');
				await expect(
					dialog.getByRole('button', { name: locale === 'ar' ? 'تأكيد' : 'Confirm', exact: true }),
				).toBeFocused();
				await expect(page.locator('.cdk-focus-trap-anchor:focus')).toHaveCount(0);
				await page.keyboard.press('Tab');
				await page.keyboard.press('Tab');
				await expect(
					dialog.getByRole('button', { name: locale === 'ar' ? 'إلغاء' : 'Cancel', exact: true }),
				).toBeFocused();
				await expect(page.locator('.cdk-focus-trap-anchor:focus')).toHaveCount(0);
				await page.keyboard.press('Escape');
				await expect(dialog).toHaveCount(0);
				await expect(trigger).toBeFocused();
			});
			test('signed-out unauthorized boundary (Nuxeo login requires separate live suite)', async ({
				page,
			}, info) => {
				await page.goto(`/?surface=signed-out&locale=${locale}&theme=${theme}`);
				await expect(page.locator('nx-unauthorized')).toBeVisible();
				await expect(page.locator('nx-sidebar aside')).toHaveCount(0);
				await scan(page, info, 'signed-out-boundary');
			});
			test('actions menu', async ({ page }, info) => {
				await page.goto(`/?surface=actions-menu&locale=${locale}&theme=${theme}`);
				const trigger = page.locator('nx-actions-menu > button');
				const first = page.getByRole('menuitem', {
					name: locale === 'ar' ? 'الإجراء الأول' : 'First action',
					exact: true,
				});
				const last = page.getByRole('menuitem', {
					name: locale === 'ar' ? 'الإجراء الأخير' : 'Last action',
					exact: true,
				});
				await trigger.focus();
				await page.keyboard.press('Enter');
				await expect(first).toBeFocused();
				await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
				await expect(page.getByRole('menu')).toBeVisible();
				await expect(trigger).toHaveAttribute(
					'aria-controls',
					(await page.getByRole('menu').getAttribute('id'))!,
				);
				await page.keyboard.press('ArrowDown');
				await expect(last).toBeFocused();
				await page.keyboard.press('Home');
				await expect(first).toBeFocused();
				await page.keyboard.press('End');
				await expect(last).toBeFocused();
				await scan(page, info, 'actions-menu');
				await page.keyboard.press('Escape');
				await expect(trigger).toBeFocused();
				await expect(trigger).toHaveAttribute('aria-expanded', 'false');
				await page.keyboard.press('ArrowUp');
				await expect(last).toBeFocused();
				await page.keyboard.press('Enter');
				await expect(page.getByRole('status')).toHaveText('Last action');
				await expect(trigger).toBeFocused();
				await page.keyboard.press('ArrowDown');
				await expect(first).toBeFocused();
				await page.keyboard.press('Tab');
				await expect(page.locator('[data-after-menu]')).toBeFocused();
				await expect(page.getByRole('menu')).toHaveCount(0);
				await page.keyboard.press('Shift+Tab');
				await expect(trigger).toBeFocused();
				await page.keyboard.press('ArrowDown');
				await expect(first).toBeFocused();
				await page.keyboard.press('Shift+Tab');
				await expect(page.locator('[data-before-menu]')).toBeFocused();
				await expect(page.getByRole('menu')).toHaveCount(0);
			});
			test('tooltip', async ({ page }, info) => {
				await page.goto(`/?surface=tooltip&locale=${locale}&theme=${theme}`);
				const trigger = page.locator('[data-tooltip-trigger]');
				await trigger.focus();
				const tooltip = page.getByRole('tooltip');
				await expect(tooltip).toBeVisible();
				const tooltipId = await tooltip.getAttribute('id');
				await expect(trigger).toHaveAttribute('aria-describedby', `fixture-help ${tooltipId}`);
				await expect(trigger).toHaveAccessibleDescription(
					locale === 'ar'
						? 'وصف موجود للزر. معلومات إضافية'
						: 'Existing button description. Additional information',
				);
				await scan(page, info, 'tooltip');
				await page.keyboard.press('Escape');
				await expect(tooltip).toBeHidden();
				await expect(trigger).toBeFocused();
				await page.keyboard.press('Tab');
				await expect(page.locator('[data-after-tooltip]')).toBeFocused();
				await expect(trigger).toHaveAttribute('aria-describedby', 'fixture-help');
				await trigger.hover();
				await expect(tooltip).toBeVisible();
				await tooltip.hover();
				await expect(tooltip).toBeVisible();
				await page.locator('[data-after-tooltip]').hover();
				await expect(tooltip).toBeHidden();
			});
			test('content editors', async ({ page }, info) => {
				await page.goto(`/?surface=content-editors&locale=${locale}&theme=${theme}`);
				const editors = page.locator('nx-standard-content-editor');
				await expect(editors).toHaveCount(2);
				const firstTitle = editors.nth(0).locator('input[formcontrolname="dc:title"]');
				const secondTitle = editors.nth(1).locator('input[formcontrolname="dc:title"]');
				for (const field of ['dc:nature', 'dc:subjects']) {
					const input = editors
						.nth(0)
						.locator(`nx-vocabulary[formcontrolname="${field}"]`)
						.getByRole('combobox');
					await input.fill('Customer {label}');
					await expect(
						page.getByRole('option', { name: 'Customer {label}', exact: true }),
					).toBeVisible();
					await page.getByRole('option', { name: 'Customer {label}', exact: true }).click();
					await expect(
						editors.nth(0).locator(`nx-vocabulary[formcontrolname="${field}"] .ng-value-label`),
					).toHaveText('Customer {label}');
				}
				// The visible asterisk is decorative; assistive technology learns "required" from the input.
				await expect(firstTitle).toHaveAccessibleName(locale === 'ar' ? 'العنوان' : 'Title');
				await expect(firstTitle).toHaveAttribute('required', '');
				expect(await firstTitle.getAttribute('id')).not.toBe(await secondTitle.getAttribute('id'));
				await firstTitle.focus();
				await page.keyboard.press('Tab');
				await expect(firstTitle).toHaveAttribute('aria-invalid', 'true');
				const error = page.locator(`[id="${await firstTitle.getAttribute('aria-describedby')}"]`);
				await expect(error).toBeVisible();
				await expect(firstTitle).toHaveAccessibleDescription((await error.innerText()).trim());
				await expect(secondTitle).not.toHaveAttribute('aria-invalid', 'true');
				const repeatedIds = await editors.evaluateAll((elements) => {
					const ids = elements.flatMap((element) =>
						Array.from(element.querySelectorAll('[id]')).map((node) => node.id),
					);
					return ids.filter((id, index) => ids.indexOf(id) !== index);
				});
				expect(repeatedIds).toEqual([]);
				await scan(page, info, 'content-editors');
				const subjects = editors.nth(0).locator('nx-vocabulary[formcontrolname="dc:subjects"]');
				const remove = subjects.locator('button.ng-value-icon');
				await expect(remove).toHaveAccessibleDescription('Customer {label}');
				await subjects.getByRole('combobox').focus();
				await page.keyboard.press('Shift+Tab');
				await expect(remove).toBeFocused();
				await page.keyboard.press('Enter');
				await expect(subjects.getByRole('combobox')).toBeFocused();
				await expect(remove).toHaveCount(0);
				await firstTitle.fill('Customer draft {literal}');
				await expect(firstTitle).not.toHaveAttribute('aria-invalid', 'true');
				await expect(error).toHaveCount(0);
				await expect(secondTitle).toHaveValue('');
				await page.setViewportSize({ width: 320, height: 900 });
				await firstTitle.focus();
				await page.keyboard.press('Tab');
				const description = editors.nth(0).locator('textarea');
				await expect(description).toBeFocused();
				const narrow = await page.evaluate(() => ({
					viewport: innerWidth,
					documentWidth: document.documentElement.scrollWidth,
					fields: Array.from(
						document.querySelectorAll(
							'nx-standard-content-editor input, nx-standard-content-editor textarea, nx-standard-content-editor select',
						),
					).map((element) => {
						const bounds = element.getBoundingClientRect();
						return { id: element.id, left: bounds.left, right: bounds.right, width: bounds.width };
					}),
				}));
				await info.attach('content-editors-narrow-bounds', {
					body: JSON.stringify(narrow),
					contentType: 'application/json',
				});
				expect(narrow.viewport).toBe(320);
				expect(narrow.documentWidth).toBeLessThanOrEqual(320);
				expect(
					narrow.fields.every((field) => field.width > 0 && field.left >= -1 && field.right <= 321),
				).toBe(true);
				await info.attach('content-editors-narrow-screenshot', {
					body: await page.screenshot({ fullPage: true }),
					contentType: 'image/png',
				});
			});
			test('file upload', async ({ page }, info) => {
				await page.goto(`/?surface=file-upload&locale=${locale}&theme=${theme}`);
				const picker = page.locator('nx-file-upload nx-webui-slot button');
				await expect(picker).toBeVisible();
				await expect(picker).toBeFocused();
				await expect(picker).toHaveAccessibleName(/\S/);
				await page.keyboard.press('Tab');
				await expect(page.locator('[data-after-upload]')).toBeFocused();
				await page.keyboard.press('Shift+Tab');
				await expect(picker).toBeFocused();
				const chooser = page.waitForEvent('filechooser');
				await page.keyboard.press('Enter');
				await (
					await chooser
				).setFiles({
					name: 'Customer {literal}.txt',
					mimeType: 'text/plain',
					buffer: Buffer.from('Local fixture only'),
				});
				await expect(page.getByRole('status')).toHaveText('Customer {literal}.txt');
				await expect(picker).toBeFocused();
				await scan(page, info, 'file-upload');
			});
		});
	}
