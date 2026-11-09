import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { WebUiMessages } from './webui-messages';
import { WebUiIconComponent } from './webui-icons';
import {
	ContributionDefinition,
	ContributionRegistration,
	defineContribution,
	defineSlot,
	ExtensionDiagnostic,
	ResolvedContribution,
	SlotDefinition,
} from './contribution';
import { ExtensionRegistry } from './extension-registry.service';
import { DOCUMENT_ACTIONS_SLOT, DocumentActionContext, POLYMER_SLOTS } from './slots';

export type DocumentViewContext = DocumentActionContext;

export interface DocumentViewItemContext extends DocumentViewContext {
	readonly viewId: string;
	readonly selected: boolean;
	readonly tabId: string;
	readonly panelId: string;
	readonly tabIndex: number;
	readonly select: () => void;
}

export interface DocumentViewChange {
	readonly viewId: string | null;
	readonly replaceUrl: boolean;
}

export const DOCUMENT_VIEWS_ITEMS_SLOT = defineSlot(
	POLYMER_SLOTS.DOCUMENT_VIEWS_ITEMS,
	DOCUMENT_ACTIONS_SLOT.isContext,
);
export const DOCUMENT_VIEWS_PAGES_SLOT = defineSlot(
	POLYMER_SLOTS.DOCUMENT_VIEWS_PAGES,
	DOCUMENT_ACTIONS_SLOT.isContext,
);

@Component({
	selector: 'nx-document-view-tab',
	standalone: true,
	imports: [WebUiIconComponent],
	template: `<button
		type="button"
		role="tab"
		[id]="context().tabId"
		[attr.aria-selected]="context().selected"
		[attr.aria-controls]="context().panelId"
		[tabIndex]="context().tabIndex"
		(click)="context().select()"
	>
		@if (icon()) {
			<nx-webui-icon [name]="icon()!" />
		}
		{{ messages.text(labelKey(), label()) }}
	</button>`,
	styles: `
		:host {
			display: inline-flex;
		}
		button {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			color: var(--nuxeo-text-default, #3a3a54);
			background: transparent;
			border: 0;
			border-bottom: 2px solid transparent;
			padding: 12px 20px;
			font: inherit;
			cursor: pointer;
		}
		button[aria-selected='true'] {
			color: var(--nuxeo-text-default, CanvasText);
			border-bottom-color: currentColor;
			font-weight: 600;
		}
		button:focus-visible {
			outline: 2px solid var(--nuxeo-text-default, CanvasText);
			outline-offset: -3px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentViewTabComponent {
	readonly context = input.required<DocumentViewItemContext>();
	readonly label = input.required<string>();
	readonly labelKey = input<string>();
	readonly icon = input<string>();
	readonly messages = inject(WebUiMessages);
}

export type DocumentViewDefinition = ContributionDefinition<DocumentViewContext> & {
	readonly viewId: string;
	readonly label: string;
	readonly labelKey?: string;
	readonly icon?: string;
};

export function defineDocumentView(
	definition: DocumentViewDefinition,
): readonly ContributionRegistration[] {
	return definePairedView(
		{ items: DOCUMENT_VIEWS_ITEMS_SLOT, pages: DOCUMENT_VIEWS_PAGES_SLOT },
		definition,
	);
}

export function definePairedView<C extends DocumentViewContext>(
	slots: { items: SlotDefinition<C>; pages: SlotDefinition<C> },
	definition: ContributionDefinition<C> &
		Pick<DocumentViewDefinition, 'viewId' | 'label' | 'labelKey' | 'icon'>,
): readonly ContributionRegistration[] {
	if (!definition.label.trim()) throw new Error('A paired view requires a label.');
	const { viewId, label, labelKey, icon, ...page } = definition;
	return [
		defineContribution(slots.items, {
			id: page.id,
			pairKey: viewId,
			order: page.order,
			priority: page.priority,
			disabled: page.disabled,
			when: page.when,
			component: DocumentViewTabComponent,
			inputs: { label, labelKey, icon },
		}),
		defineContribution(slots.pages, { ...page, pairKey: viewId }),
	];
}

export interface ResolvedDocumentView {
	readonly viewId: string;
	readonly item: ResolvedContribution;
	readonly page: ResolvedContribution;
}

export function resolveDocumentViews<C extends DocumentViewContext>(
	registry: ExtensionRegistry,
	context: C,
	slots: { items: string; pages: string } = {
		items: POLYMER_SLOTS.DOCUMENT_VIEWS_ITEMS,
		pages: POLYMER_SLOTS.DOCUMENT_VIEWS_PAGES,
	},
): { views: readonly ResolvedDocumentView[]; diagnostics: readonly ExtensionDiagnostic[] } {
	const items = registry.resolve(slots.items, context);
	const pages = registry.resolve(slots.pages, context);
	const diagnostics = [...items.diagnostics, ...pages.diagnostics];
	const views: ResolvedDocumentView[] = [];
	const keys = new Set([...items.items, ...pages.items].map((entry) => entry.pairKey));
	for (const key of keys) {
		const pairedItems = items.items.filter((entry) => entry.pairKey === key);
		const pairedPages = pages.items.filter((entry) => entry.pairKey === key);
		if (!key || pairedItems.length !== 1 || pairedPages.length !== 1) {
			for (const entry of [...pairedItems, ...pairedPages])
				diagnostics.push({
					code: 'invalid-pair',
					extensionId: entry.extensionId,
					slot: entry.slot,
					contributionId: entry.id,
					message:
						'A paired view requires exactly one eligible item and page with the same pair key.',
				});
			continue;
		}
		views.push({ viewId: key, item: pairedItems[0], page: pairedPages[0] });
	}
	return { views, diagnostics };
}

export type DocumentViewVariant = ContributionDefinition<DocumentViewContext>;

/** Ordered, first-match normalization for legacy bodies sharing one rendered view name. */
export function defineDocumentViewVariants(
	definition: Pick<
		DocumentViewDefinition,
		'id' | 'viewId' | 'label' | 'labelKey' | 'icon' | 'order'
	>,
	variants: readonly DocumentViewVariant[],
): readonly ContributionRegistration[] {
	if (!variants.length || new Set(variants.map((variant) => variant.id)).size !== variants.length)
		throw new Error('View variants require a non-empty list of unique IDs.');
	const candidates = variants.map((variant) => ({ ...variant }));
	const selected = (context: DocumentViewContext) =>
		candidates.findIndex(
			(candidate) => !candidate.disabled && (!candidate.when || candidate.when(context)),
		);
	const item = defineDocumentView({
		...definition,
		...{ component: DocumentViewTabComponent },
		when: (context) => selected(context) >= 0,
	})[0];
	return [
		item,
		...candidates.map((candidate, index) =>
			defineContribution(DOCUMENT_VIEWS_PAGES_SLOT, {
				...candidate,
				pairKey: definition.viewId,
				when: (context) => selected(context) === index,
			}),
		),
	];
}

export function documentViewParameter(params: { get(name: string): string | null }): string | null {
	return params.get('view') ?? params.get('p');
}
