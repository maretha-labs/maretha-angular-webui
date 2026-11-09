import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { documentRouteMatches, documentUrl } from './document-route';

export interface CollectionMemberNavigation {
	readonly sequence: number;
	readonly userId: string;
	readonly repository: string;
	readonly collection: any;
	readonly member: any;
}

/** Explicit Collection-result activation only; ordinary document navigation has no drawer effect. */
@Injectable({ providedIn: 'root' })
export class CollectionDrawerNavigation {
	private readonly router = inject(Router);
	private sequence = 0;
	readonly pending = signal<CollectionMemberNavigation | null>(null);
	readonly accepted = signal<CollectionMemberNavigation | null>(null);

	async navigate(collection: any, member: any, userId: string): Promise<void> {
		const repository = collection?.repository ?? 'default';
		if (
			collection?.type !== 'Collection' ||
			!collection.uid ||
			!member?.uid ||
			!userId ||
			(member.repository ?? 'default') !== repository
		)
			return;
		const sequence = ++this.sequence;
		this.pending.set(null);
		this.accepted.set(null);
		try {
			if (
				(await this.router.navigateByUrl(documentUrl(member))) &&
				sequence === this.sequence &&
				documentRouteMatches(this.router.url, member)
			) {
				this.pending.set({ sequence, userId, repository, collection, member });
			}
		} catch {
			/* A rejected or superseded navigation must not open a drawer. */
		}
	}

	accept(request: CollectionMemberNavigation): boolean {
		if (this.pending() !== request || !documentRouteMatches(this.router.url, request.member))
			return false;
		this.pending.set(null);
		this.accepted.set(request);
		return true;
	}
}
