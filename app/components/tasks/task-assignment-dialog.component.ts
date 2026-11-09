import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	DestroyRef,
	inject,
	ViewEncapsulation,
} from '@angular/core';
import {
	provideSuggestionScope,
	suggestionLimits,
	WebUiIconComponent,
	WebUiMessagePipe,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { BsModalRef, ModalOptions } from 'ngx-bootstrap/modal';
import { Subject, Subscription, switchMap, timer } from 'rxjs';
import { UsersAndGroupsFinderService } from 'app/helpers/users-and-groups-finder.service';
import { TaskAssignmentAction, WorkflowsService } from 'app/helpers/workflows.service';

/** A UserGroup.Suggestion entry. */
export interface PrincipalSuggestion {
	readonly id: string;
	readonly type?: string;
	readonly displayLabel?: string;
	readonly email?: string;
}

let taskAssignmentSequence = 0;

/**
 * Stock nuxeo-document-task-assignment-popup: the task name, a required multiple user/group
 * suggestion, an optional comment, Close and Reassign/Delegate. Submitting sends one PUT
 * `/task/{id}/{reassign|delegate}` and closes; the page then reloads the task.
 */
@Component({
	selector: 'nx-task-assignment-dialog',
	imports: [WebUiMessagePipe, WebUiIconComponent],
	providers: [provideSuggestionScope('maretha.dialog.task-assignment')],
	changeDetection: ChangeDetectionStrategy.OnPush,
	encapsulation: ViewEncapsulation.None,
	host: { class: 'nx-task-assignment' },
	template: `
		<h2 [id]="titleId">{{ label(task?.name) }}</h2>
		<div class="nx-task-assignment__content">
			<div class="nx-task-assignment__field">
				<label
					class="nx-task-assignment__label nx-task-assignment__label--required"
					[for]="inputId"
					>{{ 'tasks.assignment.userOrGroup' | webuiMessage: 'Choose the user' }}</label
				>
				<div class="nx-task-assignment__selectivity" [class.focused]="focused">
					@for (entry of selected; track entry.id) {
						<span class="nx-task-assignment__chip" [class.highlighted]="$last && chipHighlighted"
							><button
								type="button"
								[attr.aria-label]="'command.remove' | webuiMessage: 'Remove'"
								(click)="remove(entry)"
							>
								×</button
							>{{ entry.displayLabel || entry.id }}</span
						>
					}
					<input
						type="text"
						autocomplete="off"
						role="combobox"
						aria-autocomplete="list"
						[attr.aria-controls]="listboxId"
						[attr.aria-expanded]="focused"
						[attr.aria-activedescendant]="
							status === 'results' && highlighted >= 0 ? listboxId + '-' + highlighted : null
						"
						[id]="inputId"
						[value]="term"
						[attr.placeholder]="
							selected.length ? null : ('tasks.assignment.placeholder' | webuiMessage: 'Type here')
						"
						[attr.aria-invalid]="invalid"
						(focus)="open()"
						(blur)="focused = false"
						(input)="search($any($event.target).value)"
						(keydown)="keydown($event)"
					/>
				</div>
				@if (focused) {
					<div class="nx-task-assignment__dropdown" role="listbox" [id]="listboxId">
						@switch (status) {
							@case ('minChars') {
								<div class="nx-task-assignment__message">
									{{
										'selectivity.minChars'
											| webuiMessage: 'Please enter {0} or more characters' : minChars
									}}
								</div>
							}
							@case ('loading') {
								<div class="nx-task-assignment__message" aria-live="polite">
									{{ 'selectivity.loading' | webuiMessage: 'Loading...' }}
								</div>
							}
							@case ('empty') {
								<div class="nx-task-assignment__message" aria-live="polite">
									{{ messageBefore('selectivity.noResultsForTerm', 'No results for {0}')
									}}<b>{{ term }}</b
									>{{ messageAfter('selectivity.noResultsForTerm', 'No results for {0}') }}
								</div>
							}
							@case ('error') {
								<div class="nx-task-assignment__message" aria-live="polite">
									{{
										messageBefore(
											'selectivity.failedFetchResultsForTerm',
											'Failed to fetch results for {0}'
										)
									}}<b>{{ term }}</b
									>{{
										messageAfter(
											'selectivity.failedFetchResultsForTerm',
											'Failed to fetch results for {0}'
										)
									}}
								</div>
							}
							@case ('results') {
								@for (entry of results; track entry.id; let index = $index) {
									<div
										class="nx-task-assignment__result"
										role="option"
										tabindex="-1"
										[id]="listboxId + '-' + index"
										[class.highlight]="index === highlighted"
										[attr.aria-selected]="index === highlighted"
										(mousedown)="$event.preventDefault()"
										(mouseenter)="highlighted = index"
										(click)="choose(entry)"
										(keydown.enter)="choose(entry)"
									>
										@if (entry.type === 'GROUP_TYPE') {
											<nx-webui-icon name="nuxeo:group" />
										} @else {
											<span
												class="nx-task-assignment__avatar"
												[style.background-color]="avatarColor(entry)"
												aria-hidden="true"
												>{{ initials(entry) }}</span
											>
										}
										<span class="nx-task-assignment__entity">
											<span class="nx-task-assignment__entity-label">{{ entry.displayLabel }}</span>
											<span>{{
												entry.type === 'GROUP_TYPE'
													? ('label.group' | webuiMessage: 'Group') + ' - ' + entry.id
													: entry.email + ' - ' + entry.id
											}}</span>
										</span>
									</div>
								}
							}
						}
					</div>
				}
			</div>
			<div class="nx-task-assignment__field">
				<label class="nx-task-assignment__label" [for]="commentId">{{
					'tasks.assignment.comment' | webuiMessage: 'Include a comment'
				}}</label>
				<textarea
					rows="1"
					[id]="commentId"
					[value]="comment"
					[attr.placeholder]="'tasks.assignment.placeholder' | webuiMessage: 'Type here'"
					(input)="comment = $any($event.target).value"
				></textarea>
			</div>
		</div>
		<div class="nx-task-assignment__buttons">
			<button type="button" class="nx-task-assignment__secondary" (click)="close()">
				{{ 'command.close' | webuiMessage: 'Close' }}
			</button>
			<button
				type="button"
				class="nx-task-assignment__primary"
				[disabled]="working"
				(click)="submit()"
			>
				{{ actionLabel() }}
			</button>
		</div>
	`,
	styles: `
		.modal-dialog.nx-task-assignment-dialog {
			width: max-content;
			min-width: 480px;
			max-width: calc(100vw - 80px);
			margin: 24px auto;

			> .modal-content {
				border: 0;
				border-radius: 0;
				color: var(--nuxeo-text-default);
				background: var(--nuxeo-box, #fff);
				font-family: var(--nuxeo-app-font);
				font-size: 13px;
				line-height: 20px;
				box-shadow:
					0 16px 24px 2px #00000024,
					0 6px 30px 5px #0000001f,
					0 8px 10px -5px #0006;
			}
		}
		@media (max-width: 1024px) {
			.modal-dialog.nx-task-assignment-dialog {
				min-width: 0;
				width: 90%;
			}
		}
		body:has(modal-container > .nx-task-assignment-dialog) > .modal-backdrop {
			opacity: 0.6;
		}
		.nx-task-assignment {
			display: block;
		}
		.nx-task-assignment h2 {
			margin: 24px 0 0;
			padding: 0 24px;
			color: inherit;
			font-size: 27.95px;
			font-weight: 400;
			line-height: 36px;
			letter-spacing: 0;
		}
		.nx-task-assignment__content {
			margin-top: 16px;
			padding: 0 24px;
		}
		.nx-task-assignment__field {
			position: relative;
			margin-bottom: 16px;
		}
		.nx-task-assignment__label {
			display: block;
			overflow: hidden;
			opacity: 0.9;
			font-weight: 400;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.nx-task-assignment__label--required::after {
			display: inline-block;
			content: '*';
			margin-left: 4px;
			color: var(--paper-input-container-invalid-color, #de350b);
		}
		.nx-task-assignment__selectivity {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			min-height: 26px;
			padding-top: 5px;
			border-bottom: 1px solid #3a3a54;
			cursor: text;
		}
		.nx-task-assignment__selectivity.focused {
			border-bottom: 2px solid var(--nuxeo-primary-color, #0066ff);
		}
		.nx-task-assignment__selectivity input {
			flex: 1 1 80px;
			min-width: 80px;
			padding: 1px 0 0;
			border: 0;
			outline: 0;
			background: transparent;
			color: var(--nuxeo-text-default, #3a3a54);
			font: inherit;
		}
		.nx-task-assignment__selectivity input::placeholder {
			color: #606978;
		}
		.nx-task-assignment__chip {
			display: inline-block;
			margin: 2px 2px 3.12px;
			padding: 2.6px 6.5px;
			border-radius: 2em;
			background: var(--nuxeo-tag-background, #fff);
			color: var(--nuxeo-tag-text, inherit);
			font-size: 10.4px;
			letter-spacing: 0.02em;
			line-height: 13px;
			white-space: nowrap;
			user-select: none;
		}
		.nx-task-assignment__chip.highlighted {
			background-color: #ccc;
		}
		.nx-task-assignment__chip button {
			margin-inline-start: -5px;
			padding: 5px;
			border: 0;
			background: transparent;
			color: #000;
			cursor: pointer;
		}
		.nx-task-assignment__dropdown {
			position: absolute;
			inset-inline: 0;
			z-index: 10;
			max-height: 28em;
			overflow: auto;
			border-radius: 4px;
			background: var(--nuxeo-dropdown-list-background, #fff);
			box-shadow:
				0 1px 5px 1px rgba(0, 0, 0, 0.15),
				0 10px 16px 0 rgba(0, 0, 0, 0.2);
		}
		.nx-task-assignment__message,
		.nx-task-assignment__result {
			padding: 7px;
		}
		.nx-task-assignment__result {
			display: flex;
			align-items: center;
			font-size: 11px;
			line-height: 14px;
			cursor: pointer;
			--webui-icon-size: 24px;
		}
		.nx-task-assignment__result.highlight {
			background: var(--nuxeo-primary-color);
			color: #fff;
		}
		.nx-task-assignment__result > nx-webui-icon,
		.nx-task-assignment__avatar {
			flex: none;
			margin-right: 8px;
		}
		.nx-task-assignment__avatar {
			display: inline-grid;
			place-items: center;
			width: 24px;
			height: 24px;
			border-radius: 50%;
			color: #fff;
			font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
			font-size: 11px;
		}
		.nx-task-assignment__entity {
			display: flex;
			flex-direction: column;
			white-space: pre;
		}
		.nx-task-assignment__entity-label {
			font-weight: 700;
		}
		.nx-task-assignment textarea {
			display: block;
			box-sizing: border-box;
			width: 100%;
			max-height: calc(4 * 20px + 8px);
			padding: 4px 0;
			border: 0;
			border-bottom: 1px solid var(--nuxeo-text-default, #3a3a54);
			border-radius: 0;
			outline: 0;
			background: transparent;
			color: inherit;
			font: inherit;
			resize: none;
			field-sizing: content;
		}
		.nx-task-assignment textarea:focus {
			border-bottom: 2px solid var(--nuxeo-primary-color, #0066ff);
		}
		.nx-task-assignment__buttons {
			display: flex;
			justify-content: space-between;
			margin-top: 16px;
			padding: 8px 8px 8px 24px;
		}
		.nx-task-assignment__buttons button {
			min-width: 96px;
			min-height: 40px;
			margin: 0;
			padding: 8px 16px;
			border-radius: 0.1em;
			font-family: var(--nuxeo-app-font);
			font-size: 13px;
			font-weight: 600;
			text-transform: capitalize;
			cursor: pointer;
		}
		.nx-task-assignment__secondary {
			border: 1px solid var(--nuxeo-button-secondary-text, #0066ff);
			background-color: transparent;
			color: var(--nuxeo-button-secondary-text, #0066ff);
		}
		.nx-task-assignment__secondary:hover,
		.nx-task-assignment__secondary:focus-visible {
			border-color: var(--nuxeo-secondary-color, #1f28bf);
			color: var(--nuxeo-secondary-color, #1f28bf);
		}
		.nx-task-assignment__primary {
			border: 1px solid var(--nuxeo-primary-color, #0066ff);
			background-color: var(--nuxeo-button-primary, #0066ff);
			color: var(--nuxeo-button-primary-text, #fff);
		}
		.nx-task-assignment__primary:hover,
		.nx-task-assignment__primary:focus-visible {
			border-color: var(--nuxeo-button-primary-focus, #1f28bf);
			background-color: var(--nuxeo-button-primary-focus, #1f28bf);
		}
		.nx-task-assignment__primary:disabled {
			border-color: transparent;
			background-color: var(--nuxeo-button-disabled, rgba(0, 0, 0, 0.05));
			color: var(--nuxeo-button-disabled-text, rgba(0, 0, 0, 0.1));
			cursor: default;
		}
	`,
})
export class TaskAssignmentDialogComponent {
	private readonly modal = inject(BsModalRef);
	private readonly messages = inject(WebUiMessages);
	private readonly finder = inject(UsersAndGroupsFinderService);
	private readonly workflows = inject(WorkflowsService);
	private readonly cdr = inject(ChangeDetectorRef);
	private readonly sequence = ++taskAssignmentSequence;
	private query?: Subscription;
	readonly titleId = `task-assignment-title-${this.sequence}`;
	readonly inputId = `task-assignment-user-${this.sequence}`;
	readonly commentId = `task-assignment-comment-${this.sequence}`;
	readonly listboxId = `task-assignment-results-${this.sequence}`;
	/** nuxeo-user-suggestion `minChars` and nuxeo-selectivity `frequency`, from the settings. */
	readonly limits = suggestionLimits('user');
	get minChars(): number {
		return this.limits().minChars;
	}
	/** Set through the modal's initial state. */
	task: any = null;
	action: TaskAssignmentAction = 'delegate';
	/** The task returned by the server once the assignment succeeded. */
	readonly assigned = new Subject<unknown>();
	selected: PrincipalSuggestion[] = [];
	results: PrincipalSuggestion[] = [];
	status: 'minChars' | 'loading' | 'empty' | 'error' | 'results' = 'minChars';
	term = '';
	comment = '';
	focused = false;
	invalid = false;
	working = false;
	/** The highlighted suggestion (arrow keys, pointer), as in nuxeo-selectivity. */
	highlighted = -1;
	/** Backspace in an empty field highlights the last entry before removing it (stock option). */
	chipHighlighted = false;

	constructor() {
		inject(DestroyRef).onDestroy(() => {
			this.query?.unsubscribe();
			this.assigned.complete();
		});
	}

	/** Stock `i18n(key)`: the task name's message, else the name. */
	label(value: unknown): string {
		return typeof value === 'string' && value ? this.messages.text(value, value) : '';
	}

	/** Stock `i18n('tasks.' + action)`. */
	actionLabel(): string {
		return this.action === 'reassign'
			? this.messages.text('tasks.reassign', 'Reassign')
			: this.messages.text('tasks.delegate', 'Delegate');
	}

	/** The text before and after `{0}` of a suggestion message, which shows the term in bold. */
	messageBefore(key: string, fallback: string): string {
		return this.messages.text(key, fallback).split('{0}')[0];
	}
	messageAfter(key: string, fallback: string): string {
		return this.messages.text(key, fallback).split('{0}').slice(1).join('{0}');
	}

	open(): void {
		this.focused = true;
		if (this.term.trim().length < this.minChars) this.status = 'minChars';
		else if (this.status === 'minChars') this.search(this.term);
	}

	/**
	 * Stock nuxeo-selectivity query: under `minChars` it only asks for more characters; otherwise
	 * one UserGroup.Suggestion request once typing has paused for `pauseMs`, replacing any
	 * pending or running one.
	 */
	search(term: string): void {
		this.term = term;
		this.focused = true;
		this.chipHighlighted = false;
		this.query?.unsubscribe();
		this.results = [];
		this.highlighted = -1;
		const { minChars, pauseMs } = this.limits();
		if (term.trim().length < minChars) {
			this.status = 'minChars';
			return;
		}
		this.status = 'loading';
		this.query = timer(pauseMs)
			.pipe(switchMap(() => this.finder.find(term)))
			.subscribe({
				next: (entries) => {
					const chosen = new Set(this.selected.map((entry) => entry.id));
					this.results = (Array.isArray(entries) ? (entries as PrincipalSuggestion[]) : []).filter(
						(entry) => entry?.id && !chosen.has(entry.id),
					);
					this.status = this.results.length ? 'results' : 'empty';
					this.highlighted = this.results.length ? 0 : -1;
					this.cdr.markForCheck();
				},
				error: () => {
					this.status = 'error';
					this.cdr.markForCheck();
				},
			});
	}

	/** Adds the entry and closes the dropdown (nuxeo-selectivity without `stayOpenOnSelect`). */
	choose(entry: PrincipalSuggestion): void {
		if (!this.selected.some((item) => item.id === entry.id))
			this.selected = [...this.selected, entry];
		this.invalid = false;
		this.term = '';
		this.results = [];
		this.highlighted = -1;
		this.status = 'minChars';
		this.focused = false;
	}

	/** nuxeo-selectivity keys: arrows move the highlight, Enter chooses it, Backspace removes. */
	keydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			if (!this.results.length) return;
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			this.highlighted = Math.min(this.results.length - 1, Math.max(0, this.highlighted + step));
		} else if (event.key === 'Enter') {
			const entry = this.results[this.highlighted];
			if (!entry) return;
			event.preventDefault();
			this.choose(entry);
		} else if (event.key === 'Backspace' && !this.term && this.selected.length) {
			event.preventDefault();
			if (this.chipHighlighted) {
				this.selected = this.selected.slice(0, -1);
				this.chipHighlighted = false;
			} else this.chipHighlighted = true;
		} else this.chipHighlighted = false;
	}

	remove(entry: PrincipalSuggestion): void {
		this.selected = this.selected.filter((item) => item.id !== entry.id);
	}

	/** Stock nuxeo-user-avatar initials for a suggestion entry: from its id. */
	initials(entry: PrincipalSuggestion): string {
		const parts = String(entry.id ?? '')
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (!parts.length || !/[a-z0-9]/i.test(parts[0].charAt(0))) return '';
		return parts.length <= 1
			? parts[0].charAt(0)
			: `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`;
	}

	/** Stock nuxeo-user-avatar background: a hue hashed from the id. */
	avatarColor(entry: PrincipalSuggestion): string {
		let hash = 0;
		const id = String(entry.id ?? '');
		for (let index = 0; index < id.length; index++) {
			hash &= hash;
			hash = id.charCodeAt(index) + ((hash << 5) - hash);
		}
		return `hsl(${Math.abs(hash % 360)}, 70%, 42%)`;
	}

	close(): void {
		this.modal.hide();
	}

	/** Stock `_processAssignment`: the required users/groups, then one PUT; the dialog closes on success. */
	submit(): void {
		if (this.working || !this.task?.id) return;
		if (!this.selected.length) {
			this.invalid = true;
			return;
		}
		this.working = true;
		this.workflows
			.assignTask(
				this.task.id,
				this.action,
				this.selected.map((entry) => entry.id),
				this.comment,
			)
			.subscribe({
				next: (task) => {
					this.modal.hide();
					this.assigned.next(task);
				},
				error: () => {
					this.working = false;
					this.cdr.markForCheck();
				},
			});
	}
}

/** Modal options for the stock assignment dialog. */
export function taskAssignmentDialogOptions(
	task: unknown,
	action: TaskAssignmentAction,
): ModalOptions<TaskAssignmentDialogComponent> {
	return {
		class: 'nx-task-assignment-dialog',
		keyboard: true,
		ignoreBackdropClick: false,
		initialState: { task, action },
	};
}
