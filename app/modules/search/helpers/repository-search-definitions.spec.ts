import { defineSearch, indexSearches, REPOSITORY_SEARCH } from './repository-search-definitions';

describe('Compiled repository search definitions', () => {
	const base = REPOSITORY_SEARCH.trash;

	it('requires the default mode to be declared', () => {
		const invalid = defineSearch({
			...base,
			views: { grid: {} },
			// @ts-expect-error Only grid is available in this search.
			defaultMode: 'table',
		});
		expect(() => indexSearches([invalid])).toThrowError(/default mode table/);
		expect(() => indexSearches([{ ...base, views: {} }])).toThrowError(/default mode list/);
	});

	it('rejects invalid page sizes before registering navigation', () => {
		for (const pageSize of [0, -1, 2.5, NaN])
			expect(() =>
				indexSearches([{ ...base, request: { ...base.request, pageSize } }]),
			).toThrowError(/positive integer page size/);
	});

	it('rejects colliding search and column IDs and a table with no columns', () => {
		expect(() => indexSearches([base, base])).toThrowError(/duplicate search ID: trash/);
		const column = { id: 'title', label: 'Title' };
		const tableSearch = (columns: readonly (typeof column)[]) =>
			defineSearch({ ...base, views: { table: { columns } }, defaultMode: 'table' });
		expect(() => indexSearches([tableSearch([])])).toThrowError(/must declare a column/);
		expect(() => indexSearches([tableSearch([column, column])])).toThrowError(
			/duplicate column ID in trash: title/,
		);
	});
});
