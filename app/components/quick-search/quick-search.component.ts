import { localizedMessage } from 'app/helpers/localized-message';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	ElementRef,
	inject,
	input,
	signal,
	viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, of, switchMap, timer } from 'rxjs';
import {
	ExtensionRegistry,
	QuickSearchContext,
	ShellActionContext,
	WebUiIconComponent,
	WebUiMessagePipe,
	WebUiSlotComponent,
} from '@maretha/webui-sdk';
import { QuickSearchService, SearchSuggestion } from './quick-search.service';
import { documentUrl } from 'app/helpers/document-route';
@Component({
	selector: 'nx-quick-search',
	imports: [WebUiIconComponent, WebUiMessagePipe, WebUiSlotComponent],
	templateUrl: './quick-search.component.html',
	styleUrls: ['./quick-search.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickSearchComponent {
	readonly context = input.required<ShellActionContext>();
	readonly open = signal(false);
	readonly typeKeys = {
		document: 'app.components.tasks-page.document',
		user: 'app.components.principal-page.user',
		group: 'app.components.principal-page.group',
	};
	readonly activeId = signal('');
	readonly term = signal('');
	readonly loading = signal(false);
	private readonly errorMessage = localizedMessage();
	readonly error = this.errorMessage.text;
	readonly items = signal<readonly SearchSuggestion[]>([]);
	readonly navigating = signal(false);
	private readonly service = inject(QuickSearchService);
	private readonly registry = inject(ExtensionRegistry);
	private readonly query = new Subject<string>();
	readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
	private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
	readonly commandContext = computed<QuickSearchContext>(() => ({
		...this.context(),
		searchTerm: this.term(),
		close: () => this.close(),
	}));
	readonly commandCount = computed(
		() => this.registry.resolve('QUICK_SEARCH_ACTIONS', this.commandContext()).items.length,
	);
	private lastUser: string | undefined;
	constructor() {
		effect(() => {
			const user = this.context().user?.id;
			if (user !== this.lastUser) {
				this.lastUser = user;
				this.close();
			}
		});
		this.query
			.pipe(
				switchMap((term) => {
					this.items.set([]);
					this.errorMessage.clear();
					this.loading.set(!!term);
					return term
						? timer(500).pipe(
								switchMap(() => this.service.search(term)),
								catchError(() => {
									this.errorMessage.set(
										'app.components.quick-search.search-could-not-be-completed-please-retry',
										'Search could not be completed. Please retry.',
									);
									return of([]);
								}),
							)
						: of([]);
				}),
				takeUntilDestroyed(),
			)
			.subscribe((items) => {
				this.items.set(items);
				this.loading.set(false);
			});
		effect(() => {
			const modal = this.dialog()?.nativeElement;
			if (modal && !modal.open) {
				modal.showModal();
				this.searchInput()?.nativeElement.focus();
			}
		});
	}
	show(): void {
		this.update('');
		this.open.set(true);
	}
	close(): void {
		this.query.next('');
		this.dialog()?.nativeElement.close();
		this.open.set(false);
	}
	update(value: string): void {
		this.term.set(value);
		this.query.next(value.trim());
	}
	clear(): void {
		this.update('');
		this.searchInput()?.nativeElement.focus();
	}
	retry(): void {
		this.query.next(this.term().trim());
	}
	destination(item: SearchSuggestion): string {
		return item.type === 'document'
			? documentUrl({ uid: item.id, path: item.path, repository: item.repository })
			: `/page/${item.type}?id=${encodeURIComponent(item.id)}`;
	}
	activateLink(event: MouseEvent, item: SearchSuggestion): void {
		if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)
			return;
		event.preventDefault();
		void this.select(item);
	}
	async select(item: SearchSuggestion): Promise<void> {
		if (this.navigating()) return;
		if (item.type === 'document' && item.repository !== 'default') {
			this.errorMessage.set(
				'app.components.quick-search.this-repository-is-not-supported-by-the-current-document',
				'This repository is not supported by the current document route.',
			);
			return;
		}
		const url = this.destination(item);
		this.navigating.set(true);
		try {
			if (await this.context().navigate(url)) this.close();
		} catch {
			this.errorMessage.set(
				'app.components.quick-search.this-result-could-not-be-opened-please-retry',
				'This result could not be opened. Please retry.',
			);
		} finally {
			this.navigating.set(false);
		}
	}
	keys(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			// A search input clears itself on Escape and swallows the dialog's cancel; stock closes.
			event.preventDefault();
			this.close();
			return;
		}
		if (event.key === 'Tab') {
			const controls = Array.from(
				this.dialog()?.nativeElement.querySelectorAll<HTMLElement>(
					'button, input, select, textarea, a[href], [tabindex], [contenteditable="true"]',
				) ?? [],
			).filter(
				(element) =>
					element.tabIndex >= 0 &&
					!element.matches(':disabled') &&
					!element.closest('[inert]') &&
					element.getClientRects().length > 0,
			);
			const first = controls[0];
			const last = controls.at(-1);
			if (event.shiftKey && event.target === first) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && event.target === last) {
				event.preventDefault();
				first?.focus();
			}
			return;
		}
		if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
		if (['Home', 'End'].includes(event.key) && event.target === this.searchInput()?.nativeElement)
			return;
		const buttons = Array.from(
			this.dialog()?.nativeElement.querySelectorAll<HTMLElement>(
				'[data-search-result]:not(:disabled)',
			) ?? [],
		);
		if (!buttons.length) return;
		event.preventDefault();
		const current = buttons.indexOf(event.target as HTMLElement);
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? buttons.length - 1
					: current < 0
						? 0
						: Math.max(
								0,
								Math.min(buttons.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)),
							);
		buttons[next].focus();
	}
}
