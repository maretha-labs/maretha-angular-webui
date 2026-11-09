import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ResultsProjectionContext } from '@maretha/webui-sdk';
import { DocumentLinkPipe } from 'app/helpers/document-route';

/** The NXQL table presents repository paths through the ordinary compiled cell hook. */
@Component({
	selector: 'nx-nxql-path-cell',
	imports: [RouterLink, DocumentLinkPipe],
	template: `
		@if (thumbnail()) {
			<span class="document-thumbnail"><img [src]="thumbnail()" alt="" loading="lazy" /></span>
		}
		<a
			class="document-path"
			[routerLink]="context().row | documentLink"
			[attr.title]="context().value"
			data-nx-results-interactive
			>{{ context().value }}</a
		>
	`,
	styles: `
		:host {
			display: flex;
			align-items: center;
			min-width: 0;
			width: 100%;
		}
		.document-thumbnail {
			position: relative;
			display: inline-block;
			width: 32px;
			height: 32px;
			flex-shrink: 0;
		}
		img {
			position: absolute;
			inset: 0;
			width: auto;
			height: auto;
			max-width: 100%;
			max-height: 100%;
			margin: auto;
			margin-inline-end: 8px;
			border-radius: 3px;
			filter: brightness(1.2);
		}
		a {
			min-width: 0;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			color: var(--nuxeo-link-color, var(--nuxeo-text-default));
			text-decoration: none;
		}
		a:hover {
			color: var(--nuxeo-link-hover-color, var(--nuxeo-primary-color));
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxqlPathCellComponent {
	readonly context = input.required<ResultsProjectionContext<any>>();
	readonly thumbnail = computed(() => {
		const value = this.context().row.contextParameters?.thumbnail;
		return typeof value === 'string' ? value : (value?.url ?? '');
	});
}
