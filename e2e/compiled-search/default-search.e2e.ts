import { expect, Page, test } from '@playwright/test';

const titles = ['Fixture landscape', 'Fixture portrait', 'Fixture document'];
const thumbnail =
	'data:image/svg+xml;charset=utf-8,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#315e72"/><circle cx="190" cy="75" r="40" fill="#e0ad65"/></svg>',
	);

async function interceptDefaultSearch(page: Page) {
	const requests: URL[] = [];
	await page.route('**/nuxeo/api/v1/**', async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname === '/nuxeo/api/v1/search/saved')
			return route.fulfill({ json: { entries: [] } });
		if (url.pathname === '/nuxeo/api/v1/automation/User.GetCollections')
			return route.fulfill({ json: { entries: [] } });
		if (url.pathname.startsWith('/nuxeo/api/v1/user/'))
			return route.fulfill({
				json: {
					id: 'fixture-reader',
					properties: { firstName: 'Fixture', lastName: 'Reader' },
				},
			});
		expect(url.pathname).toBe('/nuxeo/api/v1/search/pp/default_search/execute');
		expect(route.request().method()).toBe('GET');
		requests.push(url);
		const entries = titles.map((title, index) => ({
			uid: `fixture-default-${index}`,
			title,
			type: 'File',
			repository: 'default',
			properties: {
				'dc:title': title,
				'dc:modified': '2026-01-06T10:00:00Z',
				'dc:lastContributor': 'fixture-reader',
			},
			contextParameters: { thumbnail: { url: thumbnail }, permissions: ['Read', 'Write'] },
		}));
		return route.fulfill({
			json: {
				entries,
				resultsCount: entries.length,
				currentPageIndex: 0,
				isNextPageAvailable: false,
				aggregations: {
					dc_modified_agg: {
						type: 'date_range',
						field: 'dc:modified',
						selection: [],
						extendedBuckets: [{ key: 'lastWeek', docCount: entries.length }],
					},
				},
				quickFilters: [],
			},
		});
	});
	return requests;
}

