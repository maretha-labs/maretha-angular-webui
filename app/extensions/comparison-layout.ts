import { InjectionToken, Provider, Type } from '@angular/core';

export type ComparisonValueKind =
	| 'default'
	| 'blob'
	| 'date'
	| 'directoryEntry'
	| 'directoryEntry[]'
	| 'document'
	| 'document[]'
	| 'user'
	| 'user[]';

export interface ComparisonValueContext {
	readonly property: string;
	readonly label: string;
	readonly kind: ComparisonValueKind;
	readonly value: unknown;
	readonly baseline: unknown;
	readonly changed: boolean;
	readonly missing: boolean;
	readonly document: Readonly<Record<string, unknown>>;
}

export interface ComparisonLayout {
	readonly id: string;
	readonly component: Type<unknown>;
	readonly property?: string;
	readonly type?: ComparisonValueKind;
}

export const COMPARISON_LAYOUTS = new InjectionToken<readonly ComparisonLayout[]>(
	'Comparison layouts',
);

export function provideComparisonLayout(layout: ComparisonLayout): Provider {
	if (!layout.property && !layout.type)
		throw new Error('A comparison layout must target a property or value type.');
	return { provide: COMPARISON_LAYOUTS, multi: true, useValue: layout };
}

export function resolveComparisonLayout(
	layouts: readonly ComparisonLayout[],
	property: string,
	kind: ComparisonValueKind,
): ComparisonLayout | undefined {
	return (
		[...layouts].reverse().find((layout) => layout.property === property) ||
		[...layouts].reverse().find((layout) => layout.type === kind)
	);
}
