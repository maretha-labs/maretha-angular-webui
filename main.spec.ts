import { HashLocationStrategy, LocationStrategy } from '@angular/common';
import { appConfig } from './main';

describe('appConfig', () => {
	it('is importable without bootstrapping outside the application page', () => {
		expect(document.querySelector('nx-root')).toBeNull();
		expect(appConfig.providers).toContain(
			jasmine.objectContaining({ provide: LocationStrategy, useClass: HashLocationStrategy }),
		);
	});
});
