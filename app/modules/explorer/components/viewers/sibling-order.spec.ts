import { reorderRowsBySiblings } from './sibling-order';

describe('reorderRowsBySiblings', () => {
	const rows = [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }];

	it('follows the manager order after a move', () => {
		expect(reorderRowsBySiblings(rows, [{ uid: 'a' }, { uid: 'c' }, { uid: 'b' }])).toEqual([
			{ uid: 'a' },
			{ uid: 'c' },
			{ uid: 'b' },
		]);
	});

	it('keeps the same array when nothing moved or the listing is not covered', () => {
		expect(reorderRowsBySiblings(rows, [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }])).toBe(rows);
		expect(reorderRowsBySiblings(rows, [{ uid: 'a' }, { uid: 'b' }])).toBe(rows);
		expect(reorderRowsBySiblings(rows, [])).toBe(rows);
		expect(reorderRowsBySiblings([], [{ uid: 'a' }])).toEqual([]);
	});
});
