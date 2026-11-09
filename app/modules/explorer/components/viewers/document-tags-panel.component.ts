import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import {
	suggestionLimits,
	suggestionMinCharsText,
	WebUiMessagePipe,
	WebUiMessages,
} from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	Input,
	OnDestroy,
	inject,
	viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgSelectComponent, NgSelectModule } from '@ng-select/ng-select';
import { Subscription, timer, switchMap } from 'rxjs';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';

let nextTagInputId = 0;

@Component({
	selector: 'nx-document-tags-panel',
	standalone: true,
	imports: [FormsModule, NgSelectModule, WebUiMessagePipe],
	template: `@if (visible) {
		<section class="tags-panel">
			<h5>{{ 'app.modules.document-tags-panel.tags-37b901' | webuiMessage: 'Tags' }}</h5>
			<div class="tags">
				@for (tag of tags; track tag) {
					<span class="tag-chip">
						<span class="tag-label">{{ tag }}</span>
						@if (editable) {
							<button
								type="button"
								[disabled]="busy"
								[attr.aria-label]="
									'action.removeNamed' | webuiMessage: 'Remove {name}' : { name: tag }
								"
								(click)="remove(tag)"
							>
								<span aria-hidden="true">×</span>
							</button>
						}
					</span>
				}
			</div>
			@if (editable) {
				<ng-select
					class="tag-picker"
					[labelForId]="suggestionsId"
					[ngModel]="newTag || null"
					(ngModelChange)="selectTag($event)"
					[items]="suggestions"
					bindLabel="label"
					bindValue="id"
					[addTag]="createTagOption"
					[clearable]="false"
					[disabled]="busy"
					[loading]="searching"
					[markFirst]="false"
					[clearSearchOnAdd]="true"
					[keyDownFn]="commitOnEnter"
					(search)="searchTags($event.term)"
					(close)="clearSuggestions()"
					[attr.placeholder]="
						'app.modules.document-tags-panel.search-or-create-a-tag-95dc77'
							| webuiMessage: 'Search or create a tag…'
					"
					[notFoundText]="
						'app.modules.document-tags-panel.type-to-create-a-tag-ee4943'
							| webuiMessage: 'Type to create a tag'
					"
					[attr.aria-busy]="busy"
				>
					<ng-template ng-option-tmp let-item="item">
						<span class="tag-option-label">{{ item.label }}</span
						><small>{{
							'app.modules.document-tags-panel.existing-tag-dd78d9' | webuiMessage: 'Existing tag'
						}}</small>
					</ng-template>
					<ng-template ng-tag-tmp let-search="searchTerm">
						<span class="create-tag"
							><span aria-hidden="true">＋</span>
							{{ 'app.modules.document-tags-panel.create-tag-0e4d76' | webuiMessage: 'Create tag' }}
							<strong>“{{ search }}”</strong></span
						>
					</ng-template>
				</ng-select>
				<label class="visually-hidden" [for]="suggestionsId">{{
					'app.modules.document-tags-panel.search-or-create-a-tag-6a452c'
						| webuiMessage: 'Search or create a tag'
				}}</label>
				@if (suggestionsMessage) {
					<p class="tag-status" role="status">{{ suggestionsMessage }}</p>
				}
			}
			@if (error) {
				<p class="text-danger small mb-0" role="alert">{{ error }}</p>
			}
		</section>
	}`,
	styles: [
		`
			:host {
				display: block;
				min-width: 0;
			}
			h5 {
				margin: 0 0 10px;
				font-size: 13px;
				font-weight: 600;
				color: var(--nuxeo-text-default);
			}
			.tags {
				display: flex;
				flex-wrap: wrap;
				gap: 6px;
			}
			.tags:not(:empty) {
				margin-bottom: 10px;
			}
			.tag-chip {
				display: inline-flex;
				align-items: center;
				gap: 5px;
				max-width: 100%;
				min-height: 26px;
				padding: 2px 6px 2px 10px;
				border-radius: 4px;
				background: var(--nuxeo-hover-background, #f1f3f5);
				color: var(--nuxeo-text-default);
				font-size: 12px;
				font-weight: 400;
			}
			.tag-label {
				overflow-wrap: anywhere;
			}
			.tag-chip button {
				flex: 0 0 22px;
				width: 22px;
				height: 22px;
				padding: 0;
				border: 0;
				border-radius: 3px;
				background: transparent;
				color: var(--bs-secondary-color);
				font-size: 18px;
				line-height: 1;
			}
			.tag-chip button:hover {
				background: #0000000a;
				color: var(--nuxeo-text-default);
			}
			.tag-chip button:focus-visible {
				outline: 2px solid var(--nuxeo-primary-color, #06f);
				outline-offset: 1px;
			}
			.tag-status {
				font-size: 12px;
				color: var(--bs-secondary-color);
				margin: 6px 0 0;
			}
			.tag-option-label {
				overflow-wrap: anywhere;
			}
			small {
				color: var(--bs-secondary-color);
				font-size: 11px;
				margin-inline-start: auto;
				white-space: nowrap;
			}
			.create-tag {
				display: flex;
				align-items: baseline;
				gap: 6px;
				white-space: normal;
				overflow-wrap: anywhere;
			}
			.create-tag strong {
				font-weight: 500;
			}
			:host ::ng-deep .tag-picker.ng-select .ng-select-container {
				min-height: 36px;
				height: 36px;
				background: var(--nuxeo-box, #fff);
				border: 1px solid var(--nuxeo-border, #dce0e5);
				border-radius: 4px;
				font-size: 13px;
				box-shadow: none;
			}
			:host ::ng-deep .tag-picker.ng-select.ng-select-focused .ng-select-container {
				border-color: var(--nuxeo-primary-color, #06f);
				box-shadow: 0 0 0 2px #0066ff12;
			}
			:host ::ng-deep .tag-picker .ng-placeholder {
				color: var(--bs-secondary-color);
			}
			:host ::ng-deep .tag-picker .ng-input > input {
				font-size: 13px;
				border: 0;
				outline: none;
				padding: 0;
				color: var(--nuxeo-text-default);
				box-shadow: none;
			}
			:host ::ng-deep .tag-picker .ng-dropdown-panel {
				margin-top: 4px;
				border: 1px solid var(--nuxeo-border, #dce0e5);
				border-radius: 5px;
				box-shadow: 0 6px 18px #00000014;
				overflow: hidden;
				background: var(--nuxeo-box, #fff);
			}
			:host ::ng-deep .tag-picker .ng-dropdown-panel .ng-option {
				display: flex;
				align-items: center;
				gap: 12px;
				padding: 10px 12px;
				font-size: 13px;
				color: var(--nuxeo-text-default);
				background: var(--nuxeo-box, #fff);
				white-space: normal;
			}
			:host ::ng-deep .tag-picker .ng-dropdown-panel .ng-option-marked {
				background: var(--nuxeo-hover-background, #f3f6fa);
			}
			:host ::ng-deep .tag-picker .ng-option.ng-tag {
				border-top: 1px solid var(--nuxeo-border, #e8ebee);
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentTagsPanelComponent implements OnDestroy {
	private current: any;
	private request?: Subscription;
	private suggestionRequest?: Subscription;
	readonly suggestionsId = `document-tag-suggestions-${nextTagInputId++}`;
	suggestions: { id: string; label: string }[] = [];
	private readonly suggestionsMessageText = localizedText();
	get suggestionsMessage(): string {
		return this.suggestionsMessageText();
	}
	set suggestionsMessage(value: string | MessageText) {
		this.suggestionsMessageText.set(value);
	}
	searching = false;
	/** Stock nuxeo-tag-suggestion: min-chars 1, then the selectivity pause (suggestions.json). */
	private readonly limits = suggestionLimits('tag', () => 'nxtag:tags');
	private readonly messages = inject(WebUiMessages);
	readonly createTagOption = (term: string) => ({ id: term.trim(), label: term.trim() });
	private readonly picker = viewChild(NgSelectComponent);
	/**
	 * Stock: Enter attaches the typed tag at once. ng-select ignores Enter while suggestions load and
	 * when the text names a suggested tag, so the typed text is committed here (a suggested tag by
	 * its id); a suggestion highlighted with the arrow keys still takes Enter itself.
	 */
	readonly commitOnEnter = (event: KeyboardEvent): boolean => {
		const picker = this.picker();
		const marked = picker?.itemsList.markedItem;
		if (event.key !== 'Enter' || event.isComposing || !picker || (marked && !marked.selected))
			return true;
		const term = picker.searchTerm?.trim();
		if (!term) return true;
		event.preventDefault();
		const suggested =
			marked?.value ??
			this.suggestions.find((tag) => tag.label.toLowerCase() === term.toLowerCase());
		// Keep a labeled selection while the write is pending or fails, just like a clicked option.
		// ng-select auto-marks its selected value; a fresh option lets Enter retry that failed value.
		picker.select(picker.itemsList.addItem(suggested ?? this.createTagOption(term)));
		return false;
	};
	selectTag(tag: string | null): void {
		if (!tag) return;
		this.newTag = tag;
		this.add();
	}
	private epoch = 0;
	private identity?: string;
	@Input() noEdit = false;
	@Input() set document(value: any) {
		const identity = value ? `${value.repository ?? value.uid}:${value.uid}` : undefined;
		if (this.identity !== identity || this.busy) this.newTag = '';
		this.clearSuggestions();
		this.identity = identity;
		this.current = value;
		this.epoch++;
		this.request?.unsubscribe();
		this.busy = false;
		this.error = null;
	}
	newTag = '';
	busy = false;
	private readonly errorMessageState = localizedText(null);
	get error(): string | null {
		return this.errorMessageState();
	}
	set error(value: string | null | MessageText) {
		this.errorMessageState.set(value);
	}
	private readonly documents = inject(DocumentsManagerService);
	private readonly cdr = inject(ChangeDetectorRef);
	get visible(): boolean {
		return Array.isArray(this.current?.facets) && this.current.facets.includes('NXTag');
	}
	get editable(): boolean {
		const permissions =
			this.current?.contextParameters?.permissions ?? this.current?.permissions ?? [];
		return (
			this.visible &&
			!this.noEdit &&
			Array.isArray(permissions) &&
			permissions.some((permission) =>
				['WriteProperties', 'Write', 'ReadWrite'].includes(permission),
			) &&
			!this.current?.isTrashed &&
			!this.current?.isRecord &&
			!this.current?.retainUntil &&
			!this.current?.isUnderRetentionOrLegalHold
		);
	}
	get tags(): string[] {
		const values =
			this.current?.contextParameters?.tags ?? this.current?.properties?.['nxtag:tags'];
		return Array.isArray(values)
			? values
					.map((value: any) => (typeof value === 'string' ? value : (value?.label ?? value?.id)))
					.filter(Boolean)
			: [];
	}
	searchTags(value: string): void {
		this.clearSuggestions();
		const term = value.trim();
		if (!term || !this.editable) return;
		const { minChars, pauseMs } = this.limits();
		if (term.length < minChars) {
			this.suggestionsMessage = suggestionMinCharsText(this.messages, minChars);
			return;
		}
		this.searching = true;
		this.suggestionRequest = timer(pauseMs)
			.pipe(switchMap(() => this.documents.suggestTag(term)))
			.subscribe({
				next: (response: any) => {
					const attached = new Set(this.tags);
					const unique = new Map<string, { id: string; label: string }>();
					for (const tag of Array.isArray(response) ? response : []) {
						const id = typeof tag === 'string' ? tag : tag?.id;
						if (typeof id === 'string' && !attached.has(id))
							unique.set(id, { id, label: tag?.displayLabel || id });
					}
					this.suggestions = [...unique.values()];
					this.searching = false;
					this.suggestionsMessage = '';
					this.cdr.markForCheck();
				},
				error: () => {
					this.searching = false;
					this.suggestionsMessage = messageText(
						'app.state.suggestions-are-unavailable-you-can-still-add-859857',
						'Suggestions are unavailable. You can still add a new tag.',
					);
					this.cdr.markForCheck();
				},
			});
	}
	clearSuggestions(): void {
		this.searching = false;
		this.suggestionRequest?.unsubscribe();
		this.suggestions = [];
		this.suggestionsMessage = '';
	}
	add(): void {
		const tag = this.newTag.trim();
		if (!tag || !this.editable || this.busy) return;
		if (this.tags.includes(tag)) {
			this.newTag = '';
			this.clearSuggestions();
			return;
		}
		this.clearSuggestions();
		this.run(this.documents.addTag(this.current.uid, [tag]), () => (this.newTag = ''));
	}
	remove(tag: string): void {
		if (!this.editable || this.busy) return;
		this.run(this.documents.removeTag(this.current.uid, tag));
	}
	private run(request: any, success?: () => void): void {
		const epoch = this.epoch;
		this.busy = true;
		this.error = null;
		this.request = request.subscribe({
			next: (document: any) => {
				if (epoch !== this.epoch) return;
				if (
					document?.uid === this.current?.uid &&
					(document.repository ?? 'default') === (this.current?.repository ?? 'default')
				)
					this.current = document;
				success?.();
				this.cdr.markForCheck();
			},
			error: () => {
				if (epoch === this.epoch) {
					this.busy = false;
					this.error = messageText(
						'app.state.tags-could-not-be-updated-3e7d4f',
						'Tags could not be updated.',
					);
					this.cdr.markForCheck();
				}
			},
			complete: () => {
				if (epoch === this.epoch) {
					this.busy = false;
					this.cdr.markForCheck();
				}
			},
		});
	}
	ngOnDestroy(): void {
		this.clearSuggestions();
		this.epoch++;
		this.request?.unsubscribe();
	}
}
