import { NgTemplateOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	Injector,
	computed,
	inject,
	input,
	linkedSignal,
	output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { WebUiIconComponent, WebUiMessagePipe } from '@maretha/webui-sdk';
import { firstValueFrom } from 'rxjs';
import { DocumentLinkPipe } from 'app/helpers/document-route';
import { DocumentAttachmentsService } from '../../helpers/document-attachments.service';
import { DocumentCollectionsService } from '../../helpers/document-collections.service';
import { FavoriteChanges } from '../../helpers/favorite-changes.service';

/**
 * Stock nuxeo-document-grid-thumbnail, the card of every results grid (folder content, trash,
 * searches, collections): a framed 220×260 box with a grey 190px thumbnail, a one-line title, the
 * type tag, a round select check, and the favourite/download strip on hover. Hosts keep selection
 * and links; the card owns its actions and follows favourites changes made anywhere.
 */
@Component({
	selector: 'nx-document-grid-thumbnail',
	imports: [NgTemplateOutlet, RouterLink, DocumentLinkPipe, WebUiIconComponent, WebUiMessagePipe],
	templateUrl: './document-grid-thumbnail.component.html',
	styleUrl: './document-grid-thumbnail.component.scss',
	host: {
		role: 'listitem',
		'[class.nx-grid-thumbnail--selected]': 'selected()',
		'[class.nx-grid-thumbnail--selecting]': 'selecting()',
		'[class.nx-grid-thumbnail--disabled]': 'disabled()',
	},
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentGridThumbnailComponent {
	readonly document = input.required<any>();
	readonly selected = input(false);
	/** Some card of the grid is selected: every check shows (stock selection mode). */
	readonly selecting = input(false);
	readonly selectionDisabled = input(false);
	/** A document the user cannot browse: no link, dimmed. */
	readonly disabled = input(false);
	/** An address the host resolves itself (collection members); its clicks are reported by `open`. */
	readonly href = input<string | null>(null);
	readonly toggleSelection = output<void>();
	readonly open = output<MouseEvent>();

	// Resolved on first use: both pull the documents manager, which a results page may not provide.
	private readonly injector = inject(Injector);

	readonly thumbnail = computed(() => {
		const parameters = this.document()?.contextParameters;
		const value = parameters?.thumbnail;
		return typeof value === 'string'
			? value
			: (value?.url ??
					parameters?.renditions?.find((rendition: any) => rendition?.name === 'thumbnail')?.url ??
					'');
	});
	/** Stock falls back to a blank image: the grey area stays, without a broken-image icon. */
	readonly thumbnailFailed = linkedSignal(() => !this.thumbnail());
	readonly typeKey = computed(
		() => `label.document.type.${String(this.document()?.type ?? '').toLowerCase()}`,
	);
	readonly canDownload = computed(() => !!this.document()?.properties?.['file:content']);
	readonly favorite = linkedSignal(
		() => this.document()?.contextParameters?.favorites?.isFavorite === true,
	);

	/** Stock toggle buttons listen for `removed-from-favorites`: a change made anywhere updates the star. */
	private readonly favoriteChanges = inject(FavoriteChanges)
		.changes$.pipe(takeUntilDestroyed())
		.subscribe(({ documentUids, favorite }) => {
			if (documentUids.includes(this.document()?.uid)) this.favorite.set(favorite);
		});

	async toggleFavorite(event: Event): Promise<void> {
		event.preventDefault();
		event.stopPropagation();
		// Only another repository is named: the default one keeps its cached favourites collection.
		const repository = this.document().repository;
		// The star follows the committed change through FavoriteChanges, like any change made elsewhere.
		await firstValueFrom(
			this.injector
				.get(DocumentCollectionsService)
				.toggleFavoriteDocument(
					[this.document().uid],
					!this.favorite(),
					repository && repository !== 'default' ? repository : undefined,
				),
			{ defaultValue: null },
		).catch(() => null);
	}

	async download(event: Event): Promise<void> {
		event.preventDefault();
		event.stopPropagation();
		if (!this.canDownload()) return;
		await firstValueFrom(
			this.injector
				.get(DocumentAttachmentsService)
				.downloadDocumentBlob(this.document(), this.document().properties['file:content']),
			{ defaultValue: undefined },
		).catch(() => undefined);
	}
}
