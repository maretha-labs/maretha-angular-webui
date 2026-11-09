import { expect, test as base, type Page, type TestInfo } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { IntlMessageFormat } from 'intl-messageformat';
import { loadProductionCatalogues } from '../../scripts/i18n/catalogue.mjs';
import { restrictToLoopback } from '../local-boundary.mjs';
import { reviewPseudo, type TextException } from './pseudo-audit.mjs';

const production = loadProductionCatalogues(process.cwd()).catalogues;
const localeLabels: Record<string, string> = {
	'en-US': 'English',
	es: 'Español',
	fr: 'Français',
	ar: 'العربية',
	ro: 'Română',
	'pt-PT': 'Português',
	it: 'Italiano',
};
function translated(
	locale: string,
	key: string,
	values: Record<string, string | number> = {},
): string {
	const message = production[locale]?.[key];
	expect(typeof message, locale + ': ' + key + ' must exist in that catalog').toBe('string');
	return String(
		new IntlMessageFormat(message, locale, undefined, { ignoreTag: true }).format(values),
	);
}
const locales = ['en-US', 'es', 'fr', 'ar', 'ro', 'pt-PT', 'it'] as const;
const surfaces = [
	'shell',
	'rail-tooltip',
	'user-menu',
	'quick-search',
	'confirmation',
	'signed-out',
] as const;
const test = base.extend({
	page: async ({ context }, use) => {
		const boundary = await restrictToLoopback(context);
		const page = await context.newPage();
		try {
			await use(page);
		} finally {
			await page.close();
			boundary();
		}
	},
});
async function ready(page: Page, locale: string) {
	await expect(page.locator('#fixture-content')).toHaveAttribute('data-i18n-ready', 'true');
	await expect(page.locator('html')).toHaveAttribute('lang', locale);
	await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
	await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
async function record(page: Page, info: TestInfo, surface: string, pseudo: boolean) {
	const records = await page.evaluate(() => {
		const results: { selector: string; attribute: string; text: string }[] = [];
		const selector = (element: Element): string => {
			for (const stable of [
				'nx-home h2',
				'nx-sidebar .nx-user-menu-header h6',
				'.nx-rail-tooltip .tooltip-inner',
				'nx-quick-search .details .label',
				'nx-quick-search .details small',
			])
				if (element.matches(stable)) return stable;
			if (element.matches('nx-user-menu-language button'))
				return (
					'nx-user-menu-language button:nth-of-type(' +
					(Array.from(element.parentElement!.querySelectorAll('button')).indexOf(
						element as HTMLButtonElement,
					) +
						1) +
					')'
				);
			if (element.id) return '#' + element.id;
			const segments: string[] = [];
			for (
				let item: Element | null = element;
				item && item !== document.body;
				item = item.parentElement
			) {
				if (item.id) {
					segments.unshift('#' + item.id);
					break;
				}
				const siblings = item.parentElement
					? Array.from(item.parentElement.children).filter((x) => x.tagName === item!.tagName)
					: [];
				segments.unshift(
					item.tagName.toLowerCase() +
						(siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(item) + 1})` : ''),
				);
			}
			return segments.join(' > ');
		};
		const visible = (element: Element) => {
			if (element.closest('script,style,mat-icon')) return false;
			// Rail labels stay visually readable while their separate CDK message describes the button.
			if (element.closest('[aria-hidden="true"]') && !element.closest('.nx-rail-tooltip'))
				return false;
			const style = getComputedStyle(element);
			return (
				style.display !== 'none' &&
				style.visibility !== 'hidden' &&
				element.getBoundingClientRect().width > 0 &&
				element.getBoundingClientRect().height > 0
			);
		};
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		while (walker.nextNode()) {
			const node = walker.currentNode;
			const parent = node.parentElement;
			if (parent && visible(parent) && node.textContent?.trim())
				results.push({
					selector: selector(parent),
					attribute: 'text',
					text: node.textContent.trim(),
				});
		}
		for (const element of document.body.querySelectorAll('*'))
			if (visible(element))
				for (const name of ['aria-label', 'aria-description', 'placeholder', 'title', 'alt']) {
					const text = element.getAttribute(name);
					if (text?.trim()) results.push({ selector: selector(element), attribute: name, text });
				}
		return results;
	});
	const exceptions: TextException[] = [
		{ selector: 'nx-home h2', attribute: 'text', text: 'Save.customer.literal Name', maximum: 1 },
		{
			selector: 'nx-sidebar .nx-user-menu-header h6',
			attribute: 'text',
			text: 'Save.customer.literal Name',
			maximum: 1,
		},
		{
			selector: '.nx-rail-tooltip .tooltip-inner',
			attribute: 'text',
			text: 'Save.customer.literal Name',
			maximum: 1,
		},
		{
			selector: 'nx-quick-search .details .label',
			attribute: 'text',
			text: 'Save.customer.literal',
			maximum: 1,
		},
		{
			selector: 'nx-quick-search .details small',
			attribute: 'text',
			text: '/browse/documents/fixture-document',
			maximum: 1,
		},
		...Object.values(localeLabels).map((text, index) => ({
			selector: `nx-user-menu-language button:nth-of-type(${index + 1})`,
			attribute: 'text',
			text,
			maximum: 1,
		})),
	];
	const failures = pseudo ? reviewPseudo(records, exceptions) : [];
	const out = path.resolve(
		'dist/verification/i18n/browser',
		info.title.replace(/[^a-z0-9_-]+/gi, '_'),
	);
	fs.mkdirSync(out, { recursive: true });
	fs.writeFileSync(
		path.join(out, surface + '.json'),
		JSON.stringify({ surface, pseudo, url: page.url(), records, exceptions, failures }, null, 2),
	);
	await page.screenshot({ path: path.join(out, surface + '.png'), fullPage: true });
	expect(failures, `${surface}: pseudo audit must retain mixed unlocalized text`).toEqual([]);
	expect(records.length).toBeGreaterThan(0);
}
for (const locale of locales)
	for (const theme of ['default', 'dark'])
		test(`${locale} ${theme} production catalog surfaces`, async ({ page }, info) => {
			const visited: string[] = [];
			await page.goto(`/?locale=${locale}&theme=${theme}`);
			await ready(page, locale);
			await expect(page.locator('nx-home h2')).toHaveText(
				translated(locale, 'app.components.home.welcome', { name: 'Save.customer.literal Name' }),
			);
			await expect(page.locator('nx-quick-search > button')).not.toHaveAttribute(
				'aria-label',
				'pickerSearch.title',
			);
			await page.locator('#customer-draft').fill('My unsaved customer text');
			await record(page, info, 'shell', false);
			visited.push('shell');
			const browse = page.locator('nx-drawer-item > button').first();
			const railTooltip = page.locator('.nx-rail-tooltip[role="tooltip"]');
			await browse.hover();
			await expect(railTooltip).toHaveText(translated(locale, 'app.browse'));
			await expect(railTooltip).toHaveCSS('opacity', '0.9');
			await expect(browse).not.toHaveAttribute('title');
			await record(page, info, 'rail-tooltip', false);
			visited.push('rail-tooltip');
			const userMenu = page.locator('nx-sidebar [data-maretha-navigation-action="account"]');
			await userMenu.hover();
			await expect(railTooltip).toHaveCount(1);
			await expect(railTooltip).toHaveText('Save.customer.literal Name');
			await expect(userMenu).toHaveAccessibleDescription('Save.customer.literal Name');
			await userMenu.click();
			await expect(railTooltip).toHaveCount(0);
			await expect(page.locator('nx-user-menu-language')).toBeVisible();
			await page
				.locator('nx-user-menu-language')
				.getByRole('button', { name: localeLabels[locale === 'ar' ? 'fr' : 'ar'], exact: true })
				.click();
			await ready(page, locale === 'ar' ? 'fr' : 'ar');
			await expect(page.locator('#customer-draft')).toHaveValue('My unsaved customer text');
			await browse.hover();
			await expect(railTooltip).toHaveText(translated(locale === 'ar' ? 'fr' : 'ar', 'app.browse'));
			await page
				.locator('nx-user-menu-language')
				.getByRole('button', { name: localeLabels[locale], exact: true })
				.click();
			await ready(page, locale);
			await expect(railTooltip).toHaveCount(0);
			await record(page, info, 'user-menu', false);
			visited.push('user-menu');
			await page.keyboard.press('Escape');
			await expect(page.locator('#customer-draft')).toHaveValue('My unsaved customer text');
			await page.locator('nx-quick-search > button').click();
			await page.locator('nx-quick-search input').fill('customer');
			await expect(page.locator('nx-quick-search [role="option"]')).toContainText(
				'Save.customer.literal',
			);
			await record(page, info, 'quick-search', false);
			visited.push('quick-search');
			await page.locator('nx-quick-search button.close').click();
			await expect(page.locator('nx-quick-search dialog')).toHaveCount(0);
			await page.locator('[data-confirm-trigger]').click();
			await expect(page.locator('modal-container')).toHaveCSS('opacity', '1');
			await expect(page.locator('modal-container .modal-dialog')).toHaveCSS('transform', 'none');
			await record(page, info, 'confirmation', false);
			visited.push('confirmation');
			await page.keyboard.press('Escape');
			await page.goto(`/?locale=${locale}&theme=${theme}&surface=signed-out`);
			await ready(page, locale);
			// The stock nuxeo-error page at 403.
			await expect(page.locator('nx-unauthorized h1')).toHaveText(translated(locale, 'error.403'));
			await record(page, info, 'signed-out', false);
			visited.push('signed-out');
			expect(visited).toEqual(surfaces);
		});
for (const theme of ['default', 'dark'])
	test(`pseudo ${theme} complete visible text`, async ({ page }, info) => {
		await page.goto(`/?locale=en-US&theme=${theme}&pseudo=true`);
		await ready(page, 'en-US');
		await expect(page.locator('nx-home h2')).toContainText('⟦');
		await record(page, info, 'shell', true);
		const browse = page.locator('nx-drawer-item > button').first();
		const railTooltip = page.locator('.nx-rail-tooltip[role="tooltip"]');
		await browse.hover();
		await expect(railTooltip).toContainText('⟦');
		await expect(railTooltip).toHaveCSS('opacity', '0.9');
		await record(page, info, 'rail-tooltip', true);
		const userMenu = page.locator('nx-sidebar [data-maretha-navigation-action="account"]');
		await userMenu.hover();
		await expect(railTooltip).toHaveText('Save.customer.literal Name');
		await expect(userMenu).toHaveAccessibleDescription('Save.customer.literal Name');
		await record(page, info, 'account-tooltip', true);
		await userMenu.click();
		await expect(railTooltip).toHaveCount(0);
		await record(page, info, 'user-menu', true);
		await page.keyboard.press('Escape');
		await page.locator('nx-quick-search > button').click();
		await page.locator('nx-quick-search input').fill('customer');
		await expect(page.locator('nx-quick-search [role="option"]')).toContainText(
			'Save.customer.literal',
		);
		await record(page, info, 'quick-search', true);
		await page.locator('nx-quick-search button.close').click();
		await expect(page.locator('nx-quick-search dialog')).toHaveCount(0);
		await page.locator('[data-confirm-trigger]').click();
		await expect(page.locator('modal-container')).toHaveCSS('opacity', '1');
		await expect(page.locator('modal-container .modal-dialog')).toHaveCSS('transform', 'none');
		await record(page, info, 'confirmation', true);
		await page.keyboard.press('Escape');
		await page.goto(`/?locale=en-US&theme=${theme}&pseudo=true&surface=signed-out`);
		await ready(page, 'en-US');
		await record(page, info, 'signed-out', true);
	});
