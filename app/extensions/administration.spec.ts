import { ADMINISTRATION_MENU_SLOT, ADMINISTRATION_PAGES_SLOT } from './administration';

describe('Administration slot context', () => {
	const valid = {
		document: null,
		noEdit: false,
		user: { id: 'admin', isAdministrator: true },
		features: { retention: false },
	};

	it('accepts signed-in and signed-out administration contexts on both slots', () => {
		for (const slot of [ADMINISTRATION_MENU_SLOT, ADMINISTRATION_PAGES_SLOT]) {
			expect(slot.isContext(valid)).toBeTrue();
			expect(slot.isContext({ ...valid, user: null })).toBeTrue();
		}
	});

	it('rejects malformed contexts', () => {
		for (const malformed of [
			null,
			'context',
			{ ...valid, noEdit: 'no' },
			{ ...valid, features: undefined },
			{ ...valid, features: { retention: 'yes' } },
			{ ...valid, user: { id: 7, isAdministrator: true } },
			{ ...valid, user: { id: 'admin', isAdministrator: 'yes' } },
		])
			expect(ADMINISTRATION_MENU_SLOT.isContext(malformed)).toBeFalse();
	});
});
