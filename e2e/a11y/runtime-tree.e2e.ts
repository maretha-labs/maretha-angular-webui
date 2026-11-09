import { expect } from '@playwright/test';
import { test } from './fixture-test';
import { scan } from './scan';

for (const locale of ['en-US', 'ar'])
	for (const theme of ['default', 'dark']) {
		test.describe(`${locale} ${theme}`, () => {
			test('runtime document tree keyboard navigation', async ({ page }, info) => {
				await page.goto(`/?surface=runtime-document-tree&locale=${locale}&theme=${theme}`);
				const originalUrl = page.url();
				const fixture = page.locator('[data-runtime-tree-fixture]');
				const tree = fixture.getByRole('tree');
				const root = tree.locator('[data-tree-node="fixture-root"]');
				const branch = tree.locator('[data-tree-node="fixture-branch"]');
				const first = tree.locator('[data-tree-node="fixture-first"]');
				const next = tree.locator('[data-tree-node="fixture-next"]');
				const last = tree.locator('[data-tree-node="fixture-last"]');
				const before = fixture.locator('[data-before-runtime-tree]');
				const after = fixture.locator('[data-after-runtime-tree]');
				const selection = fixture.locator('[data-runtime-tree-selection]');
				const expand = locale === 'ar' ? 'ArrowLeft' : 'ArrowRight';
				const collapse = locale === 'ar' ? 'ArrowRight' : 'ArrowLeft';
				const onlyTabStop = async () => {
					await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
					await expect(
						tree.locator('button:not([tabindex="-1"]):not([role="treeitem"])'),
					).toHaveCount(0);
				};

				await expect(tree).toBeVisible();
				await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
				await expect(root).toHaveAttribute('aria-expanded', 'true');
				await expect(branch).toHaveAttribute('aria-expanded', 'false');
				await expect(fixture).toHaveAttribute('data-tree-requests', 'fixture-root:0');
				await onlyTabStop();
				await before.focus();
				await page.keyboard.press('Tab');
				await expect(root).toBeFocused();

				await page.keyboard.press(collapse);
				await expect(root).toHaveAttribute('aria-expanded', 'false');
				await expect(branch).toHaveCount(0);
				await page.keyboard.press(expand);
				await expect(branch).toBeVisible();
				await page.keyboard.press(expand);
				await expect(branch).toBeFocused();
				await page.keyboard.press(expand);
				await expect(first).toBeVisible();
				await expect(fixture).toHaveAttribute(
					'data-tree-requests',
					'fixture-root:0,fixture-branch:0',
				);
				await expect(branch).toBeFocused();
				await page.keyboard.press(expand);
				await expect(first).toBeFocused();
				await page.keyboard.press(collapse);
				await expect(branch).toBeFocused();
				await expect(branch).toHaveAttribute('aria-expanded', 'true');
				await page.keyboard.press(expand);
				await page.keyboard.press('ArrowDown');
				await expect(tree.locator('.tree-more')).toBeFocused();
				await page.keyboard.press('Enter');
				await expect(next).toBeVisible();
				await expect(tree.locator('.tree-more')).toHaveCount(0);
				await expect(fixture).toHaveAttribute(
					'data-tree-requests',
					'fixture-root:0,fixture-branch:0,fixture-branch:1',
				);
				await expect(tree.locator('[role="treeitem"]:focus')).toHaveCount(1);
				await onlyTabStop();

				await page.keyboard.press('Home');
				await expect(root).toBeFocused();
				await page.keyboard.press('End');
				await expect(last).toBeFocused();
				await page.keyboard.press('ArrowUp');
				await expect(next).toBeFocused();
				await expect(tree.locator('[aria-selected="true"]')).toHaveCount(0);
				await page.keyboard.press('Space');
				await expect(next).toHaveAttribute('aria-selected', 'true');
				await expect(selection).toHaveAttribute('data-selected-uid', 'fixture-next');
				await expect(selection).toHaveText('Customer {next page}');

				await page.keyboard.press(collapse);
				await expect(branch).toBeFocused();
				await page.keyboard.press(collapse);
				await expect(branch).toHaveAttribute('aria-expanded', 'false');
				await expect(next).toHaveCount(0);
				await page.keyboard.press('ArrowDown');
				await expect(last).toBeFocused();
				await page.keyboard.press('Enter');
				await expect(last).toHaveAttribute('aria-selected', 'true');
				await expect(selection).toHaveText('Customer {archive}');
				await page.keyboard.press('ArrowUp');
				await expect(branch).toBeFocused();
				await page.keyboard.press(expand);
				await expect(next).toBeVisible();
				await page.keyboard.press('End');
				await expect(last).toBeFocused();
				await page.keyboard.press('Tab');
				await expect(after).toBeFocused();
				await page.keyboard.press('Shift+Tab');
				await expect(last).toBeFocused();
				await onlyTabStop();
				expect(page.url()).toBe(originalUrl);
				await scan(page, info, 'runtime-document-tree');
			});
		});
	}
