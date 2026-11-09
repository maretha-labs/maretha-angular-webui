import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SuggestionSettings } from '@maretha/webui-sdk';
import { loadSuggestionSettings, SUGGESTION_SETTINGS_URL } from './suggestion-settings-loader';

describe('Suggestion settings loader', () => {
	let http: HttpTestingController;
	let settings: SuggestionSettings;
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		http = TestBed.inject(HttpTestingController);
		settings = TestBed.inject(SuggestionSettings);
	});
	afterEach(() => http.verify());

	it('reads the web UI file once and applies it', () => {
		loadSuggestionSettings(settings, TestBed.inject(HttpClient));
		const request = http.expectOne(SUGGESTION_SETTINGS_URL);
		expect(request.request.method).toBe('GET');
		request.flush({ minChars: 4, pauseMs: 0 });
		expect(settings.resolve({ widget: 'user' })).toEqual({ minChars: 4, pauseMs: 0 });
	});

	it('keeps the built-in values when the file is missing or not an object', () => {
		const warn = spyOn(console, 'warn');
		loadSuggestionSettings(settings, TestBed.inject(HttpClient));
		http.expectOne(SUGGESTION_SETTINGS_URL).flush('', { status: 404, statusText: 'Not Found' });
		loadSuggestionSettings(settings, TestBed.inject(HttpClient));
		http.expectOne(SUGGESTION_SETTINGS_URL).flush([3]);
		expect(warn).toHaveBeenCalledTimes(2);
		expect(settings.resolve({ widget: 'user' })).toEqual({ minChars: 3, pauseMs: 300 });
		expect(settings.resolve({ widget: 'tag' }).minChars).toBe(1);
	});
});
