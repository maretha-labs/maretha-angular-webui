import { LocalizedUiError } from '@maretha/webui-sdk';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from 'environments/environment';
import { hasPermission } from 'app/helpers/document-permissions';

export type OrderDirection = 'up' | 'down';
export interface DocumentOrderPlan {
	readonly input: readonly string[];
	readonly before?: string;
}

/** Match Polymer's grouping of noncontiguous selections, preserving sibling order. */
export function planDocumentOrder(
	siblings: readonly string[],
	selected: readonly string[],
	direction: OrderDirection,
): DocumentOrderPlan | null {
	const selection = new Set(selected);
	if (!selection.size || selected.some((id) => !siblings.includes(id))) return null;
	const scan = direction === 'up' ? [...siblings] : [...siblings].reverse();
	const picked = scan.filter((id) => selection.has(id));
	let index = scan.indexOf(picked[0]);
	if (index === 0) {
		while (picked.length && picked[0] === scan[index]) {
			picked.shift();
			index++;
		}
		if (!picked.length) return null;
	} else index--;
	const before = direction === 'up' ? scan[index] : scan[index - 1];
	return { input: direction === 'up' ? picked : picked.reverse(), ...(before ? { before } : {}) };
}

export function canOrderChildren(document: any): boolean {
	return (
		!!document?.uid &&
		document.facets?.includes('Orderable') &&
		!document.isTrashed &&
		!document.isVersion &&
		!document.isProxy &&
		!document.isRecord &&
		!document.hasLegalHold &&
		!document.retainUntil &&
		hasPermission(document, 'WriteProperties')
	);
}

@Injectable({ providedIn: 'root' })
export class DocumentOrderService {
	private readonly http = inject(HttpClient);
	private readonly api = environment.nuxeoUrl + '/api/v1';

	async move(
		parentUid: string,
		repository: string,
		selected: readonly string[],
		direction: OrderDirection,
		isCurrent: () => boolean,
		expectedOrder: readonly string[] = [],
	): Promise<readonly string[] | null> {
		const base = `${this.api}/repo/${encodeURIComponent(repository)}`;
		const parent = await firstValueFrom(
			this.http.get<any>(`${base}/id/${encodeURIComponent(parentUid)}`, {
				headers: { 'enrichers-document': 'permissions' },
			}),
		);
		if (parent.uid !== parentUid || !canOrderChildren(parent))
			throw new LocalizedUiError(
				'app.errors.this-folder-can-no-longer-be-reordered-r-171dd8',
				'This folder can no longer be reordered. Refresh and check permissions.',
			);
		const siblings: string[] = [];
		const escapedParent = parentUid.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
		const query = `SELECT * FROM Document WHERE ecm:parentId='${escapedParent}' AND ecm:isVersion=0 AND ecm:isTrashed=0 AND ecm:mixinType!='HiddenInNavigation' ORDER BY ecm:pos`;
		for (let page = 0; ; page++) {
			if (!isCurrent())
				throw new LocalizedUiError(
					'app.errors.the-folder-changed-before-reordering--9b771d',
					'The folder changed before reordering.',
				);
			const result = await firstValueFrom(
				this.http.get<any>(`${base}/query`, {
					params: { query, pageSize: '100', currentPageIndex: String(page) },
					headers: { properties: 'dublincore' },
				}),
			);
			const ids = (result.entries ?? []).map((doc: any) => {
				if (
					!doc.uid ||
					doc.parentRef !== parentUid ||
					(doc.repository && doc.repository !== repository)
				)
					throw new LocalizedUiError(
						'app.errors.the-folder-contents-changed-refresh-befo-9737ec',
						'The folder contents changed. Refresh before reordering.',
					);
				return String(doc.uid);
			});
			if (ids.some((id: string) => siblings.includes(id)) || new Set(ids).size !== ids.length)
				throw new LocalizedUiError(
					'app.errors.the-folder-order-changed-while-loading-r-75a30d',
					'The folder order changed while loading. Refresh and retry.',
				);
			siblings.push(...ids);
			if (!result.isNextPageAvailable) {
				if (result.totalSize < 0 || result.totalSize !== siblings.length)
					throw new LocalizedUiError(
						'app.errors.the-complete-sibling-order-is-unavailabl-0938f8',
						'The complete sibling order is unavailable. Refresh before reordering.',
					);
				break;
			}
			if (!ids.length)
				throw new LocalizedUiError(
					'app.errors.the-server-returned-an-incomplete-siblin-03bf2e',
					'The server returned an incomplete sibling page.',
				);
		}
		if (selected.some((id) => !siblings.includes(id)))
			throw new LocalizedUiError(
				'app.errors.a-selected-document-moved-or-is-unavaila-b98287',
				'A selected document moved or is unavailable. Refresh the selection.',
			);
		const plan = planDocumentOrder(siblings, selected, direction);
		if (!plan || !isCurrent()) return null;
		const positions = expectedOrder.map((uid) => siblings.indexOf(uid));
		if (
			positions.some(
				(position, index) => position < 0 || (index > 0 && position <= positions[index - 1]),
			)
		)
			throw new LocalizedUiError(
				'app.errors.the-displayed-order-is-stale-refresh-the-97f922',
				'The displayed order is stale. Refresh the folder before reordering.',
			);
		try {
			await firstValueFrom(
				this.http.post(
					`${this.api}/automation/Document.Order`,
					{
						input: plan.input,
						params: plan.before ? { before: plan.before } : {},
					},
					{ headers: { 'X-NXRepository': repository, 'nx-es-sync': 'true' } },
				),
			);
			const moved = new Set(plan.input);
			const ordered = siblings.filter((uid) => !moved.has(uid));
			ordered.splice(plan.before ? ordered.indexOf(plan.before) : ordered.length, 0, ...plan.input);
			return ordered;
		} catch {
			throw new LocalizedUiError(
				'app.errors.reordering-failed-or-its-outcome-is-unkn-857931',
				'Reordering failed or its outcome is unknown. Refresh the folder before retrying.',
			);
		}
	}
}
