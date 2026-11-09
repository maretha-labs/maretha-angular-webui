import {
	AG_GRID_LOCALE_EN,
	AG_GRID_LOCALE_ES,
	AG_GRID_LOCALE_FR,
	AG_GRID_LOCALE_EG,
	AG_GRID_LOCALE_RO,
	AG_GRID_LOCALE_PT,
	AG_GRID_LOCALE_IT,
} from '@ag-grid-community/locale';
import { WebUiMessages } from '../webui-messages';

const GRID_LOCALES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	'en-US': AG_GRID_LOCALE_EN,
	es: AG_GRID_LOCALE_ES,
	fr: AG_GRID_LOCALE_FR,
	ar: AG_GRID_LOCALE_EG,
	ro: AG_GRID_LOCALE_RO,
	'pt-PT': AG_GRID_LOCALE_PT,
	it: AG_GRID_LOCALE_IT,
};

/** AG Grid owns interpolation of its ${...} tokens; use raw catalog values. */
export function gridLocale(messages: WebUiMessages): Record<string, string> {
	const locale = GRID_LOCALES[messages.locale()] ?? GRID_LOCALES['en-US'];
	return Object.fromEntries(
		Object.entries({ ...AG_GRID_LOCALE_EN, ...locale }).map(([key, value]) => [
			key,
			messages.text(`widgets.grid.${key}`, value),
		]),
	);
}
