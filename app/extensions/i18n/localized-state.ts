import { inject, linkedSignal, signal, WritableSignal } from '@angular/core';
import { WebUiMessages } from '../webui-messages';
import { formatWebUiMessage, WebUiMessageValues } from './message-format';

/** Carries app-owned text across asynchronous work without freezing its display language. */
export class LocalizedUiError extends Error {
	constructor(
		readonly key: string,
		readonly fallback: string,
		readonly values: WebUiMessageValues = {},
	) {
		super(formatWebUiMessage(fallback, values, 'en-US'));
	}
}

export type LocalizedState<T extends string | null> = WritableSignal<string | T> & {
	setMessage(key: string, fallback: string, values?: WebUiMessageValues): void;
	setError(error: unknown, key: string, fallback: string): void;
};

/** Literal assignments remain literal; only explicitly described messages are translated. */
export function localizedState<T extends string | null>(initial: T): LocalizedState<T> {
	const messages = inject(WebUiMessages);
	const current = signal<string | T | LocalizedUiError>(initial);
	// A real writable signal preserves the public Angular signal contract. Its source
	// retains descriptors privately; public assignments always replace them with literals.
	const text = linkedSignal(() => {
		const value = current();
		return value instanceof LocalizedUiError
			? messages.format(value.key, value.values, value.fallback)
			: value;
	});
	return Object.assign(text, {
		set(value: string | T): void {
			current.set(value);
		},
		update(update: (value: string | T) => string | T): void {
			current.set(update(text()));
		},
		setMessage(key: string, fallback: string, values: WebUiMessageValues = {}): void {
			current.set(new LocalizedUiError(key, fallback, values));
		},
		setError(error: unknown, key: string, fallback: string): void {
			current.set(
				error instanceof LocalizedUiError
					? error
					: error instanceof Error
						? error.message
						: new LocalizedUiError(key, fallback),
			);
		},
	});
}
