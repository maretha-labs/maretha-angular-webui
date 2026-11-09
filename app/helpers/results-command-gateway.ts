import { Injectable, Injector, inject } from '@angular/core';
import {
	ResultsCommandGateway,
	ResultsSelectionContext,
	ResultsToolbarContext,
} from '@maretha/webui-sdk';
import { CORE_RESULTS_OPTIONS } from './core-results-options';
import { searchSelectionCommands } from '../modules/search/helpers/search-selection-policy';

@Injectable({ providedIn: 'root' })
export class NativeResultsCommandGateway implements ResultsCommandGateway {
	private readonly injector = inject(Injector);
	private readonly options = inject(CORE_RESULTS_OPTIONS);
	available(context: ResultsSelectionContext): readonly string[] {
		return searchSelectionCommands(
			context.selectedDocuments,
			context.noEdit,
			this.options.bulkEdit,
		);
	}
	execute(
		command: string,
		context: ResultsToolbarContext,
		current: () => boolean,
	): Promise<readonly string[]> {
		// Re-evaluate document permissions at activation, rather than trusting a rendered menu.
		if (!this.available(context).includes(command)) return Promise.resolve([]);
		return import('../modules/search/helpers/search-selection-actions.service').then(
			({ SearchSelectionActions }) =>
				this.injector.get(SearchSelectionActions).execute(command, context, current),
		);
	}
}
