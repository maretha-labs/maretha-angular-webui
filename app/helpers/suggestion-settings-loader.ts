import { HttpBackend, HttpClient } from '@angular/common/http';
import {
	EnvironmentProviders,
	inject,
	makeEnvironmentProviders,
	provideAppInitializer,
} from '@angular/core';
import { SuggestionSettings } from '@maretha/webui-sdk';

/**
 * The build copies custom/suggestions.json unchanged to the same path. Deployed with the web UI,
 * never read from the Nuxeo server. Editable without a rebuild, though on Nuxeo each server start
 * replaces it with the packaged copy.
 */
export const SUGGESTION_SETTINGS_URL = 'custom/suggestions.json';

/**
 * Search-as-you-type limits. The built-in stock values (the file as shipped) apply until the
 * deployed file has been read, once, at startup; nothing waits for it, and a failed read keeps them.
 */
export function provideSuggestionSettings(): EnvironmentProviders {
	return makeEnvironmentProviders([
		provideAppInitializer(() => {
			loadSuggestionSettings(inject(SuggestionSettings), new HttpClient(inject(HttpBackend)));
		}),
	]);
}

/** `http` should skip the interceptors: the file needs no Nuxeo credentials or progress bar. */
export function loadSuggestionSettings(settings: SuggestionSettings, http: HttpClient): void {
	http.get<unknown>(SUGGESTION_SETTINGS_URL).subscribe({
		next: (config) => {
			if (!settings.apply(config))
				console.warn(`${SUGGESTION_SETTINGS_URL} is not a JSON object; using the built-in values.`);
		},
		error: () =>
			console.warn(`${SUGGESTION_SETTINGS_URL} could not be read; using the built-in values.`),
	});
}
