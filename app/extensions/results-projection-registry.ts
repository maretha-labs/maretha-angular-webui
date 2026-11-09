import {
	DestroyRef,
	EnvironmentProviders,
	Injectable,
	inject,
	makeEnvironmentProviders,
	provideEnvironmentInitializer,
	signal,
	Type,
} from '@angular/core';
import { ResultsProjectionMode } from './results-projection.component';
import { ResultsProjectionTemplateName } from './results-projection';

export interface ResultsProjectionDefinition {
	readonly id: string;
	readonly hostId?: string;
	/** Restricts this add-on to one search without changing existing host IDs. */
	readonly searchId?: string;
	readonly projection: ResultsProjectionTemplateName;
	readonly mode?: ResultsProjectionMode;
	readonly component: Type<unknown>;
	readonly priority?: number;
	readonly disabled?: boolean;
	readonly when?: (context: unknown) => boolean;
}

@Injectable({ providedIn: 'root' })
export class ResultsProjectionRegistry {
	private readonly definitions = signal<
		readonly (ResultsProjectionDefinition & { readonly token: symbol; readonly order: number })[]
	>([]);
	private order = 0;
	register(definition: ResultsProjectionDefinition): () => void {
		const token = Symbol(definition.id);
		const entry = { ...definition, token, order: this.order++ };
		this.definitions.update((items) => [
			...items.filter((item) => item.id !== definition.id),
			entry,
		]);
		return () => this.definitions.update((items) => items.filter((item) => item.token !== token));
	}
	resolve(
		hostId: string,
		projection: ResultsProjectionTemplateName,
		mode: ResultsProjectionMode,
		context: unknown,
		searchId?: string,
	): Type<unknown> | null {
		return (
			this.definitions()
				.filter((item) => {
					if (
						item.disabled ||
						item.projection !== projection ||
						(item.hostId && item.hostId !== hostId) ||
						(item.searchId && item.searchId !== searchId) ||
						(item.mode && item.mode !== mode)
					)
						return false;
					try {
						return !item.when || item.when(context);
					} catch {
						return false;
					}
				})
				.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.order - b.order)[0]?.component ??
			null
		);
	}
}

/**
 * Registers result projections for the application's lifetime, like layouts and slot
 * contributions. An `item` projection with `mode: 'grid'` and a `when` on the row's type
 * replaces the grid card of one document type.
 */
export function provideResultsProjections(
	...definitions: readonly ResultsProjectionDefinition[]
): EnvironmentProviders {
	return makeEnvironmentProviders(
		definitions.map((definition) =>
			provideEnvironmentInitializer(() => {
				const dispose = inject(ResultsProjectionRegistry).register(definition);
				inject(DestroyRef).onDestroy(dispose);
			}),
		),
	);
}
