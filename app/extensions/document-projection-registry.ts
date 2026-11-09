import { Injectable, Type, reflectComponentType, signal } from '@angular/core';
export type DocumentProjectionName = 'versions.items' | 'versions.actions' | 'acl.emptyResult';
export interface DocumentProjectionContext {
	readonly document: Readonly<Record<string, unknown>> | null;
	readonly noEdit: boolean;
	readonly value?: unknown;
}
export interface DocumentProjection {
	readonly id: string;
	readonly name: DocumentProjectionName;
	readonly component?: Type<unknown>;
	readonly disabled?: boolean;
	readonly priority?: number;
	readonly when?: (context: DocumentProjectionContext) => boolean;
}
export interface ResolvedDocumentProjection {
	readonly component?: Type<unknown>;
	readonly disabled: boolean;
}
const clone = (value: any): any => {
	if (!value || typeof value !== 'object') return value;
	if (Array.isArray(value)) return Object.freeze(value.map(clone));
	const result: any = {};
	for (const [key, child] of Object.entries(value)) result[key] = clone(child);
	return Object.freeze(result);
};
export function documentProjectionContext(
	context: DocumentProjectionContext,
): DocumentProjectionContext {
	return Object.freeze({
		document: context.document ? clone(context.document) : null,
		noEdit: context.noEdit === true,
		value: clone(context.value),
	});
}
@Injectable({ providedIn: 'root' })
export class DocumentProjectionRegistry {
	private readonly entries: DocumentProjection[] = [];
	private readonly revisionState = signal(0);
	readonly revision = this.revisionState.asReadonly();
	register(entry: DocumentProjection): () => void {
		if (!entry.id) throw new Error('Document projection needs an id.');
		if (
			!entry.disabled &&
			(!entry.component ||
				!reflectComponentType(entry.component)?.inputs.some(
					(input) => input.templateName === 'projectionContext',
				))
		)
			throw new Error('Document projection components must declare a projectionContext input.');
		this.entries.push(entry);
		this.revisionState.update((x) => x + 1);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			const index = this.entries.indexOf(entry);
			if (index >= 0) this.entries.splice(index, 1);
			this.revisionState.update((x) => x + 1);
		};
	}
	resolve(
		name: DocumentProjectionName,
		raw: DocumentProjectionContext,
	): ResolvedDocumentProjection | undefined {
		const context = documentProjectionContext(raw);
		const entry = this.entries
			.filter((x) => x.name === name)
			.filter((x) => {
				try {
					return !x.when || x.when(context);
				} catch {
					return false;
				}
			})
			.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
		return entry
			? Object.freeze({ component: entry.component, disabled: entry.disabled === true })
			: undefined;
	}
}
