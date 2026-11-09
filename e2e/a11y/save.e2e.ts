import { expect } from '@playwright/test';
import { test } from './fixture-test';
import { scan } from './scan';

for (const locale of ['en-US', 'ar'])
	for (const theme of ['default', 'dark'])
		test.describe(`${locale} ${theme}`, () => {
			test.beforeEach(async ({ page }) => {
				await page.goto(`/?surface=save-lifecycle&locale=${locale}&theme=${theme}`);
				await expect(page.locator('nx-base-editor')).toBeVisible();
			});
			test('upload and save announcements preserve focus and retry draft', async ({
				page,
			}, info) => {
				const editor = page.locator('nx-base-editor');
				const status = editor.getByRole('status');
				const alert = editor.getByRole('alert');
				const save = editor.locator('.modal-footer button').last();
				const title = page.locator('#fixture-save-title');
				const statusNode = await status.elementHandle();
				const alertNode = await alert.elementHandle();
				await expect(status).toHaveAttribute('aria-live', 'polite');
				await expect(status).toHaveAttribute('aria-atomic', 'true');
				await expect(alert).toHaveAttribute('aria-live', 'assertive');
				await expect(alert).toHaveText('');
				await save.focus();
				await page.keyboard.press('Enter');
				await expect(save).toBeFocused();
				await expect(save).toHaveAttribute('aria-disabled', 'true');
				await expect(editor.locator('.modal-body')).toHaveAttribute('aria-busy', 'true');
				// Dispatching fixture responses models a server callback, without a user focus move.
				await page.locator('[data-upload-progress]').dispatchEvent('click');
				await expect(status).toContainText('Customer {file}.txt');
				await expect(save).toBeFocused();
				await scan(page, info, 'editor-uploading');
				await page.locator('[data-upload-fail]').dispatchEvent('click');
				await expect(alert).toContainText(locale === 'ar' ? 'تعذّر رفع الملفات' : 'could not');
				await expect(status).toHaveText('');
				await expect(save).toBeFocused();
				await expect(save).toHaveAttribute('aria-disabled', 'false');
				await expect(editor.locator('.modal-body')).toHaveAttribute('aria-busy', 'false');
				await expect(title).toHaveValue('Customer {title}');
				await scan(page, info, 'editor-upload-error');
				await page.keyboard.press('Enter');
				await page.locator('[data-upload-progress]').dispatchEvent('click');
				await page.locator('[data-upload-complete]').dispatchEvent('click');
				await expect(status).toHaveText(locale === 'ar' ? 'جارٍ حفظ المستند…' : 'Saving document…');
				await expect(status).not.toContainText('Customer {file}.txt');
				await expect(alert).toHaveText('');
				await expect(save).toBeFocused();
				await scan(page, info, 'editor-saving');
				await page.locator('[data-save-fail]').dispatchEvent('click');
				await expect(alert).toContainText('Customer {literal} <text>');
				await expect(alert.locator('text')).toHaveCount(0);
				await expect(title).toHaveValue('Customer {title}');
				await expect(save).toBeFocused();
				await expect(save).toHaveAttribute('aria-disabled', 'false');
				await scan(page, info, 'editor-save-error');
				await page.keyboard.press('Enter');
				await page.locator('[data-upload-complete]').dispatchEvent('click');
				await page.locator('[data-save-complete]').dispatchEvent('click');
				await expect(status).toHaveText(locale === 'ar' ? 'تم حفظ المستند' : 'Document saved');
				await expect(alert).toHaveText('');
				await expect(page.locator('[data-fixture-save-result]')).toHaveText('1');
				await expect(save).toBeFocused();
				await expect(save).toHaveAttribute('aria-disabled', 'true');
				await expect(editor.locator('.modal-body')).toHaveAttribute('aria-busy', 'false');
				expect(await status.evaluate((node, original) => node === original, statusNode)).toBe(true);
				expect(await alert.evaluate((node, original) => node === original, alertNode)).toBe(true);
				await expect(page.locator('.toast-message')).toHaveCount(0);
				await scan(page, info, 'editor-saved');
			});
			test('success announcement survives immediate editor closure', async ({ page }, info) => {
				await page.locator('[data-close-on-success]').check();
				const announcer = page.locator('.cdk-live-announcer-element');
				await expect(announcer).toHaveCount(1);
				await expect(announcer).toHaveText('');
				const original = await announcer.elementHandle();
				await page.locator('nx-base-editor .modal-footer button').last().click();
				await page.locator('[data-upload-complete]').dispatchEvent('click');
				await page.locator('[data-save-complete]').dispatchEvent('click');
				await expect(page.locator('nx-base-editor')).toHaveCount(0);
				await expect(announcer).toHaveText(locale === 'ar' ? 'تم حفظ المستند' : 'Document saved');
				await expect(announcer).toHaveAttribute('aria-live', 'polite');
				expect(await announcer.evaluate((node, previous) => node === previous, original)).toBe(
					true,
				);
				await expect(page.locator('.toast-message')).toHaveCount(0);
				await scan(page, info, 'editor-closed-success');
			});
		});
