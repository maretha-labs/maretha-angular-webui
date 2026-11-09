import { IntlMessageFormat } from 'intl-messageformat';

export type WebUiMessageValues = Readonly<
	Record<string, string | number | boolean | Date | null | undefined>
>;
const formats = new Map<string, IntlMessageFormat>();

/** ICU text only: tag-like content stays literal and values are never reparsed as messages. */
export function formatWebUiMessage(
	message: string,
	values: WebUiMessageValues,
	locale: string,
): string {
	const key = JSON.stringify([locale, message]);
	let format = formats.get(key);
	if (!format) {
		format = new IntlMessageFormat(message, locale, undefined, { ignoreTag: true });
		if (formats.size >= 500) formats.delete(formats.keys().next().value!);
		formats.set(key, format);
	}
	const result = format.format({ ...values });
	return Array.isArray(result) ? result.join('') : String(result);
}
