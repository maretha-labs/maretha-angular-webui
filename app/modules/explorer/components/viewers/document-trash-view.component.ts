import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	input,
	PendingTasks,
	signal,
} from '@angular/core';

import {
	DocumentViewContext,
	GuardedView,
	ResultsSelectionContext,
	ResultsProjectionColumn,
	ResultsProjectionComponent,
	ResultsProjectionTemplateDirective,
	ResultsQueryScope,
	WebUiSlotComponent,
} from '@maretha/webui-sdk';
import { firstValueFrom } from 'rxjs';
import { DocumentTrashService } from '../../helpers/document-trash.service';
import { resultFieldColumns } from '../../helpers/scoped-result-columns';

@Component({
	selector: 'nx-document-trash-view',
	imports: [
		WebUiSlotComponent,
		WebUiDatePipe,
		ResultsProjectionComponent,
		ResultsProjectionTemplateDirective,
		WebUiMessagePipe,
	],
	template: `<h2>{{ 'app.modules.document-trash-view.trash-98efdc' | webuiMessage: 'Trash' }}</h2>
		@if (error()) {
			<p role="alert">{{ error() }}</p>
			<button type="button" [disabled]="loading() || busy()" (click)="retry()">
				{{ 'app.modules.document-trash-view.retry-5ed674' | webuiMessage: 'Retry' }}
			</button>
		}
		<nx-webui-slot name="TRASH_RESULTS_SELECTION_ACTIONS" [context]="selectionContext()" />
		@if (loading()) {
			<p role="status">
				{{
					'app.modules.document-trash-view.loading-trash-396607' | webuiMessage: 'Loading trash…'
				}}
			</p>
		}
		<nx-results-projection
			hostId="document-trash"
			mode="table"
			[rows]="rows()"
			[columns]="columns"
			[selection]="selectedIds()"
			[contextEpoch]="epoch()"
			[scope]="context().document"
			[loading]="loading() || busy()"
			(selectionChange)="projectionSelection($event)"
			(loadMore)="loadMore()"
		>
			<ng-template nxResultsTemplate="cell:modified" let-row="row">{{
				$any(row).properties?.['dc:modified'] | webuiDate: 'medium'
			}}</ng-template>
		</nx-results-projection>
		@if (hasMore()) {
			<button type="button" [disabled]="loading() || busy()" (click)="loadMore()">
				{{ 'app.modules.document-trash-view.load-more-cf108d' | webuiMessage: 'Load more' }}
			</button>
		} `,
	styles:
		':host { display:block; padding:20px; min-width:0; overflow:auto; } h2 { font-size:18px; } table { width:100%; border-collapse:collapse; } th,td { padding:12px; border-bottom:1px solid var(--nuxeo-border); text-align:start; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentTrashViewComponent implements GuardedView {
	readonly context = input.required<DocumentViewContext>();
	private readonly trash = inject(DocumentTrashService);
	private readonly tasks = inject(PendingTasks);
	private generation = 0;
	private page = 0;
	private scope: unknown;
	private readonly removed = new Set<string>();
	private failedReset = true;
	readonly rows = signal<any[]>([]);
	readonly selection = signal<ReadonlySet<string>>(new Set());
	readonly busy = signal(false);
	readonly loading = signal(false);
	readonly error = localizedText('');
	readonly hasMore = signal(false);
	readonly epoch = signal(0);
	/** The trash search behind the loaded rows. */
	private readonly appliedScope = signal<ResultsQueryScope | undefined>(undefined);
	readonly allSelected = computed(
		() => !!this.rows().length && this.rows().every((row) => this.selection().has(row.uid)),
	);
	readonly columns: readonly ResultsProjectionColumn<any>[] = [
		{ id: 'title', label: 'Title', labelKey: 'app.columns.title', value: (row) => row.title },
		{ id: 'type', label: 'Type', labelKey: 'app.columns.type', value: (row) => row.type },
		{
			id: 'modified',
			label: 'Modified',
			labelKey: 'app.columns.modified',
			value: (row) => row.properties?.['dc:modified'] ?? '',
		},
	];
	readonly selectedIds = computed(() => [...this.selection()]);
	projectionSelection(ids: readonly string[]): void {
		if (this.loading() || this.busy()) return;
		const valid = new Set(this.rows().map((row) => row.uid));
		this.selection.set(new Set(ids.filter((id) => valid.has(id))));
	}
	readonly selectionContext = computed<ResultsSelectionContext>(() => ({
		...this.context(),
		selectedDocuments: this.rows().filter((row) => this.selection().has(row.uid)),
		items: this.rows(),
		displayMode: 'table',
		columns: resultFieldColumns(this.columns),
		queryScope: this.appliedScope(),
		busy: this.busy(),
		setBusy: (value) => this.busy.set(value),
		refresh: (ids = []) => {
			ids.forEach((id) => this.removed.add(id));
			return this.load(true);
		},
		reportError: (message) => this.error.set(message),
		reportMessage: (key, fallback, values) => this.error.set(messageText(key, fallback, values)),
	}));
	constructor() {
		effect(() => {
			const scope = this.context().document?.['uid'];
			if (scope !== this.scope) {
				this.scope = scope;
				this.removed.clear();
			}
			this.tasks.run(() => this.load(true));
		});
		inject(DestroyRef).onDestroy(() => this.generation++);
	}
	private async load(reset: boolean): Promise<void> {
		const generation = reset ? ++this.generation : this.generation;
		if (reset) {
			this.rows.set([]);
			this.appliedScope.set(undefined);
			this.epoch.update((value) => value + 1);
			this.selection.set(new Set());
			this.page = 0;
			this.hasMore.set(false);
		}
		this.loading.set(true);
		this.error.set('');
		try {
			const path = this.context().document?.['path'];
			if (typeof path !== 'string' || !path) throw new Error('A folder path is required.');
			const page = reset ? 0 : this.page + 1;
			const result = await firstValueFrom(this.trash.loadMore(path, page));
			if (generation !== this.generation) return;
			const entries = result.entries.filter((row: { uid: string }) => !this.removed.has(row.uid));
			this.rows.update((rows) => (reset ? entries : [...rows, ...entries]));
			this.epoch.update((value) => value + 1);
			this.page = page;
			// The trash search sends no repository header, so it runs in the default repository.
			if (reset)
				this.appliedScope.set({
					repository: 'default',
					providerName: 'default_trash_search',
					queryParams: [],
					namedParameters: { ecm_path: JSON.stringify([path]) },
				});
			this.hasMore.set(result.isNextPageAvailable === true);
		} catch {
			if (generation === this.generation) {
				this.failedReset = reset;
				this.error.set(
					messageText('app.state.trash-could-not-be-loaded-b3ca80', 'Trash could not be loaded.'),
				);
			}
		} finally {
			if (generation === this.generation) this.loading.set(false);
		}
	}
	retry(): void {
		if (!this.busy() && !this.loading()) this.tasks.run(() => this.load(this.failedReset));
	}
	reload(): void {
		if (!this.busy()) {
			this.removed.clear();
			this.tasks.run(() => this.load(true));
		}
	}
	loadMore(): void {
		if (!this.busy() && !this.loading()) this.tasks.run(() => this.load(false));
	}
	select(id: string, event: Event): void {
		if (this.busy()) return;
		const checked = (event.target as HTMLInputElement).checked;
		this.selection.update((selection) => {
			const next = new Set(selection);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	}
	selectAll(event: Event): void {
		if (!this.busy())
			this.selection.set(
				(event.target as HTMLInputElement).checked
					? new Set(this.rows().map((row) => row.uid))
					: new Set(),
			);
	}
	canDeactivate(): boolean {
		return !this.busy();
	}
}
