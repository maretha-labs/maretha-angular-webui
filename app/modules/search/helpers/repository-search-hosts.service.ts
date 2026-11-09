import { Injectable, signal, untracked } from '@angular/core';
import { convertToParamMap, type ParamMap, type Params } from '@angular/router';
import type { RepositorySearchComponent } from '../components/repository-search/repository-search.component';

const NO_CRITERIA = convertToParamMap({});

/** Filter groups a drawer's own form has open, keyed to the user and repository it serves. */
export interface DrawerFormState {
	readonly scope: string;
	/** One-use Search action, valid only for this exact results URL. Never persisted. */
	readonly submittedUrl?: string;
	readonly facetsExpanded: ReadonlySet<string>;
	readonly bucketListsExpanded: ReadonlySet<string>;
}

/** Drawers reuse the mounted results host's draft, aggregations and saved-search state. */
@Injectable({ providedIn: 'root' })
export class RepositorySearchHosts {
	readonly hosts = signal<ReadonlyMap<string, RepositorySearchComponent>>(new Map());
	private readonly handedOff = new Map<string, DrawerFormState>();
	/** Applied criteria of `memory` searches, in their route encoding, keyed by search scope. */
	private readonly applied = signal<ReadonlyMap<string, ParamMap>>(new Map());
	criteria(scope: string): ParamMap {
		return this.applied().get(scope) ?? NO_CRITERIA;
	}
	/**
	 * Applies criteria as a query-param navigation would (`null` removes a key; `merge` keeps the
	 * others). The returned undo restores the previous criteria unless newer ones replaced them.
	 */
	applyCriteria(scope: string, params: Params, merge = false): () => void {
		const previous = untracked(this.applied).get(scope);
		const base = merge && previous ? previous : NO_CRITERIA;
		const values: Params = Object.fromEntries(base.keys.map((key) => [key, base.getAll(key)]));
		for (const [key, value] of Object.entries(params))
			if (value === null || value === undefined) delete values[key];
			else values[key] = value;
		const next = convertToParamMap(values);
		this.applied.update((all) => new Map(all).set(scope, next));
		return () => {
			if (untracked(this.applied).get(scope) !== next) return;
			this.applied.update((all) => {
				const restored = new Map(all);
				if (previous) restored.set(scope, previous);
				else restored.delete(scope);
				return restored;
			});
		};
	}
	/**
	 * The drawer's own form opens its results page, whose form then takes the drawer's place:
	 * that form opens with the groups the user had open, as stock's single form keeps them.
	 */
	handOff(kind: string, state: DrawerFormState): () => void {
		this.handedOff.set(kind, state);
		return () => {
			// A superseded navigation must not cancel a newer Search from the same drawer.
			if (this.handedOff.get(kind) === state) this.handedOff.delete(kind);
		};
	}
	takeHandOff(kind: string, scope: string): DrawerFormState | undefined {
		const state = this.handedOff.get(kind);
		this.handedOff.delete(kind);
		return state?.scope === scope ? state : undefined;
	}
	register(kind: string, host: RepositorySearchComponent): () => void {
		this.hosts.update((hosts) => new Map(hosts).set(kind, host));
		return () => {
			if (this.hosts().get(kind) === host)
				this.hosts.update((hosts) => {
					const next = new Map(hosts);
					next.delete(kind);
					return next;
				});
		};
	}
}
