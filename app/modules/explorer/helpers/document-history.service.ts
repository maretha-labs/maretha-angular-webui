import { Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { AuthService } from 'app/helpers/auth.service';
import { environment } from 'environments/environment';

@Injectable({ providedIn: 'root' })
export class DocumentHistoryService {
	private readonly _documentHistory = signal<any[]>([]);
	readonly documentHistory = this._documentHistory.asReadonly();
	readonly documentHistoryUpdated$ = toObservable(this._documentHistory);
	private readonly maxDocuments = 15;
	private localStorageKey = '';

	constructor(authService: AuthService) {
		authService.userInfoUpdated$.subscribe((user) => {
			this._documentHistory.set([]);
			this.localStorageKey = user
				? `maretha.recent.${encodeURIComponent(JSON.stringify([environment.nuxeoUrl, environment.authClientId, user.id]))}`
				: '';
			if (!this.localStorageKey) return;
			try {
				const saved = JSON.parse(localStorage.getItem(this.localStorageKey) || '[]');
				if (Array.isArray(saved))
					this._documentHistory.set(
						saved
							.filter(
								(d) =>
									typeof d?.uid === 'string' &&
									typeof d?.lastViewed === 'string' &&
									Number.isFinite(Date.parse(d.lastViewed)),
							)
							.slice(0, this.maxDocuments),
					);
			} catch {
				/* Storage may be unavailable or contain an older format. */
			}
		});
	}

	push(document: any): void {
		if (!this.localStorageKey || !document?.uid) return;
		const snapshot = { ...document, ng: { ...document.ng }, lastViewed: new Date().toISOString() };
		delete snapshot.ng.isSelected;
		// A later move or rename would make the stored path stale: recents navigate by UID.
		delete snapshot.path;
		const others = this._documentHistory().filter(
			(d) =>
				d.uid !== document.uid ||
				(d.repository ?? 'default') !== (document.repository ?? 'default'),
		);
		this._documentHistory.set([snapshot, ...others].slice(0, this.maxDocuments));
		this.persist();
	}

	/** A server move may affect descendants too. Resolve saved entries by UID on their next visit. */
	invalidatePaths(): void {
		this._documentHistory.set(
			this._documentHistory().map((document) => {
				const { path: _path, ...reference } = document;
				return reference;
			}),
		);
		this.persist();
	}

	clear(): void {
		this._documentHistory.set([]);
		this.persist();
	}

	private persist(): void {
		if (!this.localStorageKey) return;
		try {
			localStorage.setItem(this.localStorageKey, JSON.stringify(this._documentHistory()));
		} catch {
			/* In-memory history still works when persistent storage is unavailable. */
		}
	}
}
