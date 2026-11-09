import { Injectable, WritableSignal, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';

/** A committed favorites change: the documents are now (`favorite`) or no longer favorites. */
export interface FavoriteChange {
	readonly documentUids: readonly string[];
	readonly favorite: boolean;
	readonly repository?: string;
}

/**
 * Stock `added-to-favorites` / `removed-from-favorites`: announced once the server has committed
 * a favorites add or remove, whichever view made it, so every star showing those documents
 * follows. Dependency-free, so results pages can subscribe without pulling the collections service.
 */
@Injectable({ providedIn: 'root' })
export class FavoriteChanges {
	readonly changes$ = new Subject<FavoriteChange>();
}

/**
 * Keeps loaded result rows' favourite flag in step with every committed change, so a star drawn
 * again later (another view mode, a recycled card) shows the current state. Call it while the
 * host is constructed; it stops with the host.
 */
export function followFavoriteChanges(
	rows: WritableSignal<readonly any[]> | WritableSignal<any[]>,
) {
	const list = rows as WritableSignal<readonly any[]>;
	return inject(FavoriteChanges)
		.changes$.pipe(takeUntilDestroyed())
		.subscribe(({ documentUids, favorite }) => {
			if (!list().some((item) => documentUids.includes(item?.uid))) return;
			list.update((current) =>
				current.map((item) =>
					documentUids.includes(item?.uid)
						? {
								...item,
								contextParameters: {
									...item.contextParameters,
									favorites: { ...item.contextParameters?.favorites, isFavorite: favorite },
								},
							}
						: item,
				),
			);
		});
}
