import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	Component,
	ChangeDetectorRef,
	ElementRef,
	EventEmitter,
	Input,
	OnChanges,
	Output,
	ViewChild,
	inject,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'environments/environment';
import { LazyLoadDirective } from '../../../../directives/lazy-load.directive';
import {
	NoteContentLocaleDirective,
	NoteHtmlPipe,
	noteVideoUrl,
	sanitizeNoteHtml,
} from './note-html.pipe';

/** A Note-only editor. Pasted HTML follows the same sanitizer as the Note preview. */
@Component({
	selector: 'nx-note-richtext-editor',
	standalone: true,
	imports: [
		FormsModule,
		LazyLoadDirective,
		NoteContentLocaleDirective,
		NoteHtmlPipe,
		WebUiMessagePipe,
	],
	template: `
		<div
			class="toolbar"
			role="toolbar"
			[attr.aria-label]="
				'app.modules.note-richtext-editor.note-formatting-8423d0' | webuiMessage: 'Note formatting'
			"
		>
			<select
				[attr.aria-label]="
					'app.modules.note-richtext-editor.heading-de437b' | webuiMessage: 'Heading'
				"
				[disabled]="disabled"
				(change)="format('formatBlock', $any($event.target).value)"
			>
				<option value="p">
					{{ 'app.modules.note-richtext-editor.normal-ffd063' | webuiMessage: 'Normal' }}
				</option>
				@for (level of [1, 2, 3, 4, 5, 6]; track level) {
					<option [value]="'h' + level">
						{{ 'editor.heading' | webuiMessage: 'Heading {level, number}' : { level: level } }}
					</option>
				}
			</select>
			@for (control of controls; track $index) {
				<button
					type="button"
					[disabled]="disabled"
					[title]="control.label"
					[attr.aria-label]="control.label"
					(mousedown)="$event.preventDefault()"
					(click)="format(control.command, control.value)"
				>
					<span [class]="control.className || ''">{{ control.text }}</span>
				</button>
			}
			<label
				class="color-button"
				[attr.title]="
					'app.modules.note-richtext-editor.text-color-4f0dd2' | webuiMessage: 'Text color'
				"
				>{{ 'app.modules.note-richtext-editor.a-776e45' | webuiMessage: 'A'
				}}<input
					type="color"
					[attr.aria-label]="
						'app.modules.note-richtext-editor.text-color-4f0dd2' | webuiMessage: 'Text color'
					"
					value="#000000"
					[disabled]="disabled"
					(pointerdown)="rememberSelection()"
					(change)="color('foreColor', $any($event.target).value)"
			/></label>
			<label
				class="color-button"
				[attr.title]="'htmlEditor.backgroundColor' | webuiMessage: 'Background color'"
				>▰<input
					type="color"
					[attr.aria-label]="'htmlEditor.backgroundColor' | webuiMessage: 'Background color'"
					value="#ffff00"
					[disabled]="disabled"
					(pointerdown)="rememberSelection()"
					(change)="color('hiliteColor', $any($event.target).value)"
			/></label>
			<button
				type="button"
				[disabled]="disabled"
				[attr.aria-label]="'htmlEditor.insert.link' | webuiMessage: 'Insert link'"
				[attr.title]="'htmlEditor.insert.link' | webuiMessage: 'Insert link'"
				(mousedown)="$event.preventDefault()"
				(click)="showLink()"
			>
				↗
			</button>
			<label
				class="image-button"
				[attr.title]="'htmlEditor.insert.image' | webuiMessage: 'Insert image'"
				>▧<input
					type="file"
					accept="image/*"
					[attr.aria-label]="'htmlEditor.insert.image' | webuiMessage: 'Insert image'"
					[disabled]="disabled"
					(pointerdown)="rememberSelection()"
					(change)="insertImage($event)"
			/></label>
			<button
				type="button"
				[attr.aria-label]="
					'app.modules.note-richtext-editor.insert-images-from-documents-fa2219'
						| webuiMessage: 'Insert images from documents'
				"
				[attr.title]="
					'app.modules.note-richtext-editor.insert-images-from-documents-fa2219'
						| webuiMessage: 'Insert images from documents'
				"
				[disabled]="disabled"
				(mousedown)="$event.preventDefault()"
				(click)="openImages()"
			>
				▧⌕
			</button>
			<button
				type="button"
				[attr.aria-label]="'htmlEditor.insert.video' | webuiMessage: 'Insert video'"
				[attr.title]="'htmlEditor.insert.video' | webuiMessage: 'Insert video'"
				[disabled]="disabled"
				(mousedown)="$event.preventDefault()"
				(click)="openVideo()"
			>
				▹
			</button>
		</div>
		@if (imagesOpen) {
			<section
				class="image-picker"
				[attr.aria-label]="
					'app.modules.note-richtext-editor.images-from-documents-5a1664'
						| webuiMessage: 'Images from documents'
				"
			>
				<div class="link-editor">
					<label
						>{{
							'app.modules.note-richtext-editor.search-documents-6efdf1'
								| webuiMessage: 'Search documents'
						}}<input
							#imageQuery
							type="search"
							[attr.aria-label]="
								'app.modules.note-richtext-editor.search-image-documents-b26536'
									| webuiMessage: 'Search image documents'
							"
							(keydown.enter)="searchImages(imageQuery.value)" /></label
					><button
						type="button"
						[disabled]="imagesLoading"
						(click)="searchImages(imageQuery.value)"
					>
						{{ 'app.modules.note-richtext-editor.search-5d86f9' | webuiMessage: 'Search' }}</button
					><button type="button" (click)="imagesOpen = false">
						{{ 'app.modules.note-richtext-editor.cancel-5e0f36' | webuiMessage: 'Cancel' }}
					</button>
				</div>
				@if (imagesLoading) {
					<p role="status">
						{{
							'app.modules.note-richtext-editor.loading-images-e7f358'
								| webuiMessage: 'Loading images…'
						}}
					</p>
				}
				@if (imagesError) {
					<p role="alert">{{ imagesError }}</p>
				}
				@if (moreImages) {
					<button
						type="button"
						[disabled]="imagesLoading"
						(click)="searchImages(imageSearch, true)"
					>
						{{
							'app.modules.note-richtext-editor.load-more-images-984aab'
								| webuiMessage: 'Load more images'
						}}
					</button>
				}
				<div class="image-results">
					@for (image of images; track image.uid) {
						<button
							type="button"
							(click)="insertRepositoryImage(image)"
							[attr.aria-label]="
								'action.insertNamed' | webuiMessage: 'Insert {name}' : { name: image.title }
							"
						>
							<img nxLazyLoad [src]="image.properties['file:content'].data" alt="" />{{
								image.title
							}}
						</button>
					}
				</div>
			</section>
		}
		@if (videoOpen) {
			<div class="link-editor">
				<label
					>{{ 'app.modules.note-richtext-editor.video-url-a3b073' | webuiMessage: 'Video URL'
					}}<input
						#videoUrl
						type="url"
						[attr.aria-label]="
							'app.modules.note-richtext-editor.video-url-a3b073' | webuiMessage: 'Video URL'
						"
						[attr.placeholder]="
							'app.modules.note-richtext-editor.https-www-youtube-com-watch-v-fcedf3'
								| webuiMessage: 'https://www.youtube.com/watch?v=…'
						"
						(keydown.enter)="insertVideo(videoUrl.value)" /></label
				><button type="button" (click)="insertVideo(videoUrl.value)">
					{{ 'app.modules.note-richtext-editor.insert-034c6a' | webuiMessage: 'Insert' }}</button
				><button type="button" (click)="videoOpen = false">
					{{ 'app.modules.note-richtext-editor.cancel-5e0f36' | webuiMessage: 'Cancel' }}
				</button>
			</div>
			@if (videoError) {
				<p role="alert">{{ videoError }}</p>
			}
		}
		@if (linkOpen) {
			<div class="link-editor">
				<label
					>{{ 'app.modules.note-richtext-editor.link-url-ff56a8' | webuiMessage: 'Link URL' }}
					<input
						#linkUrl
						type="url"
						[attr.placeholder]="
							'app.modules.note-richtext-editor.https-2dc83c' | webuiMessage: 'https://'
						"
						(keydown.enter)="insertLink(linkUrl.value)" /></label
				><button type="button" (click)="insertLink(linkUrl.value)">
					{{ 'themes.apply' | webuiMessage: 'Apply' }}</button
				><button type="button" (click)="linkOpen = false">
					{{ 'app.modules.note-richtext-editor.cancel-5e0f36' | webuiMessage: 'Cancel' }}
				</button>
			</div>
			@if (linkError) {
				<p role="alert">{{ linkError }}</p>
			}
		}
		<div
			#editor
			class="editor"
			[class.empty]="isEmpty"
			[attr.contenteditable]="!disabled"
			role="textbox"
			[attr.aria-label]="
				'app.modules.note-richtext-editor.note-rich-text-3912cc' | webuiMessage: 'Note rich text'
			"
			[attr.placeholder]="placeholder || null"
			[attr.data-placeholder]="placeholder || null"
			aria-multiline="true"
			[attr.aria-readonly]="disabled"
			nxNoteContentLocale
			[innerHTML]="html | noteHtml"
			(input)="changed()"
			(paste)="paste($event)"
			(drop)="$event.preventDefault()"
		></div>
	`,
	styles: `
		:host {
			display: block;
			border: 1px solid var(--nuxeo-border, #ddd);
		}
		.toolbar {
			display: flex;
			flex-wrap: wrap;
			gap: 2px;
			padding: 8px;
			border-bottom: 1px solid var(--nuxeo-border, #ddd);
			background: var(--nuxeo-box, #fff);
		}
		button,
		select,
		.image-button {
			border: 0;
			background: transparent;
			color: inherit;
			height: 28px;
			min-width: 28px;
			padding: 2px 5px;
			font: inherit;
		}
		button:hover,
		.image-button:hover {
			color: var(--nuxeo-primary-color, #0066cc);
		}
		button:focus-visible,
		select:focus-visible,
		.image-button:focus-within {
			outline: 2px solid var(--nuxeo-primary-color, #0066cc);
		}
		.image-button {
			position: relative;
			cursor: pointer;
			text-align: center;
		}
		.image-button input {
			position: absolute;
			inset: 0;
			width: 100%;
			opacity: 0;
			cursor: pointer;
		}
		.color-button {
			display: inline-flex;
			align-items: center;
			gap: 2px;
			cursor: pointer;
		}
		.color-button input {
			width: 20px;
			height: 22px;
			border: 0;
			padding: 0;
			background: transparent;
		}
		.image-results {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			max-height: 280px;
			overflow: auto;
			padding: 8px;
		}
		.image-results button {
			display: grid;
			gap: 4px;
			width: 110px;
			height: auto;
			overflow-wrap: anywhere;
		}
		.image-results img {
			width: 90px;
			height: 70px;
			object-fit: contain;
		}
		:host ::ng-deep .editor img,
		:host ::ng-deep .editor iframe {
			max-width: 100%;
		}
		.bold {
			font-weight: bold;
		}
		.italic {
			font-style: italic;
		}
		.underline {
			text-decoration: underline;
		}
		.strike {
			text-decoration: line-through;
		}
		.editor {
			min-height: calc(80vh - 170px);
			padding: 12px 15px;
			outline: 0;
			overflow-wrap: anywhere;
			font-size: 13px;
			line-height: 1.6;
		}
		.editor.empty::before,
		.editor:empty::before {
			content: attr(data-placeholder);
			color: var(--nuxeo-secondary-color, #6c757d);
			pointer-events: none;
		}
		.editor:focus {
			box-shadow: inset 0 0 0 1px var(--nuxeo-primary-color, #0066cc);
		}
		.link-editor {
			display: flex;
			gap: 8px;
			align-items: center;
			padding: 8px;
			flex-wrap: wrap;
		}
		.link-editor input {
			margin-inline-start: 8px;
			border: 1px solid var(--nuxeo-border, #ccc);
			padding: 4px;
		}
		p[role='alert'] {
			color: #b42318;
			padding: 8px;
		}
		button:disabled {
			opacity: 0.5;
		}
	`,
})
export class NoteRichtextEditorComponent implements OnChanges {
	private readonly uiLabels = injectUiMessages(RuntimeUiMessages);
	@Input() value = '';
	@Input() disabled = false;
	@Input() placeholder = '';
	@Output() valueChange = new EventEmitter<string>();
	@ViewChild('editor') editor?: ElementRef<HTMLElement>;
	private readonly sanitizer = inject(DomSanitizer);
	private readonly http = inject(HttpClient);
	private readonly cdr = inject(ChangeDetectorRef);
	private emitted?: string;
	private selection?: Range;
	html = '';
	linkOpen = false;
	private readonly linkErrorText = localizedText();
	get linkError(): string {
		return this.linkErrorText();
	}
	set linkError(value: string | MessageText) {
		this.linkErrorText.set(value);
	}
	imagesOpen = false;
	imagesLoading = false;
	private readonly imagesErrorText = localizedText();
	get imagesError(): string {
		return this.imagesErrorText();
	}
	set imagesError(value: string | MessageText) {
		this.imagesErrorText.set(value);
	}
	images: any[] = [];
	moreImages = false;
	imageSearch = '';
	private imagePage = 0;
	private imageRequest = 0;
	videoOpen = false;
	private readonly videoErrorText = localizedText();
	get videoError(): string {
		return this.videoErrorText();
	}
	set videoError(value: string | MessageText) {
		this.videoErrorText.set(value);
	}
	get controls() {
		return [
			{
				command: 'bold',
				label: this.uiLabels.text('app.labels.bold-94fee6', 'Bold'),
				text: 'B',
				className: 'bold',
			},
			{
				command: 'italic',
				label: this.uiLabels.text('app.labels.italic-9bf37c', 'Italic'),
				text: 'I',
				className: 'italic',
			},
			{
				command: 'underline',
				label: this.uiLabels.text('app.labels.underline-02f843', 'Underline'),
				text: 'U',
				className: 'underline',
			},
			{
				command: 'strikeThrough',
				label: this.uiLabels.text('app.labels.strikethrough-9aabbc', 'Strikethrough'),
				text: 'S',
				className: 'strike',
			},
			{
				command: 'formatBlock',
				value: 'blockquote',
				label: this.uiLabels.text('app.labels.block-quote-cb1946', 'Block quote'),
				text: '❞',
			},
			{
				command: 'formatBlock',
				value: 'pre',
				label: this.uiLabels.text('app.labels.code-block-754538', 'Code block'),
				text: '‹/›',
			},
			{
				command: 'outdent',
				label: this.uiLabels.text('app.labels.decrease-indent-88053f', 'Decrease indent'),
				text: '⇤',
			},
			{
				command: 'indent',
				label: this.uiLabels.text('app.labels.increase-indent-b80a5d', 'Increase indent'),
				text: '⇥',
			},
			{
				command: 'justifyLeft',
				label: this.uiLabels.text('app.labels.align-left-eac0f9', 'Align left'),
				text: '≡',
			},
			{
				command: 'justifyCenter',
				label: this.uiLabels.text('app.labels.align-center-e55c76', 'Align center'),
				text: '≡',
			},
			{
				command: 'justifyRight',
				label: this.uiLabels.text('app.labels.align-right-8f4f8e', 'Align right'),
				text: '≡',
			},
			{
				command: 'subscript',
				label: this.uiLabels.text('app.labels.subscript-cd512a', 'Subscript'),
				text: 'x₂',
			},
			{
				command: 'superscript',
				label: this.uiLabels.text('app.labels.superscript-31a0ba', 'Superscript'),
				text: 'x²',
			},
			{
				command: 'insertOrderedList',
				label: this.uiLabels.text('app.labels.numbered-list-cc62f6', 'Numbered list'),
				text: '1.',
			},
			{
				command: 'insertUnorderedList',
				label: this.uiLabels.text('app.labels.bulleted-list-ce51b3', 'Bulleted list'),
				text: '•',
			},
			{
				command: 'removeFormat',
				label: this.uiLabels.text('app.labels.clear-formatting-9e75ec', 'Clear formatting'),
				text: 'Tx',
			},
		];
	}
	ngOnChanges(): void {
		if (this.value !== this.emitted) {
			this.html = this.value;
			this.emitted = undefined;
		}
	}
	get isEmpty(): boolean {
		const current = this.emitted ?? this.html;
		return !current || !current.replace(/<br\s*\/?>/gi, '').trim();
	}
	format(command: string, value?: string): void {
		if (this.disabled || !this.editor) return;
		this.editor.nativeElement.focus();
		this.editor.nativeElement.ownerDocument.execCommand(command, false, value);
		this.changed();
	}
	changed(): void {
		const editor = this.editor?.nativeElement;
		if (!editor || this.disabled) return;
		// Preserve safe paragraph alignment without relying on inline style attributes.
		for (const node of Array.from(editor.querySelectorAll<HTMLElement>('[style]'))) {
			if (['left', 'center', 'right'].includes(node.style.textAlign))
				node.setAttribute('align', node.style.textAlign);
		}
		const raw = sanitizeNoteHtml(editor.innerHTML, this.sanitizer);
		const effectivelyEmpty =
			!editor.textContent?.trim() && /^(?:<(?:br|p|div)\s*\/?>|\s)*$/i.test(raw);
		if (effectivelyEmpty && editor.innerHTML) editor.innerHTML = '';
		this.emitted = effectivelyEmpty ? '' : raw;
		this.valueChange.emit(this.emitted);
	}
	paste(event: ClipboardEvent): void {
		if (this.disabled) return;
		event.preventDefault();
		const html = event.clipboardData?.getData('text/html');
		if (html) this.format('insertHTML', sanitizeNoteHtml(html, this.sanitizer));
		else this.format('insertText', event.clipboardData?.getData('text/plain') ?? '');
	}
	showLink(): void {
		this.rememberSelection();
		this.linkOpen = true;
		this.linkError = '';
	}
	rememberSelection(): void {
		const selection = this.editor?.nativeElement.ownerDocument.getSelection();
		const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
		if (range && this.editor?.nativeElement.contains(range.commonAncestorContainer))
			this.selection = range.cloneRange();
	}
	color(command: string, value: string): void {
		if (!/^#[\da-f]{6}$/i.test(value)) return;
		this.restoreSelection();
		this.format(command, value);
	}
	openImages(): void {
		this.rememberSelection();
		this.imagesOpen = true;
		this.linkOpen = this.videoOpen = false;
		void this.searchImages('');
	}
	async searchImages(query: string, more = false): Promise<void> {
		const request = ++this.imageRequest;
		this.imagesLoading = true;
		this.imagesError = '';
		if (!more) {
			this.imagePage = 0;
			this.images = [];
			this.moreImages = false;
			this.imageSearch = query.trim();
		}
		try {
			const result = await firstValueFrom(
				this.http.get<any>(`${environment.nuxeoUrl}/api/v1/search/pp/document_picker/execute`, {
					headers: { properties: 'dublincore,file' },
					params: {
						fulltext_all: this.imageSearch,
						pageSize: '40',
						currentPageIndex: String(this.imagePage),
					},
				}),
			);
			if (request !== this.imageRequest) return;
			this.imagePage++;
			this.moreImages = result.isNextPageAvailable === true;
			this.images = [
				...this.images,
				...(result.entries ?? []).filter(
					(doc: any) =>
						!doc?.isTrashed &&
						!doc?.isVersion &&
						!doc?.isProxy &&
						doc?.properties?.['file:content']?.data &&
						(
							doc?.properties?.['file:content']?.['mime-type'] ||
							doc?.properties?.['file:content']?.mimeType
						)?.startsWith('image/'),
				),
			];
			if (!this.images.length)
				this.imagesError = this.moreImages
					? messageText(
							'app.state.no-matching-images-on-this-page-load-more-ima-9fbfd6',
							'No matching images on this page. Load more images to continue.',
						)
					: messageText('app.state.no-matching-images-found-e070cd', 'No matching images found.');
		} catch {
			if (request === this.imageRequest)
				this.imagesError = messageText(
					'app.state.images-could-not-be-loaded-please-try-again-9f030e',
					'Images could not be loaded. Please try again.',
				);
		} finally {
			if (request === this.imageRequest) {
				this.imagesLoading = false;
				this.cdr.markForCheck();
			}
		}
	}
	insertRepositoryImage(document: any): void {
		const blob = document.properties?.['file:content'];
		if (!blob?.data || !(blob['mime-type'] || blob.mimeType)?.startsWith('image/')) return;
		this.restoreSelection();
		this.format('insertImage', blob.data);
		this.imagesOpen = false;
	}
	openVideo(): void {
		this.rememberSelection();
		this.videoOpen = true;
		this.linkOpen = this.imagesOpen = false;
		this.videoError = '';
	}
	insertVideo(value: string): void {
		const url = noteVideoUrl(value);
		if (!url) {
			this.videoError = messageText(
				'app.state.enter-a-youtube-or-vimeo-https-video-url-6cc690',
				'Enter a YouTube or Vimeo HTTPS video URL.',
			);
			return;
		}
		this.restoreSelection();
		this.format('insertHTML', sanitizeNoteHtml(`<iframe src="${url}"></iframe>`, this.sanitizer));
		this.videoOpen = false;
	}
	insertLink(value: string): void {
		if (!/^(https?:|mailto:)/i.test(value.trim())) {
			this.linkError = messageText(
				'app.state.enter-an-https-http-or-email-link-50abcc',
				'Enter an https, http or email link.',
			);
			return;
		}
		this.restoreSelection();
		this.format('createLink', value.trim());
		this.linkOpen = false;
	}
	insertImage(event: Event): void {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file?.type.startsWith('image/') || this.disabled) return;
		const reader = new FileReader();
		reader.onload = () => {
			this.restoreSelection();
			this.format('insertImage', String(reader.result));
			input.value = '';
		};
		reader.readAsDataURL(file);
	}
	private restoreSelection(): void {
		const selection = this.editor?.nativeElement.ownerDocument.getSelection();
		if (selection && this.selection) {
			selection.removeAllRanges();
			selection.addRange(this.selection);
		}
	}
}
