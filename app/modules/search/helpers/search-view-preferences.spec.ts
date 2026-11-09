import { readSearchView, writeSearchView } from './search-view-preferences';

describe('Search view preferences', () => {
	const key = 'maretha.search-view:["alice","default","assets"]';
	beforeEach(() => localStorage.clear());
	afterEach(() => localStorage.clear());

	it('reads only valid display modes, boolean column flags and column layouts for the default repository', () => {
		localStorage.setItem(
			key,
			JSON.stringify({
				displayMode: 'grid',
				columns: { title: true, size: 'yes', modified: false },
				columnLayout: [{ id: 'title', width: 200 }, { id: '__select' }, { id: 'title' }],
			}),
		);
		expect(readSearchView('assets', 'alice')).toEqual({
			displayMode: 'grid',
			columns: { title: true, modified: false },
			columnLayout: [{ id: 'title', width: 200 }],
		});
		localStorage.setItem(key, JSON.stringify({ displayMode: 'carousel', columns: ['title'] }));
		expect(readSearchView('assets', 'alice', 'default')).toEqual({
			displayMode: undefined,
			columns: undefined,
			columnLayout: [],
		});
	});
	it('returns nothing for unparsable storage and merges written preferences over the stored ones', () => {
		localStorage.setItem(key, '{not json');
		expect(readSearchView('assets', 'alice')).toEqual({});
		writeSearchView('assets', 'alice', 'default', { displayMode: 'list' });
		writeSearchView('assets', 'alice', 'default', { columns: { title: false } });
		expect(readSearchView('assets', 'alice')).toEqual({
			displayMode: 'list',
			columns: { title: false },
			columnLayout: [],
		});
		expect(readSearchView('assets', 'alice', 'archive')).toEqual({
			displayMode: undefined,
			columns: undefined,
			columnLayout: [],
		});
	});
	it('keeps views usable when storage throws', () => {
		const original = Storage.prototype.setItem;
		spyOn(Storage.prototype, 'setItem').and.throwError('quota');
		expect(() =>
			writeSearchView('assets', 'alice', 'default', { displayMode: 'grid' }),
		).not.toThrow();
		Storage.prototype.setItem = original;
		expect(localStorage.getItem(key)).toBeNull();
	});
});
