import type { ResultsColumnLayout, ResultsProjectionMode } from '@maretha/webui-sdk';
import { readResultColumnLayout } from '../../explorer/helpers/scoped-result-columns';

interface SearchViewPreferences {
	displayMode?: ResultsProjectionMode;
	columns?: Record<string, boolean>;
	columnLayout?: readonly ResultsColumnLayout[];
}

/** Search-only preferences keep protected document hosts on their existing settings path. */
export function readSearchView(
	name: string,
	user: string,
	repository = 'default',
): SearchViewPreferences {
	try {
		const value = JSON.parse(localStorage.getItem(searchViewKey(name, user, repository)) ?? '{}');
		const columns =
			value?.columns && typeof value.columns === 'object' && !Array.isArray(value.columns)
				? (Object.fromEntries(
						Object.entries(value.columns).filter(([, visible]) => typeof visible === 'boolean'),
					) as Record<string, boolean>)
				: undefined;
		return {
			displayMode: ['table', 'grid', 'list'].includes(value?.displayMode)
				? value.displayMode
				: undefined,
			columns,
			columnLayout: readResultColumnLayout(value?.columnLayout),
		};
	} catch {
		return {};
	}
}

export function writeSearchView(
	name: string,
	user: string,
	repository: string,
	preferences: SearchViewPreferences,
): void {
	try {
		localStorage.setItem(
			searchViewKey(name, user, repository),
			JSON.stringify({
				...readSearchView(name, user, repository),
				...preferences,
			}),
		);
	} catch {
		// Views remain usable when browser storage is unavailable.
	}
}

function searchViewKey(name: string, user: string, repository: string): string {
	return `maretha.search-view:${JSON.stringify([user, repository, name])}`;
}
