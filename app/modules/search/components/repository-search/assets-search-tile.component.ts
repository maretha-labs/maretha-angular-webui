import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LazyLoadDirective } from 'app/directives/lazy-load.directive';
import type { RepositorySearchComponent } from './repository-search.component';

@Component({
	selector: 'nx-assets-search-tile',
	imports: [LazyLoadDirective, WebUiMessagePipe],
	template: `<article class="result-item result-item--grid result-item--asset" role="listitem">
		<input
			type="checkbox"
			[checked]="selected()"
			[disabled]="loading()"
			[attr.aria-label]="'asset.select' | webuiMessage: 'Select {title}' : { title: row().title }"
			(change)="selectionChange.emit()"
		/>
		<button
			type="button"
			class="asset-open"
			[attr.aria-label]="
				'asset.action'
					| webuiMessage
						: '{action, select, deselect {Deselect {title}} select {Select {title}} other {Open {title}}}'
						: {
								action: search().selectedIds().length
									? selected()
										? 'deselect'
										: 'select'
									: 'open',
								title: row().title,
						  }
			"
			[disabled]="loading()"
			(click)="search().activateAsset(row())"
		>
			<img nxLazyLoad [src]="search().thumbnail(row())" alt="" />
			<span>{{ row().title }}</span>
		</button>
	</article>`,
	styleUrl: './assets-search-tile.component.scss',
	host: {
		'data-nx-justified-tile': '',
		'[style.--nx-results-aspect-ratio]': 'search().assetAspectRatio(row())',
		'[class.result-item--selected]': 'selected()',
		// Stock nuxeo-justified-grid selection mode: every tile shows its check once one is selected.
		'[class.selection-mode]': 'search().selectedIds().length > 0',
	},
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsSearchTileComponent {
	readonly search = input.required<RepositorySearchComponent>();
	readonly row = input.required<any>();
	readonly selected = input(false);
	readonly loading = input(false);
	readonly selectionChange = output<void>();
}
