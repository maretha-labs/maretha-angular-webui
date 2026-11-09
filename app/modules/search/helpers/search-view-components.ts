import type { ResultsProjectionComponents, ResultsProjectionMode } from '@maretha/webui-sdk';
import type { CompiledSearchDefinition } from './repository-search-definitions';

/** Only the active view contributes loaders, so opening a search does not load its other views. */
export function searchViewComponents(
	definition: CompiledSearchDefinition,
	mode: ResultsProjectionMode,
): ResultsProjectionComponents {
	if (mode === 'table')
		return Object.fromEntries(
			Object.entries(definition.views.table?.cells ?? {}).map(([id, loader]) => [
				`cell:${id}`,
				loader,
			]),
		);
	const loader = definition.views[mode]?.loadComponent;
	return loader ? { item: loader } : {};
}
