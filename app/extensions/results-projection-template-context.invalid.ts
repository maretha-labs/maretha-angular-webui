import { Component } from '@angular/core';
import {
	ResultsProjectionHostTemplateDirective,
	ResultsProjectionTemplateDirective,
} from './results-projection';

@Component({
	standalone: true,
	imports: [ResultsProjectionTemplateDirective, ResultsProjectionHostTemplateDirective],
	template: `
		<ng-template nxResultsTemplate="cell" let-rows="rows">{{ rows.length }}</ng-template>
		<ng-template nxResultsHostTemplate="form" let-row="row">{{ row.uid }}</ng-template>
	`,
})
export class InvalidResultsProjectionTemplateContextFixture {}