test('default search preserves the stock drawer, header and three result layouts without view refetches', async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error' && message.text().includes('Unexpected network dependency'))
			pageErrors.push(message.text());
	});
	const requests = await interceptDefaultSearch(page);
	await page.goto('/search/default');
	const results = page.locator('nx-default-search-results');
	await expect(results.getByText(titles[0], { exact: true })).toBeVisible();
	expect(requests).toHaveLength(1);
	await page.locator('.nx-sidebar').getByRole('button', { name: 'Search', exact: true }).click();
	const form = page.locator('#nx-sidebar-drawer nx-search form.nx-search-pane');
	await expect(form).toBeVisible();
	await expect(form.locator('.stock-search-heading')).toHaveCSS('height', '53px');
	await expect(form.locator('.stock-search-heading label')).toHaveCSS('font-size', '13px');
	await expect(form.locator('.auto-search-toggle')).toHaveCount(0);
	await expect(form.getByRole('button', { name: 'Switch to Queue View' })).toBeVisible();
	// A pristine form still has a debounce subscription. Let its setup settle before counting
	// drawer requests so a deferred initialization fetch cannot slip past an immediate check.
	await page.waitForTimeout(700);
	expect(requests).toHaveLength(1);

	// Opening the drawer reuses the mounted results host's facets. Full text submits where
	// the user presses Enter; neither opening the drawer nor typing queues another query.
	const fullText = form.locator('#core-fulltext');
	await expect(fullText).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await expect(fullText).toHaveCSS('border-top-width', '0px');
	await expect(fullText).toHaveCSS('border-bottom-style', 'solid');
	for (const field of ['ecm_collections', 'ecm_tags']) {
		const container = form.locator(`ng-select[formControlName="${field}"] .ng-select-container`);
		await expect(container).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
		await expect(container).toHaveCSS('border-top-width', '0px');
		await expect(container).toHaveCSS('border-bottom-width', '1px');
		await expect(container).toHaveCSS('border-radius', '0px');
	}
	await fullText.fill('Fixture');
	await page.waitForTimeout(700);
	expect(requests).toHaveLength(1);
	await fullText.press('Enter');
	await expect.poll(() => requests.length).toBe(2);
	expect(requests[1].searchParams.get('ecm_fulltext')).toBe('Fixture');
	expect(requests[1].searchParams.get('currentPageIndex')).toBe('0');
	expect(requests[1].searchParams.get('pageSize')).toBe('40');

	const header = results.locator('.default-search-results__header');
	const title = header.getByRole('heading', { name: /^Search results$/i });
	const saveAs = header.getByRole('button', { name: 'Save As', exact: true });
	await expect(title).toHaveCSS('font-size', '13px');
	await expect(header).toHaveCSS('height', '53px');
	await expect(saveAs).toBeVisible();
	const [headerBox, titleBox, saveBox] = await Promise.all([
		header.boundingBox(),
		title.boundingBox(),
		saveAs.boundingBox(),
	]);
	expect(
		Math.abs(titleBox!.y + titleBox!.height / 2 - (saveBox!.y + saveBox!.height / 2)),
	).toBeLessThan(1);
	expect(saveBox!.x).toBeGreaterThan(headerBox!.x + headerBox!.width / 2);

	await results.getByRole('button', { name: /Switch to table view/i }).click();
	await expect(results.locator('nx-results-sort-bar')).toHaveCount(0);
	const tableHeader = results.locator('.ag-header');
	await expect(tableHeader).toHaveCSS('height', '51px');
	const firstRow = results.getByRole('row').filter({
		has: page.getByRole('link', { name: titles[0], exact: true }),
	});
	await expect(firstRow).toHaveCSS('height', '52px');
	const titleColumn = results.getByRole('columnheader', { name: 'Title', exact: true });
	await expect.soft(titleColumn).toHaveCSS('font-size', '13px');
	await expect.soft(titleColumn).toHaveCSS('font-weight', '600');
	await expect.soft(titleColumn).toHaveCSS('color', 'rgb(96, 105, 120)');
	const gear = results.getByRole('button', { name: 'Columns Settings', exact: true });
	await expect(gear).toBeVisible();
	const [tableBox, gearBox] = await Promise.all([tableHeader.boundingBox(), gear.boundingBox()]);
	expect(gearBox!.y).toBeGreaterThanOrEqual(tableBox!.y);
	expect(gearBox!.y + gearBox!.height).toBeLessThanOrEqual(tableBox!.y + tableBox!.height);
	const titleLink = results.getByRole('link', { name: titles[0], exact: true });
	await expect.soft(titleLink).toHaveCSS('font-size', '13px');
	await expect.soft(titleLink).toHaveCSS('text-decoration-line', 'none');
	await expect.soft(titleLink).toHaveCSS('color', 'rgb(58, 58, 84)');
	await expect(results.locator('nx-ag-grid-projection-checkbox input').first()).toHaveCSS(
		'width',
		'22px',
	);
	const selectAll = results.getByRole('checkbox', {
		name: 'Select displayed documents',
		exact: true,
	});
	const rowChecks = results.locator('nx-ag-grid-projection-checkbox input');
	await expect(selectAll).toBeVisible();
	const [selectAllBox, rowCheckBox] = await Promise.all([
		selectAll.boundingBox(),
		rowChecks.first().boundingBox(),
	]);
	expect(
		Math.abs(selectAllBox!.x + selectAllBox!.width / 2 - (rowCheckBox!.x + rowCheckBox!.width / 2)),
	).toBeLessThan(1);
	await testInfo.attach('default-search-table', {
		body: await page.screenshot(),
		contentType: 'image/png',
	});
	await rowChecks.first().check();
	await expect(selectAll).toHaveJSProperty('indeterminate', true);
	await expect(results.locator('.default-search-results__selection')).toBeVisible();
	await testInfo.attach('default-search-partial-selection', {
		body: await page.screenshot(),
		contentType: 'image/png',
	});
	await expect(selectAll).toHaveJSProperty('indeterminate', true);
	await selectAll.click();
	await expect(results.locator('nx-ag-grid-projection-checkbox input:checked')).toHaveCount(
		titles.length,
	);
	await expect(selectAll).toBeChecked();
	await expect(selectAll).toHaveJSProperty('indeterminate', false);
	await results.getByRole('button', { name: 'Clear', exact: true }).click();
	await expect(results.locator('nx-ag-grid-projection-checkbox input:checked')).toHaveCount(0);
	expect(requests).toHaveLength(2);
	await gear.focus();
	await gear.press('Enter');
	const chooser = page.getByRole('dialog', { name: 'Columns Settings', exact: true });
	await expect(chooser).toBeVisible();
	await expect(chooser).toHaveCSS('width', '480px');
	await expect(chooser).toHaveCSS('border-width', '0px');
	expect(
		await chooser.evaluate((element) => getComputedStyle(element, '::backdrop').backgroundColor),
	).toBe('rgba(0, 0, 0, 0.6)');
	await expect(chooser.getByRole('heading', { name: 'Columns Settings', exact: true })).toHaveCSS(
		'font-size',
		'20px',
	);
	await expect(chooser.getByRole('heading', { name: 'Columns Settings', exact: true })).toHaveCSS(
		'font-weight',
		'500',
	);
	await expect(chooser.getByRole('heading', { name: 'Columns Settings', exact: true })).toHaveCSS(
		'line-height',
		'28px',
	);
	const options = chooser.locator('.search-column-chooser__options label');
	await expect(options).toHaveCount(12);
	await expect(options.first()).toHaveCSS('font-size', '13px');
	await expect(options.first()).toHaveCSS('font-weight', '600');
	expect((await options.first().boundingBox())!.height).toBeCloseTo(22.453125, 1);
	const columnCheck = chooser.getByRole('checkbox', { name: 'Modified', exact: true });
	await expect(columnCheck).toHaveCSS('width', '18px');
	await expect(columnCheck).toHaveCSS('height', '18px');
	await expect(columnCheck).toHaveCSS('border-width', '2px');
	for (const name of ['Reset', 'Done']) {
		await expect(chooser.getByRole('button', { name, exact: true })).toHaveCSS('width', '96px');
		await expect(chooser.getByRole('button', { name, exact: true })).toHaveCSS('height', '40px');
	}
	expect((await chooser.boundingBox())!.height).toBeCloseTo(421.625, 0);
	await chooser.getByRole('checkbox', { name: 'Modified', exact: true }).uncheck();
	await expect(results.locator('.ag-header-cell[col-id="modified"]')).toHaveCount(0);
	await expect(chooser).toBeVisible();
	await chooser.getByRole('checkbox', { name: /Last contributor/i }).uncheck();
	await expect(results.locator('.ag-header-cell[col-id="lastContributor"]')).toHaveCount(0);
	// The chooser belongs to the search page, so replacing its last visible table header
	// must not destroy it or dismiss it while the user chooses another column.
	await expect(chooser).toBeVisible();
	await chooser.getByRole('button', { name: 'Reset', exact: true }).click();
	await expect(chooser).toBeVisible();
	await expect(chooser.getByRole('checkbox', { name: 'Modified', exact: true })).toBeChecked();
	await expect(chooser.getByRole('checkbox', { name: /Last contributor/i })).toBeChecked();
	await expect(chooser.getByRole('checkbox', { name: 'Type', exact: true })).not.toBeChecked();
	await expect(results.locator('.ag-header-cell[col-id="modified"]')).toBeVisible();
	await expect(results.locator('.ag-header-cell[col-id="lastContributor"]')).toBeVisible();
	await testInfo.attach('default-search-columns', {
		body: await page.screenshot(),
		contentType: 'image/png',
	});
	await chooser.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(chooser).not.toBeVisible();
	await expect(gear).toBeVisible();
	await expect(gear).toBeFocused();
	expect(requests).toHaveLength(2);

	await results.getByRole('button', { name: /Switch to grid view/i }).click();
	await expect(results.locator('nx-document-grid-thumbnail')).toHaveCount(titles.length);
	await expect(results.locator('.nx-grid-thumbnail__title').first()).toHaveCSS('font-size', '13px');
	const gridRow = results.locator('.nx-results-projection__grid-row').first();
	const items = gridRow.locator('nx-document-grid-thumbnail');
	await expect(items).toHaveCount(titles.length);
	const occupiedWidths = await items.evaluateAll((elements) =>
		elements.map((element) => {
			const style = getComputedStyle(element);
			return (
				element.getBoundingClientRect().width +
				parseFloat(style.marginLeft) +
				parseFloat(style.marginRight)
			);
		}),
	);
	for (const width of occupiedWidths) expect(width).toBeCloseTo(234.4, 1);
	const [rowBox, ...itemBoxes] = await Promise.all([
		gridRow.boundingBox(),
		...(await items.all()).map((item) => item.boundingBox()),
	]);
	await testInfo.attach('default-search-grid', {
		body: await page.screenshot(),
		contentType: 'image/png',
	});
	await testInfo.attach('default-search-grid-geometry', {
		body: JSON.stringify({
			rowBox,
			itemBoxes,
			style: await gridRow.evaluate((element) => {
				const style = getComputedStyle(element);
				return {
					display: style.display,
					gap: style.gap,
					columns: style.gridTemplateColumns,
					justifyContent: style.justifyContent,
				};
			}),
		}),
		contentType: 'application/json',
	});
	const physicalRows = new Map<number, typeof itemBoxes>();
	for (const box of itemBoxes) {
		const top = Math.round(box!.y);
		physicalRows.set(top, [...(physicalRows.get(top) ?? []), box]);
	}
	// Stock iron-list centers the row's full capacity, keeping an incomplete row aligned with
	// those slots. It does not recenter just the returned cards (verified with three live rows).
	const trackWidth = occupiedWidths[0];
	const capacity = Math.max(1, Math.floor(rowBox!.width / trackWidth));
	const cardMargin = await items
		.first()
		.evaluate((element) => parseFloat(getComputedStyle(element).marginLeft));
	const firstCardLeft = rowBox!.x + (rowBox!.width - capacity * trackWidth) / 2 + cardMargin;
	expect(titles.length).toBeLessThan(capacity);
	for (const boxes of physicalRows.values()) {
		for (const [column, box] of boxes.entries())
			expect(Math.abs(box!.x - (firstCardLeft + column * trackWidth))).toBeLessThan(1);
	}

	await results.getByRole('button', { name: /Switch to list view/i }).click();
	const cards = results.locator('nx-document-list-item');
	await expect(cards).toHaveCount(titles.length);
	await expect(cards.first().locator('.document-list-item__thumbnail')).toHaveCSS('width', '130px');
	await expect(cards.first().locator('.document-list-item__thumbnail')).toHaveCSS(
		'height',
		'130px',
	);
	await expect(cards.first().locator('.document-list-item__title')).toHaveCSS('font-size', '13px');
	await expect(cards.first().locator('.document-list-item__type')).toHaveText('File');
	await expect(cards.first()).not.toContainText('Modified');
	await testInfo.attach('default-search-list', {
		body: await page.screenshot(),
		contentType: 'image/png',
	});
	// Cross the form's 600ms debounce window to catch accidental queries queued by view changes.
	await page.waitForTimeout(700);
	expect(requests).toHaveLength(2);
	await results.getByRole('button', { name: /Switch to table view/i }).click();
	const titleSort = results
		.getByRole('columnheader', { name: 'Title', exact: true })
		.getByRole('button', { name: 'Title', exact: true });
	await titleSort.focus();
	await titleSort.press('Enter');
	await expect.poll(() => requests.length).toBe(3);
	expect(requests[2].searchParams.get('sortBy')).toBe('dc:title');
	expect(requests[2].searchParams.get('ecm_fulltext')).toBe('Fixture');
	// Enter on a header button must not also bubble into AG Grid's own keyboard sort handler.
	await page.waitForTimeout(700);
	expect(requests).toHaveLength(3);
	expect(pageErrors).toEqual([]);
	await testInfo.attach('default-search-requests', {
		body: JSON.stringify(
			requests.map((url) => ({
				provider: url.pathname,
				parameters: Object.fromEntries(url.searchParams),
			})),
			null,
			2,
		),
		contentType: 'application/json',
	});
});
