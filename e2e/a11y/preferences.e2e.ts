import { expect, Locator } from '@playwright/test';
import { test } from './fixture-test';
import { scan } from './scan';

// Measure rendered theme colors independently of the scanning engines.
async function appearance(target: Locator, pseudo: string | null = null) {
	return target.evaluate((element, pseudo) => {
		const rgb = (value: string): number[] => {
			const parts = value.match(/[\d.]+/g)?.map(Number);
			if (!parts || parts.length < 3) throw new Error(`Unsupported computed color: ${value}`);
			return [parts[0], parts[1], parts[2], parts[3] ?? 1];
		};
		const ancestors: Element[] = [];
		for (let current: Element | null = element; current; current = current.parentElement)
			ancestors.unshift(current);
		let background = [255, 255, 255];
		for (const current of ancestors) {
			const color = rgb(getComputedStyle(current).backgroundColor);
			background = background.map(
				(channel, index) => color[index] * color[3] + channel * (1 - color[3]),
			);
		}
		const style = getComputedStyle(element, pseudo);
		const luminance = (color: number[]) =>
			color
				.slice(0, 3)
				.map((channel) => {
					const s = channel / 255;
					return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
				})
				.reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
		const ratio = (foreground: string) => {
			const color = rgb(foreground);
			const composed = background.map(
				(channel, index) => color[index] * color[3] + channel * (1 - color[3]),
			);
			const a = luminance(composed),
				b = luminance(background);
			return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
		};
		return {
			color: style.color,
			background: getComputedStyle(element).backgroundColor,
			opacity: style.opacity,
			backgroundImage: style.backgroundImage,
			strokeWidth: style.borderTopWidth,
			strokeStyle: style.borderTopStyle,
			outlineWidth: parseFloat(style.outlineWidth),
			outlineStyle: style.outlineStyle,
			textContrast: ratio(style.color),
			strokeContrast: ratio(style.borderTopColor),
			outlineContrast: ratio(style.outlineColor),
		};
	}, pseudo);
}

