import { HttpClient } from '@angular/common/http';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';

import { WebpackTranslateLoaderService } from './webpack-translate-loader.service';
import { firstValueFrom } from 'rxjs';
import { mergeWebUiCatalog } from './webui-message-catalog';
import { SUPPORTED_WEB_UI_LOCALES } from '../extensions/i18n/webui-locale';

describe('WebpackTranslateLoaderService', () => {
	let service: WebpackTranslateLoaderService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{
					provide: WebpackTranslateLoaderService,
					useFactory: (http: HttpClient) => new WebpackTranslateLoaderService(http),
					deps: [HttpClient],
				},
			],
		});
		service = TestBed.inject(WebpackTranslateLoaderService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
	it('loads the static catalog for every supported locale and rejects arbitrary import paths', async () => {
		for (const { key } of SUPPORTED_WEB_UI_LOCALES) {
			const catalog = await firstValueFrom(service.getTranslation(key));
			expect(Object.keys(catalog).length).toBeGreaterThan(0);
			expect(Object.values(catalog).every((value) => typeof value === 'string')).toBeTrue();
		}
		await expectAsync(firstValueFrom(service.getTranslation('../en-US'))).toBeRejected();
	});
	it('keeps cached catalogs immutable when the legacy compiler mutates its copy', async () => {
		const first = await firstValueFrom(service.getTranslation('en-US'));
		const value = first['browser.history'];
		first['browser.history'] = () => 'mutation';
		const second = await firstValueFrom(service.getTranslation('en-US'));
		expect(second['browser.history']).toBe(value);
	});
	it('flattens legacy keys over imported keys and rejects malformed catalog structure', () => {
		expect({
			...mergeWebUiCatalog(
				{ 'workflow.name': 'Imported', other: 'Kept' },
				{ workflow: { name: 'App' } },
			),
		}).toEqual({ 'workflow.name': 'App', other: 'Kept' });
		for (const invalid of [null, [], { key: 17 }, JSON.parse('{"__proto__":"unsafe"}')])
			expect(() => mergeWebUiCatalog({}, invalid)).toThrow();
	});
});
