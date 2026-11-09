import { InjectionToken } from '@angular/core';

/** Provider-bound criteria persisted by the host's saved-search resource. */
export interface SavedSearchDefinition {
	readonly id: string;
	readonly title: string;
	readonly params: Readonly<Record<string, unknown>>;
	readonly query?: string;
}

/** Add-ons never need the host's mutable search services to manage saved criteria. */
export interface SavedSearchGateway {
	list(providerName: string): Promise<readonly SavedSearchDefinition[]>;
	save(
		providerName: string,
		title: string,
		params: Readonly<Record<string, unknown>>,
	): Promise<SavedSearchDefinition>;
	update(
		id: string,
		providerName: string,
		title: string,
		params: Readonly<Record<string, unknown>>,
	): Promise<SavedSearchDefinition>;
	remove(id: string): Promise<void>;
	permissions(id: string): Promise<readonly string[]>;
	share(id: string, principal: string, notify?: boolean): Promise<void>;
}

const unavailable = () => Promise.reject(new Error('This host does not support saved searches.'));

export const SAVED_SEARCH_GATEWAY = new InjectionToken<SavedSearchGateway>('SAVED_SEARCH_GATEWAY', {
	providedIn: 'root',
	factory: () => ({
		list: async () => [],
		save: unavailable,
		update: unavailable,
		remove: unavailable,
		permissions: async () => [],
		share: unavailable,
	}),
});
