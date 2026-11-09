import { inject, Injectable, InjectionToken, Provider, Type } from '@angular/core';
import { BulkUpdateMode } from './primitives/projection-primitives';
import deepEqual from 'fast-deep-equal';

export type { BulkUpdateMode } from './primitives/projection-primitives';
export interface BulkFieldChange {
	readonly property: string;
	readonly mode: BulkUpdateMode;
	readonly value?: unknown;
	readonly required?: boolean;
}
const bulkValidationMessages = {
	'unsupported-mode': 'Unsupported bulk mode: {mode}',
	'clear-required': 'Cannot clear required property: {property}',
	'add-scalar': 'Cannot add values to scalar property: {property}',
	'add-values-list': 'Use a list value for addValues: {property}',
} as const;

/** Stable validation identity for consumers that display failures in the active language. */
export class BulkValidationError extends Error {
	readonly parameters: Readonly<Record<string, string>>;
	readonly messageKey: string;
	readonly fallback: string;
	constructor(
		readonly code: keyof typeof bulkValidationMessages,
		parameters: Readonly<Record<string, string>>,
	) {
		const fallback = bulkValidationMessages[code];
		super(fallback.replace(/\{(\w+)\}/g, (match, name: string) => parameters[name] ?? match));
		this.parameters = Object.freeze({ ...parameters });
		this.fallback = fallback;
		this.messageKey = `sdk.bulk.validation.${code}`;
	}
}
export interface BulkLayoutContext {
	readonly documents: readonly Readonly<Record<string, unknown>>[];
	readonly changes: readonly BulkFieldChange[];
	readonly commit: (changes: readonly BulkFieldChange[]) => void;
}
export interface BulkLayoutComponent {
	context: BulkLayoutContext;
}
export interface BulkLayoutRegistration {
	readonly name: string;
	readonly component: Type<BulkLayoutComponent>;
}
/** Multi providers are injected as an array of registrations, not an array of arrays. */
export const BULK_LAYOUTS = new InjectionToken<readonly BulkLayoutRegistration[]>('BULK_LAYOUTS');
export function provideBulkLayouts(...layouts: BulkLayoutRegistration[]): Provider[] {
	return layouts.map((layout) => ({ provide: BULK_LAYOUTS, multi: true, useValue: layout }));
}

/** Resolves a layout by name from an immutable provider snapshot. */
@Injectable({ providedIn: 'root' })
export class BulkLayoutResolver {
	private readonly layouts = [...(inject(BULK_LAYOUTS, { optional: true }) ?? [])];
	resolve(name = 'default'): BulkLayoutRegistration | undefined {
		return [...this.layouts].reverse().find((layout) => layout.name === name);
	}
}

export function buildBulkDocumentChanges(
	documents: readonly Readonly<Record<string, any>>[],
	changes: readonly BulkFieldChange[],
) {
	return documents.map((document) => {
		const properties: Record<string, unknown> = {};
		for (const change of changes) {
			if (!['keep', 'replace', 'addValues', 'remove'].includes(change.mode))
				throw new BulkValidationError('unsupported-mode', { mode: change.mode });
			if (change.mode === 'keep') continue;
			const current = document['properties']?.[change.property];
			if (change.mode === 'replace') properties[change.property] = clone(change.value);
			else if (change.mode === 'remove') {
				if (change.required)
					throw new BulkValidationError('clear-required', { property: change.property });
				properties[change.property] = Array.isArray(current) ? [] : null;
			} else {
				if (!Array.isArray(current) && current !== undefined && current !== null)
					throw new BulkValidationError('add-scalar', { property: change.property });
				if (!Array.isArray(change.value))
					throw new BulkValidationError('add-values-list', { property: change.property });
				const values = [
					...clone((current || []) as unknown[]),
					...(clone(change.value) as unknown[]),
				];
				properties[change.property] = values.filter(
					(value, index) => !values.slice(0, index).some((prior) => deepEqual(prior, value)),
				);
			}
		}
		return { uid: document['uid'], changeToken: document['changeToken'], properties };
	});
}
function clone<T>(value: T): T {
	return value && typeof value === 'object' ? structuredClone(value) : value;
}
