import { LocalizedUiError } from '@maretha/webui-sdk';
import { computed, inject, Signal, signal } from '@angular/core';
import { WebUiMessages, WebUiMessageValues } from '@maretha/webui-sdk';

export interface MessageText {
	readonly key: string;
	readonly fallback: string;
	readonly values: WebUiMessageValues;
}

/** Explicitly identifies application prose; a plain string always remains literal. */
export function messageText(
	key: string,
	fallback: string,
	values: WebUiMessageValues = {},
): MessageText {
	return { key, fallback, values: { ...values } };
}

/** Retains message identity while exposing the existing string-valued component state API. */
type TextState<T> = Signal<T> & {
	set(value: T | MessageText): void;
	update(update: (value: T) => T | MessageText): void;
	asReadonly(): Signal<T>;
};

export function localizedText(initial?: string | MessageText): TextState<string>;
export function localizedText(initial: null): TextState<string | null>;
export function localizedText(initial: undefined, optional: true): TextState<string | undefined>;
export function localizedText(
	initial: string | MessageText | null | undefined = '',
	optional = false,
) {
	const messages = inject(WebUiMessages);
	const current = signal<string | MessageText | null | undefined>(optional ? undefined : initial);
	const text = computed(() => {
		const value = current();
		return value == null || typeof value === 'string'
			? value
			: messages.format(value.key, value.values, value.fallback);
	});
	return Object.assign(text, {
		set(value: string | MessageText | null | undefined): void {
			current.set(value);
		},
		update(
			update: (value: string | null | undefined) => string | MessageText | null | undefined,
		): void {
			current.set(update(text()));
		},
		asReadonly(): Signal<string | null | undefined> {
			return text;
		},
	});
}

/** App-owned transient text stays reactive without interpreting customer values as message keys. */
export function localizedMessage() {
	const messages = inject(WebUiMessages);
	const current = signal<{ key: string; fallback: string; values: WebUiMessageValues } | null>(
		null,
	);
	return {
		text: computed(() => {
			const value = current();
			return value ? messages.format(value.key, value.values, value.fallback) : '';
		}),
		set(key: string, fallback: string, values: WebUiMessageValues = {}): void {
			current.set({ key, fallback, values });
		},
		clear(): void {
			current.set(null);
		},
	};
}

/** Carries application failures through legacy catches; server messages remain literal. */
export function errorMessage(error: Error): string | MessageText {
	return error instanceof LocalizedUiError
		? messageText(error.key, error.fallback, error.values)
		: error.message;
}
