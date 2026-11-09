import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './fixture-test';
import { scan } from './scan';

for (const locale of ['en-US', 'ar'])
	for (const theme of ['default', 'dark'])
		test.describe(`${locale} ${theme}`, () => {
			test('document tabs preserve drafts and recover focus', async ({ page }, info) => {
				await page.goto(`/?surface=document-tabs&locale=${locale}&theme=${theme}`);
				const tabs = page.getByRole('tab');
				await expect(tabs).toHaveCount(3);
				// Hovering an enabled inactive tab must retain readable text in both themes.
				await tabs.nth(1).hover();
				const hovered = await new AxeBuilder({ page })
					.include('.view-tabs')
					.withRules(['color-contrast'])
					.analyze();
				expect(hovered.violations).toEqual([]);
				await page.mouse.move(0, 0);
				await page.locator('[data-before-tabs]').focus();
				await page.keyboard.press('Tab');
				await expect(tabs.nth(0)).toBeFocused();
				await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
				expect(await page.locator('[role="tab"][tabindex="0"]').count()).toBe(1);
				const draft = page.locator('#view-draft');
				await draft.fill('Customer draft {literal}');
				await page.locator('[data-block-departure]').check();
				await tabs.nth(0).focus();
				await page.keyboard.press(locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
				await expect(tabs.nth(1)).toBeFocused();
				await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
				await page.keyboard.press('Enter');
				await expect(tabs.nth(0)).toBeFocused();
				await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
				await expect(draft).toHaveValue('Customer draft {literal}');
				await page.locator('[data-block-departure]').uncheck();
				await tabs.nth(0).focus();
				await page.keyboard.press(locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
				await page.keyboard.press('Space');
				await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
				await expect(page.getByRole('tabpanel')).toHaveCount(1);
				await page.keyboard.press('Home');
				await expect(tabs.nth(0)).toBeFocused();
				await page.keyboard.press('Enter');
				await expect(draft).toHaveValue('Customer draft {literal}');
				await page.keyboard.press('End');
				await expect(tabs.nth(2)).toBeFocused();
				await page.keyboard.press(locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
				await expect(tabs.nth(0)).toBeFocused();
				// Simulate a contribution being removed independently while its tab owns focus.
				await page.locator('[data-remove-last]').click();
				await tabs.nth(2).focus();
				await expect(tabs).toHaveCount(2);
				await expect(tabs.nth(0)).toBeFocused();
				await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
				await page.keyboard.press('Tab');
				await expect(page.getByRole('tabpanel')).toBeFocused();
				await page.keyboard.press('Tab');
				await expect(draft).toBeFocused();
				await scan(page, info, 'document-tabs');
			});
			test('SDK tree navigates expands selects and recovers focus', async ({ page }, info) => {
				await page.goto(`/?surface=sdk-tree&locale=${locale}&theme=${theme}`);
				const tree = page.getByRole('tree', {
					name: locale === 'ar' ? 'مجلدات العميل' : 'Customer folders',
				});
				const parent = tree.getByRole('treeitem', {
					name: locale === 'ar' ? 'المجلد الرئيسي' : 'Parent folder',
					exact: true,
				});
				const child = tree.getByRole('treeitem', {
					name: locale === 'ar' ? 'مجلد فرعي' : 'Child folder',
					exact: true,
				});
				const last = tree.getByRole('treeitem', {
					name: locale === 'ar' ? 'المجلد الأخير' : 'Last folder',
					exact: true,
				});
				await expect(tree.getByRole('treeitem')).toHaveCount(3);
				await page.locator('[data-before-tree]').focus();
				await page.keyboard.press('Tab');
				await expect(parent).toBeFocused();
				await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
				const expand = locale === 'ar' ? 'ArrowLeft' : 'ArrowRight',
					collapse = locale === 'ar' ? 'ArrowRight' : 'ArrowLeft';
				await page.keyboard.press(expand);
				await expect(child).toBeFocused();
				await page.keyboard.press(collapse);
				await expect(parent).toBeFocused();
				await page.keyboard.press(collapse);
				await expect(parent).toHaveAttribute('aria-expanded', 'false');
				await expect(child).toHaveCount(0);
				await page.keyboard.press('ArrowDown');
				await expect(last).toBeFocused();
				await page.keyboard.press('Home');
				await expect(parent).toBeFocused();
				await page.keyboard.press(expand);
				await expect(parent).toHaveAttribute('aria-expanded', 'true');
				await page.keyboard.press('ArrowDown');
				await expect(child).toBeFocused();
				await page.keyboard.press('Enter');
				await expect(child).toHaveAttribute('aria-selected', 'true');
				await expect(page.locator('[data-tree-selection]')).toHaveText(
					locale === 'ar' ? 'مجلد فرعي' : 'Child folder',
				);
				await page.keyboard.press('End');
				await expect(last).toBeFocused();
				await page.keyboard.press('ArrowUp');
				await expect(child).toBeFocused();
				await page.keyboard.press('Tab');
				await expect(page.locator('[data-after-tree]')).toBeFocused();
				await page.keyboard.press('Shift+Tab');
				await expect(child).toBeFocused();
				await page.locator('[data-remove-last]').click();
				await last.focus();
				await expect(last).toHaveCount(0);
				await expect(tree.locator(':focus')).toHaveCount(1);
				await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
				await scan(page, info, 'sdk-tree');
			});
		});
