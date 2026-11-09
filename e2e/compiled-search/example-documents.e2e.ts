import { expect, Page, test } from '@playwright/test';

const examplePath = '/page/example-documents';
const term = 'Budget & forecast';
const expectedTitle = 'Budget & forecast workbook';

async function interceptSearch(page: Page) {
	const requests: URL[] = [];
	await page.route('**/nuxeo/api/v1/search/**', async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname === '/nuxeo/api/v1/search/saved')
			return route.fulfill({ json: { entries: [] } });
		const trash = url.pathname === '/nuxeo/api/v1/search/pp/default_trash_search/execute';
		if (!trash) {
			expect(url.pathname).toBe('/nuxeo/api/v1/search/pp/default_search/execute');
			expect(route.request().method()).toBe('GET');
			requests.push(url);
		}
		const titles = trash ? ['Trashed file'] : [expectedTitle, 'Other document'];
		const text = url.searchParams.get('ecm_fulltext') ?? '';
		const entries = titles
			.filter((title) => title.includes(text))
			.map((title) => ({
				uid: title === expectedTitle ? 'budget' : 'other',
				title,
				type: 'File',
				repository: 'default',
				properties: { 'dc:title': title, 'dc:modified': '2026-01-06T10:00:00Z' },
			}));
		return route.fulfill({
			json: { entries, resultsCount: entries.length, isNextPageAvailable: false },
		});
	});
	return requests;
}

test('Trash keeps stock list cards and stable view controls without refetching', async ({
	page,
}, testInfo) => {
	const trashRequests: string[] = [];
	page.on('request', (request) => {
		if (request.url().includes('/search/pp/default_trash_search/execute')) {
			trashRequests.push(request.url());
		}
	});
	await interceptSearch(page);
	await page.goto('/page/trash');
	await expect(page.getByText('Trashed file', { exact: true })).toBeVisible();
	const buttons = ['Grid', 'Table', 'List'].map((mode) =>
		page.getByRole('button', { name: `Switch to ${mode} View` }),
	);
	const bounds = await Promise.all(buttons.map((button) => button.boundingBox()));
	expect(bounds.every((box) => box !== null && box.width > 0 && box.height > 0)).toBe(true);
	for (const box of bounds.slice(1)) {
		expect(box!.width).toBeCloseTo(bounds[0]!.width);
		expect(box!.height).toBeCloseTo(bounds[0]!.height);
		expect(box!.y).toBeCloseTo(bounds[0]!.y);
	}
	const card = page.locator('nx-document-list-item');
	await expect(card).toBeVisible();
	await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
	await expect(card.locator('.document-list-item__title')).toHaveCSS('font-size', '13px');
	await expect(card.locator('.document-list-item__type')).toHaveText('File');
	await expect(card.locator('.document-list-item__thumbnail')).toHaveCSS('width', '130px');
	await expect(card.locator('.document-list-item__thumbnail')).toHaveCSS('height', '130px');
	const controls = [...buttons, page.locator('.result-controls nx-webui-slot button')];
	const listBounds = await Promise.all(controls.map((button) => button.boundingBox()));
	await testInfo.attach('trash-list', { body: await page.screenshot(), contentType: 'image/png' });
	await buttons[1].click();
	await expect(page.getByRole('button', { name: 'Columns Settings', exact: true })).toBeVisible();
	const tableBounds = await Promise.all(controls.map((button) => button.boundingBox()));
	for (const [index, box] of tableBounds.entries()) {
		expect(box).not.toBeNull();
		expect(box!.x).toBeCloseTo(listBounds[index]!.x);
		expect(box!.y).toBeCloseTo(listBounds[index]!.y);
	}
	await testInfo.attach('trash-table', { body: await page.screenshot(), contentType: 'image/png' });
	await buttons[0].click();
	const gridBounds = await Promise.all(controls.map((button) => button.boundingBox()));
	for (const [index, box] of gridBounds.entries()) {
		expect(box!.x).toBeCloseTo(listBounds[index]!.x);
		expect(box!.y).toBeCloseTo(listBounds[index]!.y);
	}
	await buttons[2].click();
	await card.getByRole('checkbox', { name: 'Select Trashed file' }).check();
	await expect(card).toHaveClass(/document-list-item--selected/);
	await expect(page.locator('.stock-selection')).toBeVisible();
	expect(trashRequests).toHaveLength(1);
	await page.getByRole('button', { name: 'Trash', exact: true }).click();
	// Stock 13px scale applies to the footer as well as the field labels.
	const form = page.locator('nx-repository-search-drawer form');
	await expect(form.locator('.asset-filter-actions .buttons button').first()).toHaveCSS(
		'font-size',
		'13px',
	);
	await expect(form.locator('.asset-filter-fields > label').first()).toHaveCSS('font-size', '13px');
	await expect(form.locator('.asset-facet').first()).toHaveCSS('margin-top', '24px');
});

