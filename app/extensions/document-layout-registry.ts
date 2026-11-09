import {
	DestroyRef,
	EnvironmentProviders,
	Injectable,
	inject,
	makeEnvironmentProviders,
	provideEnvironmentInitializer,
	Type,
	signal,
} from '@angular/core';

/** The places where a document-type layout can be mounted by the application. */
export type DocumentLayoutMode = 'create' | 'edit' | 'import' | 'view' | 'metadata';

export interface DocumentLayoutContext {
	readonly documentType: string | null;
	readonly mode: DocumentLayoutMode;
	readonly document: Readonly<Record<string, unknown>> | null;
	readonly parentDocument: Readonly<Record<string, unknown>> | null;
	readonly noEdit: boolean;
}

export interface DocumentLayoutDefinition {
	/** Stable target used by clients for replacement and disabling. */
	readonly id: string;
	readonly documentType?: string;
	readonly mode: DocumentLayoutMode;
	readonly component?: Type<unknown>;
	/** The original Web UI resource that informed this layout. */
	readonly source?: string;
	readonly priority?: number;
	readonly disabled?: boolean;
	readonly when?: (context: DocumentLayoutContext) => boolean;
}

export interface DocumentLayoutOverride {
	readonly id: string;
	readonly disabled?: boolean;
	readonly priority?: number;
}

export interface DocumentLayoutExtension {
	readonly id: string;
	readonly layouts?: readonly DocumentLayoutDefinition[];
	readonly overrides?: readonly DocumentLayoutOverride[];
}

export interface ResolvedDocumentLayout extends DocumentLayoutDefinition {
	readonly extensionId: string;
	readonly priority: number;
	readonly disabled: boolean;
}

const normalize = (value: unknown): string | null => {
	if (typeof value !== 'string') return null;
	const result = value.trim().toLowerCase();
	return result || null;
};

/**
 * Creates a new, frozen scope for every host lookup.  In particular, callbacks
 * cannot retain a mutable host input while a modal or route changes document.
 */
export function documentLayoutContext(input: {
	documentType?: unknown;
	mode: DocumentLayoutMode;
	document?: unknown;
	parentDocument?: unknown;
	noEdit?: boolean;
}): DocumentLayoutContext {
	const clone = (value: unknown, seen = new WeakMap<object, unknown>()): unknown => {
		if (!value || typeof value !== 'object') return value;
		if (seen.has(value)) return seen.get(value)!;
		if (Array.isArray(value)) {
			const result: unknown[] = [];
			seen.set(value, result);
			return Object.freeze(value.map((item) => clone(item, seen)));
		}
		const result: Record<string, unknown> = {};
		seen.set(value, result);
		for (const [key, child] of Object.entries(value as Record<string, unknown>))
			result[key] = clone(child, seen);
		return Object.freeze(result);
	};
	const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
		value && typeof value === 'object' && !Array.isArray(value)
			? (clone(value) as Readonly<Record<string, unknown>>)
			: null;
	return Object.freeze({
		documentType: normalize(input.documentType),
		mode: input.mode,
		document: record(input.document),
		parentDocument: record(input.parentDocument),
		noEdit: input.noEdit === true,
	});
}

@Injectable({ providedIn: 'root' })
export class DocumentLayoutRegistry {
	private readonly layers: DocumentLayoutExtension[] = [];
	private readonly revisionState = signal(0);
	/** Hosts may observe this signal to remount after a runtime registration changes. */
	readonly revision = this.revisionState.asReadonly();

	register(extension: DocumentLayoutExtension): () => void {
		if (!extension.id) throw new Error('Document layout extension needs an id.');
		const copy = Object.freeze({
			...extension,
			layouts: Object.freeze([...(extension.layouts ?? [])]),
			overrides: Object.freeze([...(extension.overrides ?? [])]),
		});
		const previous = this.layers.findIndex((item) => item.id === copy.id);
		if (previous >= 0) this.layers.splice(previous, 1, copy);
		else this.layers.push(copy);
		this.revisionState.update((value) => value + 1);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			const index = this.layers.indexOf(copy);
			if (index >= 0) this.layers.splice(index, 1);
			this.revisionState.update((value) => value + 1);
		};
	}

	resolve(context: DocumentLayoutContext): ResolvedDocumentLayout | undefined {
		const entries = new Map<string, ResolvedDocumentLayout>();
		for (const extension of this.layers) {
			for (const layout of extension.layouts ?? []) {
				const candidate: ResolvedDocumentLayout = Object.freeze({
					...layout,
					documentType: normalize(layout.documentType) ?? undefined,
					extensionId: extension.id,
					priority: layout.priority ?? 0,
					disabled: layout.disabled === true,
				});
				const current = entries.get(layout.id);
				if (!current || candidate.priority >= current.priority) entries.set(layout.id, candidate);
			}
			for (const override of extension.overrides ?? []) {
				const current = entries.get(override.id);
				if (!current) continue;
				entries.set(
					override.id,
					Object.freeze({
						...current,
						disabled: override.disabled ?? current.disabled,
						priority: override.priority ?? current.priority,
					}),
				);
			}
		}
		return [...entries.values()]
			.filter((layout) => layout.mode === context.mode)
			.filter((layout) => !layout.documentType || layout.documentType === context.documentType)
			.filter((layout) => {
				try {
					return !layout.when || layout.when(context);
				} catch {
					return false;
				}
			})
			.sort(
				(a, b) => b.priority - a.priority || Number(!!b.documentType) - Number(!!a.documentType),
			)[0];
	}
}

export function provideDocumentLayoutExtensions(
	...extensions: readonly DocumentLayoutExtension[]
): EnvironmentProviders {
	return makeEnvironmentProviders(
		extensions.map((extension) =>
			provideEnvironmentInitializer(() => {
				const dispose = inject(DocumentLayoutRegistry).register(extension);
				inject(DestroyRef).onDestroy(dispose);
			}),
		),
	);
}
