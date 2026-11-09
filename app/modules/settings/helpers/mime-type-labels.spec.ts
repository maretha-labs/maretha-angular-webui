import { mimeTypeLabel } from './mime-type-labels';

describe('MIME label ownership', () => {
	it('localizes known descriptive labels only when a localizer is supplied', () => {
		const localize = jasmine.createSpy('localize').and.returnValue('Texte brut');
		expect(mimeTypeLabel('text/plain')).toBe('Plain Text');
		expect(mimeTypeLabel('text/plain', localize)).toBe('Texte brut');
		expect(localize).toHaveBeenCalledOnceWith('app.settingsShared.plain-text-7b5cb3', 'Plain Text');
		expect(mimeTypeLabel('customer/special', localize)).toBe('customer/special');
		expect(localize).toHaveBeenCalledTimes(1);
	});
});