test('the stock Assets tile retains its aspect ratio and frame when selected without refetching', async ({
	page,
}) => {
	let requests = 0;
	await page.route('**/nuxeo/api/v1/search/**', async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname.endsWith('/saved')) return route.fulfill({ json: { entries: [] } });
		expect(url.pathname).toBe('/nuxeo/api/v1/search/pp/assets_search/execute');
		requests++;
		return route.fulfill({
			json: {
				entries: [
					{
						uid: 'landscape',
						title: 'Landscape',
						type: 'Picture',
						repository: 'default',
						properties: { 'picture:info': { width: 1200, height: 600 } },
					},
				],
				resultsCount: 1,
				isNextPageAvailable: false,
			},
		});
	});
	await page.goto('/page/assets');
	const tile = page.locator('nx-assets-search-tile');
	await expect(tile).toBeVisible();
	const shadow = await tile.evaluate((element) => getComputedStyle(element).boxShadow);
	await expect
		.poll(async () => {
			const box = (await tile.boundingBox())!;
			return Math.round((box.width / (box.height - 4)) * 100);
		})
		.toBe(200);
	await tile.getByRole('checkbox', { name: 'Select Landscape' }).check();
	await expect(tile).toHaveClass(/result-item--selected/);
	await expect(tile).toHaveCSS('box-shadow', shadow);
	await expect(page.locator('.stock-selection')).toBeVisible();
	expect(requests).toBe(1);
});

test('the paired drawer submits full text and switches the returned rows between list and table', async ({
	page,
}) => {
	const requests = await interceptSearch(page);
	await page.goto('/page/trash');
	await expect(page.getByText('Trashed file', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Switch to Grid View' }).click();
	await page.getByRole('button', { name: 'Example documents' }).click();
	const form = page.locator('nx-repository-search-drawer form');
	await expect(form.locator('.asset-filters-title')).toHaveCSS('font-size', '13px');
	await expect(form.locator('.asset-filter-fields > label').first()).toHaveCSS('font-size', '13px');
	await form.getByRole('searchbox', { name: 'Full Text' }).fill(term);
	expect(requests).toHaveLength(0);
	await form.getByRole('button', { name: 'Search', exact: true }).click();

	await expect(page).toHaveURL(
		(url) => url.pathname === examplePath && url.searchParams.get('q') === term,
	);
	const results = page.locator('nx-results-projection');
	await expect(results.getByRole('listitem')).toHaveCount(1);
	await expect(results.getByRole('link', { name: expectedTitle })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Switch to List View' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Switch to Grid View' })).toBeEnabled();
	await expect(page.getByTestId('example-custom-card')).toBeVisible();
	await expect(page.getByTestId('example-custom-form')).toBeVisible();
	await page.getByRole('button', { name: 'Switch to Grid View' }).click();
	await expect(page.getByTestId('example-custom-card')).toBeVisible();
	await expect(page.locator('nx-repository-search')).toHaveClass(/nx-search--example-documents/);
	expect(requests).toHaveLength(1);
	expect(requests[0].searchParams.get('ecm_fulltext')).toBe(term);
	expect(requests[0].searchParams.get('currentPageIndex')).toBe('0');
	expect(requests[0].searchParams.get('pageSize')).toBe('40');

	await page.getByRole('button', { name: 'Switch to Table View' }).click();
	await expect(results.getByRole('gridcell', { name: expectedTitle, exact: true })).toBeVisible();
	await expect(results.getByRole('columnheader', { name: 'Modified' })).toBeVisible();
	await expect(page.getByTestId('example-custom-cell')).toBeVisible();
	expect(requests).toHaveLength(1);
	const preference = await page.evaluate(() =>
		localStorage.getItem('maretha.search-view:["fixture-reader","default","example-documents"]'),
	);
	expect(JSON.parse(preference ?? '{}').displayMode).toBe('table');

	await page.reload();
	await expect(page.getByRole('button', { name: 'Switch to Table View' })).toBeDisabled();
	await expect(results.getByRole('gridcell', { name: expectedTitle, exact: true })).toHaveCount(0);
	if (!(await form.isVisible()))
		await page.getByRole('button', { name: 'Example documents' }).click();
	await expect(form.getByRole('searchbox', { name: 'Full Text' })).toHaveValue(term);
	expect(requests).toHaveLength(1);
	await form.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(results.getByRole('gridcell', { name: expectedTitle, exact: true })).toBeVisible();
	expect(requests).toHaveLength(2);
	await page.goto('/page/trash');
	await expect(page.getByRole('button', { name: 'Switch to Grid View' })).toBeDisabled();
});

