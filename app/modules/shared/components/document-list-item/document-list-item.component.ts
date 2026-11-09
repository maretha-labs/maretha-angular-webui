import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
	linkedSignal,
	inject,
	Injector,
} from '@angular/core';
import { ResultsProjectionContext, WebUiMessagePipe, WebUiIconComponent } from '@maretha/webui-sdk';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { DocumentAttachmentsService } from 'app/modules/explorer/helpers/document-attachments.service';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { FavoriteChanges } from 'app/modules/explorer/helpers/favorite-changes.service';

/** Stock document list presentation, shared through each search's compiled item hook. */
@Component({
	selector: 'nx-document-list-item',
	imports: [WebUiMessagePipe, WebUiIconComponent],
	template: `
		<span class="document-list-item__thumbnail">
			@if (!thumbnailFailed()) {
				<img [src]="thumbnail()" alt="" loading="lazy" (error)="thumbnailFailed.set(true)" />
			}
		</span>
		<div class="document-list-item__body">
			<div class="document-list-item__heading">
				<span class="document-list-item__title" [attr.title]="context().row.title">{{
					context().row.title
				}}</span>
				<span class="document-list-item__type">{{
					typeKey() | webuiMessage: context().row.type
				}}</span>
			</div>
			@for (highlight of highlights(); track highlight.field) {
				<div class="document-list-item__highlight">
					<span class="document-list-item__category">{{
						'searchResults.highlight.field.' + highlight.field | webuiMessage: highlight.field
					}}</span>
					@for (segment of highlight.segments; track $index) {
						<span class="document-list-item__segment">
							@for (part of segment; track $index) {
								{{ part.pre }}
								@if (part.hit) {
									<em>{{ part.hit }}</em>
								}
								{{ part.post }}
							}
						</span>
					}
				</div>
			}
		</div>
		<div class="document-list-item__actions">
			@if (canFavorite()) {
				<button
					type="button"
					[disabled]="disabled()"
					[attr.aria-pressed]="favorite()"
					[attr.aria-label]="
						favorite()
							? ('favoritesToggleButton.tooltip.remove' | webuiMessage: 'Remove from favorites')
							: ('favoritesToggleButton.tooltip.add' | webuiMessage: 'Add to favorites')
					"
					(click)="toggleFavorite($event)"
				>
					<nx-webui-icon [name]="favorite() ? 'icons:star' : 'icons:star-border'" />
				</button>
			}
			@if (canDownload()) {
				<button
					type="button"
					[disabled]="disabled()"
					[attr.aria-label]="'downloadButton.tooltip' | webuiMessage: 'Download'"
					(click)="download($event)"
				>
					<nx-webui-icon name="nuxeo:download" />
				</button>
			}
		</div>
		<input
			class="document-list-item__select"
			type="checkbox"
			[checked]="context().selected"
			[disabled]="disabled()"
			[attr.aria-label]="
				'asset.select' | webuiMessage: 'Select {title}' : { title: context().row.title }
			"
			(click)="$event.stopPropagation()"
			(change)="context().toggleSelection()"
		/>
	`,
	styleUrl: './document-list-item.component.scss',
	host: {
		role: 'listitem',
		tabindex: '0',
		'[attr.aria-disabled]': 'disabled()',
		'[class.document-list-item--selected]': 'context().selected',
		'[class.document-list-item--selecting]': 'context().selection.size > 0',
		'(click)': 'activate($event)',
		'(keydown)': 'keyDown($event)',
	},
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentListItemComponent {
	readonly context = input.required<ResultsProjectionContext<any>>();
	readonly disabled = computed(() => this.context().loading || this.context().readonly);
	readonly thumbnail = computed(() => {
		const value = this.context().row.contextParameters?.thumbnail;
		return typeof value === 'string' ? value : (value?.url ?? '');
	});
	readonly thumbnailFailed = linkedSignal(() => !this.thumbnail());
	readonly typeKey = computed(
		() => `label.document.type.${String(this.context().row.type ?? '').toLowerCase()}`,
	);

	private readonly injector = inject(Injector);
	readonly canDownload = computed(() => !!this.context().row.properties?.['file:content']);
	readonly canFavorite = computed(
		() =>
			Array.isArray(this.context().row.facets) &&
			!this.context().row.facets.includes('NotCollectionMember'),
	);
	readonly favorite = linkedSignal(
		() => this.context().row.contextParameters?.favorites?.isFavorite === true,
	);
	private readonly favoriteChanges = inject(FavoriteChanges)
		.changes$.pipe(takeUntilDestroyed())
		.subscribe(({ documentUids, favorite }) => {
			if (documentUids.includes(this.context().row.uid)) this.favorite.set(favorite);
		});
	readonly highlights = computed(() => {
		const raw = this.context().row.contextParameters?.highlight;
		if (!Array.isArray(raw)) return [];
		return raw
			.filter((item) => item && typeof item.field === 'string' && Array.isArray(item.segments))
			.map((item) => ({
				field: item.field as string,
				segments: item.segments
					.filter((segment: unknown): segment is string => typeof segment === 'string')
					.map((segment: string) =>
						segment.split('<em>').map((part, index) => {
							if (index === 0) return { pre: part, hit: '', post: '' };
							const end = part.indexOf('</em>');
							return end < 0
								? { pre: '', hit: part, post: '' }
								: { pre: '', hit: part.slice(0, end), post: part.slice(end + 5) };
						}),
					),
			}));
	});

	async toggleFavorite(event: Event): Promise<void> {
		event.preventDefault();
		event.stopPropagation();
		if (this.disabled() || !this.canFavorite()) return;
		const row = this.context().row;
		await firstValueFrom(
			this.injector
				.get(DocumentCollectionsService)
				.toggleFavoriteDocument(
					[row.uid],
					!this.favorite(),
					row.repository && row.repository !== 'default' ? row.repository : undefined,
				),
			{ defaultValue: null },
		).catch(() => null);
	}

	async download(event: Event): Promise<void> {
		event.preventDefault();
		event.stopPropagation();
		if (this.disabled() || !this.canDownload()) return;
		const row = this.context().row;
		await firstValueFrom(
			this.injector
				.get(DocumentAttachmentsService)
				.downloadDocumentBlob(row, row.properties['file:content']),
			{ defaultValue: undefined },
		).catch(() => undefined);
	}

	activate(event: MouseEvent): void {
		if (this.disabled()) return;
		if (this.context().selection.size) this.context().toggleSelection();
		else if (!(event.ctrlKey || event.shiftKey || event.metaKey || event.button === 1))
			this.context().activateRow();
	}

	keyDown(event: KeyboardEvent): void {
		if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
		event.preventDefault();
		if (this.disabled()) return;
		if (event.key === ' ' || this.context().selection.size) this.context().toggleSelection();
		else this.context().activateRow();
	}
}
