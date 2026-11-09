import { TestBed } from '@angular/core/testing';
import { ROUTES, type Route } from '@angular/router';
import { ApplicationPageComponent } from 'app/components/application-pages/application-page.component';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ExplorerModule } from './explorer.module';

describe('ExplorerModule', () => {
	it('routes every explorer path to the explorer application page', () => {
		TestBed.configureTestingModule({ imports: [ExplorerModule], providers: legacyTestProviders() });
		const routes = (TestBed.inject(ROUTES) as Route[][]).flat();
		expect(routes.map((route) => route.path)).toEqual([
			'',
			'documents',
			'documents/:id',
			'collections',
			'collections/:id',
			'**',
		]);
		for (const route of routes) {
			expect(route.component).toBe(ApplicationPageComponent);
			expect(route.data).toEqual({ pageId: 'explorer' });
		}
	});
});
