import { HttpClient } from '@angular/common/http';
import { TranslateLoader } from '@ngx-translate/core';
import { from, Observable } from 'rxjs';
import { loadWebUiCatalog } from './webui-message-catalog';

export class WebpackTranslateLoaderService implements TranslateLoader {
	private readonly moduleName?: string;

	constructor(
		private readonly httpClient: HttpClient,
		moduleName?: string,
	) {
		this.moduleName = moduleName;
	}

	getTranslation(lang: string): Observable<any> {
		// ngx-translate's compiler mutates its input; never expose the shared catalog.
		return from(loadWebUiCatalog(lang).then((catalog) => ({ ...catalog })));
	}
}
