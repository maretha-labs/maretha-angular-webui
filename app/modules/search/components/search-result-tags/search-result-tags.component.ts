import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { WebUiMessages } from '@maretha/webui-sdk';

/** Stock `formatDirectory`: a vocabulary entry's label, prefixed by its fetched parents' labels. */
export function directoryLabel(value: unknown, language: string): string {
	const entry = value as Record<string, any> | null;
	if (!entry || typeof entry !== 'object' || entry['entity-type'] !== 'directoryEntry')
		return value == null ? '' : String(value);
	const field = entry['properties']?.label ? 'label' : `label_${language}`;
	let label = String(entry['properties']?.[field] ?? '');
	// Stock `_absoluteDirectoryPath`: each fetched parent prefixes its label and the separator.
	for (
		let parent = entry['properties']?.parent;
		parent?.['entity-type'] === 'directoryEntry';
		parent = parent.properties?.parent
	) {
		const parentLabel = String(parent.properties?.[field] ?? '');
		label = label ? `${parentLabel}/${label}` : parentLabel;
	}
	return label;
}

/** Stock search table tags (`nuxeo-tag`) for the Type, Nature, Coverage and Subjects cells. */
@Component({
	selector: 'nx-search-result-tags',
	template: `@for (label of labels(); track $index) {
		<span class="tag">{{ label }}</span>
	}`,
	styles: `
		:host {
			display: contents;
		}
		/* Stock nuxeo-tag with the theme's --nuxeo-tag mixin, at the stock 13px scale. */
		.tag {
			display: inline-block;
			box-sizing: border-box;
			min-height: 1.55em;
			margin-bottom: 0.3em;
			padding: 2.6px 6.5px;
			border-radius: 2em;
			background-color: var(--nuxeo-tag-background, #eee);
			color: var(--nuxeo-tag-text, var(--nuxeo-text-default));
			font-size: 10.4px;
			letter-spacing: 0.02em;
			line-height: 13px;
			vertical-align: baseline;
		}
		.tag + .tag {
			margin-inline-start: 0.3em;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchResultTagsComponent {
	readonly row = input.required<any>();
	readonly field = input.required<'type' | 'nature' | 'coverage' | 'subjects'>();
	/** Stock Type cells show `formatDocType(type)`, except Assets and NXQL, which show the id. */
	readonly typeLabel = input<'localized' | 'id'>('localized');
	private readonly messages = inject(WebUiMessages);
	readonly labels = computed(() => {
		const row = this.row();
		const field = this.field();
		if (field === 'type') {
			const type = String(row?.type ?? '');
			if (!type) return [];
			if (this.typeLabel() === 'id') return [type];
			// Stock `_getI18nWithPrefix('label.document.type', type)`: the lowercased type when absent.
			const key = type.toLowerCase();
			return [this.messages.text(`label.document.type.${key}`, key)];
		}
		const language = this.messages.locale().split('-')[0];
		const value = row?.properties?.[`dc:${field}`];
		if (field === 'subjects')
			return (Array.isArray(value) ? value : []).map((subject) =>
				directoryLabel(subject, language),
			);
		return value ? [directoryLabel(value, language)] : [];
	});
}
