import { NgModule } from '@angular/core';

import { SharedModule } from 'app/modules/shared/shared.module';

import { SearchComponent } from './components/search-pane/search-pane.component';
import { DefaultSearchResultsComponent } from './components/default-search-results/default-search-results.component';

@NgModule({
	imports: [SharedModule, SearchComponent, DefaultSearchResultsComponent],
	exports: [SearchComponent, DefaultSearchResultsComponent],
})
export class SearchModule {}
