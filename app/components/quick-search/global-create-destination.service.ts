import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from 'app/helpers/auth.service';
import { documentRouteMatches } from 'app/helpers/document-route';

interface CreationLocation {
	readonly path: string;
	readonly repository: string;
}

/** Retains the source creation parent across routes and shell contribution remounts. */
@Injectable({ providedIn: 'root' })
export class GlobalCreateDestination {
	private readonly auth = inject(AuthService);
	private owner: string | null | undefined;
	private lastDocument: unknown;
	private previousUserDocument: unknown;
	private readonly location = signal<CreationLocation | null>(null);

	constructor() {
		effect(() => {
			const userId = this.auth.userInfo()?.id ?? null;
			untracked(() => this.changeUser(userId));
		});
	}

	forUser(userId: string | undefined): CreationLocation | null {
		const location = this.location();
		return userId && userId === this.auth.userInfo()?.id && userId === this.owner ? location : null;
	}

	remember(
		userId: string | undefined,
		document: Readonly<Record<string, unknown>> | null,
		route: string,
	): void {
		const authenticatedUser = this.auth.userInfo()?.id ?? null;
		untracked(() => {
			this.changeUser(authenticatedUser);
			if (
				!userId ||
				userId !== authenticatedUser ||
				!document ||
				document === this.previousUserDocument ||
				!documentRouteMatches(route, document) ||
				typeof document['path'] !== 'string' ||
				!document['path'].startsWith('/')
			)
				return;
			const path =
				Array.isArray(document['facets']) && document['facets'].includes('Folderish')
					? document['path']
					: document['path'].slice(0, document['path'].lastIndexOf('/')) || '/';
			const repository = String(document['repository'] || 'default');
			this.lastDocument = document;
			this.previousUserDocument = undefined;
			const previous = this.location();
			if (previous?.path !== path || previous?.repository !== repository)
				this.location.set({ path, repository });
		});
	}

	private changeUser(userId: string | null): void {
		if (this.owner === userId) return;
		this.previousUserDocument = this.lastDocument ?? this.previousUserDocument;
		this.lastDocument = undefined;
		this.owner = userId;
		this.location.set(null);
	}
}