for (const locale of ['en-US', 'ar'])
	for (const theme of ['default', 'dark']) {
		test.describe(`${locale} ${theme}`, () => {
			test.beforeEach(async ({ page }) => {
				await page.goto(`/?surface=content-editors&locale=${locale}&theme=${theme}`);
				await expect(page.locator('nx-standard-content-editor')).toHaveCount(2);
				await expect(page.locator('html')).toHaveAttribute('lang', locale);
				if (locale === 'ar')
					await expect
						.poll(() =>
							page
								.locator('link[href*="bootstrap.rtl"]')
								.evaluateAll((links) =>
									links.some((link) => (link as HTMLLinkElement).sheet !== null),
								),
						)
						.toBe(true);
			});
			test('editor contrast and keyboard focus', async ({ page }, info) => {
				const editor = page.locator('nx-base-editor').first();
				const close = editor.locator('.btn-close');
				const title = editor.locator('input[formcontrolname="dc:title"]');
				await close.focus();
				const glyph = await appearance(close, '::before');
				const closeStyle = await appearance(close);
				expect(closeStyle.backgroundImage).toBe('none');
				expect(closeStyle.opacity).toBe('1');
				expect(parseFloat(glyph.strokeWidth)).toBeGreaterThanOrEqual(2);
				expect(glyph.strokeContrast).toBeGreaterThanOrEqual(3);
				expect(closeStyle.outlineWidth).toBeGreaterThanOrEqual(2);
				expect(closeStyle.outlineStyle).toBe('solid');
				expect(closeStyle.outlineContrast).toBeGreaterThanOrEqual(3);
				await page.keyboard.press('Tab');
				await expect(title).toBeFocused();
				const field = await appearance(title);
				expect(field.textContrast).toBeGreaterThanOrEqual(4.5);
				expect(field.outlineWidth).toBeGreaterThanOrEqual(2);
				expect(field.outlineContrast).toBeGreaterThanOrEqual(3);
				// Stock underline fields paint no background of their own; contrast above is measured against the composed background.
				if (theme === 'dark') expect(field.background).toBe('rgba(0, 0, 0, 0)');
				await title.fill('Customer draft {literal}');
				await info.attach('rendered-editor-contrast', {
					body: JSON.stringify({ glyph, close: closeStyle, field }),
					contentType: 'application/json',
				});
				await scan(page, info, 'editor-contrast-focus');
			});
			test('text spacing and narrow enlarged layout', async ({ page }, info) => {
				const title = page.locator('input[formcontrolname="dc:title"]').first();
				await title.fill('Customer draft {literal}');
				await page.addStyleTag({
					content: `* {line-height:1.5 !important;letter-spacing:.12em !important;word-spacing:.16em !important;} p {margin-bottom:2em !important;}`,
				});
				await page.setViewportSize({ width: 320, height: 900 });
				// Root text enlargement is an explicit CSS proxy; physical browser zoom is a separate manual check.
				await page.addStyleTag({ content: 'html {font-size:200% !important;}' });
				await title.focus();
				await page.keyboard.press('Tab');
				await expect(page.locator('nx-standard-content-editor textarea').first()).toBeFocused();
				await expect(title).toHaveValue('Customer draft {literal}');
				const geometry = await page.evaluate(() => ({
					viewport: innerWidth,
					documentWidth: document.documentElement.scrollWidth,
					rootFontSize: getComputedStyle(document.documentElement).fontSize,
					controls: Array.from(
						document.querySelectorAll(
							'nx-standard-content-editor input, nx-standard-content-editor textarea, nx-standard-content-editor select, nx-base-editor button',
						),
					)
						.filter((element) => element.getBoundingClientRect().width > 0)
						.map((element) => {
							const bounds = element.getBoundingClientRect();
							return {
								tag: element.tagName,
								left: bounds.left,
								right: bounds.right,
								width: bounds.width,
								height: bounds.height,
							};
						}),
					labels: Array.from(
						document.querySelectorAll(
							'nx-standard-content-editor label, nx-base-editor .modal-footer button',
						),
					).map((element) => ({
						text: element.textContent?.trim(),
						client: element.clientWidth,
						scroll: element.scrollWidth,
					})),
				}));
				await info.attach('spacing-reflow-enlargement', {
					body: JSON.stringify(geometry),
					contentType: 'application/json',
				});
				expect(geometry.rootFontSize).toBe('32px');
				expect(geometry.documentWidth).toBeLessThanOrEqual(320);
				expect(geometry.controls.length).toBeGreaterThan(10);
				expect(
					geometry.controls.every(
						(control) => control.left >= -1 && control.right <= 321 && control.height > 0,
					),
				).toBe(true);
				expect(
					geometry.labels
						.filter((label) => label.client > 0)
						.every((label) => label.scroll <= label.client + 1),
				).toBe(true);
				await scan(page, info, 'editor-spacing-reflow-enlargement');
			});
			test('forced colors preserves close glyph focus and draft', async ({ page }, info) => {
				await page.emulateMedia({ forcedColors: 'active' });
				expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
				const editor = page.locator('nx-base-editor').first();
				const close = editor.locator('.btn-close');
				const title = editor.locator('input[formcontrolname="dc:title"]');
				await title.fill('Customer draft {literal}');
				await close.focus();
				const glyph = await appearance(close, '::before');
				const focus = await appearance(close);
				expect(parseFloat(glyph.strokeWidth)).toBeGreaterThanOrEqual(2);
				expect(glyph.strokeStyle).toBe('solid');
				expect(glyph.strokeContrast).toBeGreaterThanOrEqual(3);
				expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
				expect(focus.outlineContrast).toBeGreaterThanOrEqual(3);
				await page.keyboard.press('Tab');
				await expect(title).toBeFocused();
				const field = await appearance(title);
				expect(field.textContrast).toBeGreaterThanOrEqual(4.5);
				expect(field.outlineContrast).toBeGreaterThanOrEqual(3);
				await expect(title).toHaveValue('Customer draft {literal}');
				await info.attach('forced-colors-rendering', {
					body: JSON.stringify({ glyph, focus, field }),
					contentType: 'application/json',
				});
				await scan(page, info, 'editor-forced-colors');
			});
		});
	}