test('a fresh deep link stages its criteria until Search and unchanged Search requests once', async ({
	page,
}) => {
	const requests = await interceptSearch(page);
	await page.addInitScript(() => {
		for (const [user, repository] of [
			['other-reader', 'default'],
			['fixture-reader', 'other-repository'],
		]) {
			const key = 'maretha.search-view:' + JSON.stringify([user, repository, 'example-documents']);
			localStorage.setItem(key, JSON.stringify({ displayMode: 'table' }));
		}
	});
	await page.goto(examplePath + '?q=' + encodeURIComponent(term));
	const result = page.locator('nx-results-projection').getByRole('link', { name: expectedTitle });
	await expect(page.getByRole('button', { name: 'Switch to List View' })).toBeDisabled();
	await page.getByRole('button', { name: 'Example documents' }).click();
	const form = page.locator('nx-repository-search-drawer form');
	await expect(form.getByRole('searchbox', { name: 'Full Text' })).toHaveValue(term);
	await expect(result).toHaveCount(0);
	expect(requests).toHaveLength(0);
	await form.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(result).toBeVisible();
	expect(requests.map((url) => url.searchParams.get('ecm_fulltext'))).toEqual([term]);
	await form.getByRole('button', { name: 'Search', exact: true }).click();
	await expect.poll(() => requests.length).toBe(2);
	await expect(result).toBeVisible();
	expect(requests.map((url) => url.searchParams.get('ecm_fulltext'))).toEqual([term, term]);
});

test('sorting the applied query leaves an unsubmitted drawer draft alone', async ({ page }) => {
	const requests = await interceptSearch(page);
	await page.goto(examplePath + '?q=' + encodeURIComponent(term));
	const results = page.locator('nx-results-projection');
	await page.getByRole('button', { name: 'Example documents' }).click();
	const form = page.locator('nx-repository-search-drawer form');
	const field = form.getByRole('searchbox', { name: 'Full Text' });
	await expect(field).toHaveValue(term);
	expect(requests).toHaveLength(0);
	await form.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(results.getByRole('link', { name: expectedTitle })).toBeVisible();
	expect(requests).toHaveLength(1);
	await field.fill('Other');
	await page.getByRole('button', { name: 'Switch to Table View' }).click();
	await results.getByRole('columnheader', { name: 'Title', exact: true }).click();
	await expect.poll(() => requests.at(-1)?.searchParams.get('sortBy')).toBe('dc:title');
	expect(requests.at(-1)?.searchParams.get('ecm_fulltext')).toBe(term);
	await expect(results.getByRole('gridcell', { name: expectedTitle, exact: true })).toBeVisible();
	await expect(field).toHaveValue('Other');
	expect(requests).toHaveLength(2);
	await form.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(
		results.getByRole('gridcell', { name: 'Other document', exact: true }),
	).toBeVisible();
	expect(requests.at(-1)?.searchParams.get('ecm_fulltext')).toBe('Other');
	expect(requests).toHaveLength(3);
});
