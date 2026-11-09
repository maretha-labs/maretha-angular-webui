import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	ElementRef,
	inject,
	input,
	signal,
	viewChild,
} from '@angular/core';
import {
	gridLocale,
	LayoutDocument,
	ResultsQueryScope,
	ResultsToolbarContext,
	WebUiIconComponent,
	WebUiLocale,
	WebUiMessagePipe,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { AgGridAngular } from 'ag-grid-angular';
import {
	CellStyleModule,
	CheckboxEditorModule,
	ClientSideRowModelModule,
	DateEditorModule,
	LocaleModule,
	NumberEditorModule,
	SelectEditorModule,
	TextEditorModule,
	themeQuartz,
	UndoRedoEditModule,
	type ColDef,
	type GridApi,
	type GridReadyEvent,
	type Module,
} from 'ag-grid-community';
import { Subject } from 'rxjs';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { displayLabel } from './bulk-directory-choices';
import {
	canEditRow,
	cellValue,
	propertyValue,
	SPREADSHEET_DEFAULT_COLUMNS,
	SpreadsheetField,
	spreadsheetField,
	SpreadsheetRow,
} from './results-spreadsheet';
import { ResultsSpreadsheetService } from './results-spreadsheet.service';

type SpreadsheetStatus =
	| { readonly kind: 'saving' | 'upToDate' | 'failed' }
	| { readonly kind: 'saved'; readonly count: number };

const DATA_TYPES: Readonly<Record<SpreadsheetField['kind'], string>> = {
	text: 'text',
	list: 'text',
	integer: 'number',
	number: 'number',
	date: 'dateString',
	boolean: 'boolean',
	directory: 'text',
	readonly: 'text',
};

function readonlyText(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) return value.map(readonlyText).filter(Boolean).join(', ');
	if (typeof value === 'object') {
		const entry = value as Record<string, unknown>;
		return readonlyText(entry['title'] ?? entry['name'] ?? entry['id'] ?? entry['uid'] ?? '');
	}
	return String(value);
}

/**
 * Polymer's spreadsheetButton: edits the fields of every matching result in a grid and saves
 * changed documents. Built on AG Grid Community (MIT) modules only.
 */
@Component({
	selector: 'nx-results-spreadsheet',
	imports: [AgGridAngular, WebUiIconComponent, WebUiMessagePipe],
	template: `<button
			type="button"
			[disabled]="context().busy || context().totalCount === 0 || !context().queryScope"
			[attr.aria-label]="'spreadsheetButton.tooltip' | webuiMessage: 'Spreadsheet Editor'"
			[title]="'spreadsheetButton.tooltip' | webuiMessage: 'Spreadsheet Editor'"
			(click)="open()"
		>
			<nx-webui-icon name="nuxeo:spreadsheet" />
		</button>
		<dialog
			#dialog
			aria-labelledby="nx-results-spreadsheet-title"
			(cancel)="$event.preventDefault(); close()"
		>
			<h2 id="nx-results-spreadsheet-title">
				{{ 'spreadsheetButton.tooltip' | webuiMessage: 'Spreadsheet Editor' }}
			</h2>
			@if (opened()) {
				@if (loadFailed()) {
					<p role="alert">
						{{ 'selectivity.failedFetchResults' | webuiMessage: 'Failed to fetch results' }}
					</p>
				} @else {
					@if (directoryFailed()) {
						<p role="alert">
							{{
								'bulk.choicesFailed'
									| webuiMessage
										: 'Directory choices could not be loaded. Retry before changing a directory field.'
							}}
						</p>
					}
					<ag-grid-angular
						class="grid"
						[modules]="modules"
						[theme]="theme"
						[localeText]="localeText()"
						[enableRtl]="locale.direction() === 'rtl'"
						[rowData]="gridRows()"
						[columnDefs]="columnDefs()"
						[getRowId]="rowId"
						[loading]="loading()"
						[undoRedoCellEditing]="true"
						[stopEditingWhenCellsLoseFocus]="true"
						(gridReady)="gridReady($event)"
						(keydown.escape)="$event.preventDefault()"
					/>
				}
			}
			<footer>
				<label
					><input
						type="checkbox"
						[checked]="autosave()"
						(change)="autosave.set($any($event.target).checked)"
					/>{{ 'spreadsheet.autoSave' | webuiMessage: 'Each change is automatically saved' }}</label
				>
				<span role="status">
					@switch (status()?.kind) {
						@case ('saving') {
							{{ 'spreadsheet.saving' | webuiMessage: 'Saving...' }}
						}
						@case ('upToDate') {
							{{ 'spreadsheet.upToDate' | webuiMessage: 'Everything up to date' }}
						}
						@case ('saved') {
							{{ savedCount() }} {{ 'spreadsheet.rowsSaved' | webuiMessage: 'rows saved' }}
						}
					}
				</span>
				@if (status()?.kind === 'failed') {
					<span role="alert">{{
						'spreadsheet.failedSave' | webuiMessage: 'Failed to save changes'
					}}</span>
				}
				<button type="button" [disabled]="saving() || loading()" (click)="save()">
					{{ 'command.save.changes' | webuiMessage: 'Save Changes' }}
				</button>
				<button type="button" (click)="close()">
					{{ 'command.close' | webuiMessage: 'Close' }}
				</button>
			</footer>
		</dialog>`,
	styles: `
		:host {
			display: inline-flex;
		}
		button {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 8px;
			background: var(--nuxeo-box);
			color: inherit;
			border: 1px solid var(--nuxeo-border);
		}
		dialog[open] {
			display: flex;
			flex-direction: column;
			gap: 8px;
			width: min(96vw, 1280px);
			height: min(90vh, 860px);
			background: var(--nuxeo-box);
			color: var(--nuxeo-text-default);
			border: 1px solid var(--nuxeo-border);
		}
		dialog::backdrop {
			background: #0008;
		}
		h2 {
			font-size: 18px;
			margin: 0;
		}
		.grid {
			flex: 1;
			min-height: 0;
		}
		footer {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 8px;
		}
		footer [role='status'] {
			flex: 1;
		}
		:host ::ng-deep .nx-spreadsheet__dirty {
			font-style: italic;
			background: color-mix(in srgb, var(--nuxeo-primary-color, #0066cc) 12%, transparent);
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsSpreadsheetComponent {
	readonly context = input.required<ResultsToolbarContext>();
	readonly locale = inject(WebUiLocale);
	private readonly messages = inject(WebUiMessages);
	private readonly service = inject(ResultsSpreadsheetService);
	private readonly gateway = inject(DocumentLayoutGatewayService);
	private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
	readonly opened = signal(false);
	readonly loading = signal(false);
	readonly loadFailed = signal(false);
	readonly directoryFailed = signal(false);
	readonly saving = signal(false);
	readonly autosave = signal(false);
	readonly status = signal<SpreadsheetStatus | null>(null);
	readonly savedCount = computed(() => {
		const status = this.status();
		return status?.kind === 'saved' ? status.count : 0;
	});
	readonly rows = signal<readonly SpreadsheetRow[]>([]);
	readonly gridRows = computed(() => [...this.rows()]);
	readonly fields = signal<readonly SpreadsheetField[]>([]);
	readonly choices = signal<Readonly<Record<string, readonly { id: string; label: string }[]>>>({});
	/** Changed property values per document, as Polymer's spreadsheet keeps them until saved. */
	readonly dirty = new Map<string, Record<string, unknown>>();
	readonly modules: Module[] = [
		ClientSideRowModelModule,
		LocaleModule,
		TextEditorModule,
		NumberEditorModule,
		DateEditorModule,
		CheckboxEditorModule,
		SelectEditorModule,
		UndoRedoEditModule,
		CellStyleModule,
	];
	readonly theme = themeQuartz.withParams({
		accentColor: 'var(--nuxeo-primary-color, #0066cc)',
		backgroundColor: 'var(--nuxeo-box, #fff)',
		foregroundColor: 'var(--nuxeo-text-default, #222)',
		headerBackgroundColor: 'var(--nuxeo-box, #fff)',
		borderColor: 'var(--nuxeo-border, #ddd)',
	});
	readonly localeText = computed(() => gridLocale(this.messages));
	readonly columnDefs = computed<ColDef<SpreadsheetRow>[]>(() =>
		this.fields().map((field) => this.columnDef(field)),
	);
	readonly rowId = (params: { data: SpreadsheetRow }) => params.data.uid;
	private api?: GridApi<SpreadsheetRow>;
	private scope?: ResultsQueryScope;
	private savedAny = false;
	private epoch = 0;
	private readonly cancelled = new Subject<void>();

	constructor() {
		inject(DestroyRef).onDestroy(() => {
			this.epoch++;
			this.cancelled.next();
			this.cancelled.complete();
		});
	}

	gridReady(event: GridReadyEvent<SpreadsheetRow>): void {
		this.api = event.api;
	}

	async open(): Promise<void> {
		const context = this.context();
		if (!context.queryScope || context.busy || context.totalCount === 0 || this.opened()) return;
		const epoch = ++this.epoch;
		const scope = structuredClone(context.queryScope);
		const columns = context.columns?.length ? context.columns : SPREADSHEET_DEFAULT_COLUMNS;
		this.scope = scope;
		this.reset();
		this.opened.set(true);
		this.loading.set(true);
		this.dialog()?.nativeElement.showModal();
		try {
			const [schemas, rows] = await Promise.all([
				this.service.schemas(this.cancelled),
				this.service.rows(scope, this.cancelled),
			]);
			if (epoch !== this.epoch) return;
			const fields = columns.map((column) => spreadsheetField(column, schemas));
			const choices = await this.loadChoices(fields);
			if (epoch !== this.epoch) return;
			this.choices.set(choices);
			this.fields.set(fields);
			this.rows.set(rows);
		} catch {
			if (epoch === this.epoch) this.loadFailed.set(true);
		} finally {
			if (epoch === this.epoch) this.loading.set(false);
		}
	}

	async save(): Promise<void> {
		const scope = this.scope;
		if (!scope || this.saving() || this.loading()) return;
		const epoch = this.epoch;
		const rows = new Map(this.rows().map((row) => [row.uid, row]));
		const pending = [...this.dirty].flatMap(([uid, properties]) => {
			const row = rows.get(uid);
			return row && Object.keys(properties).length
				? [{ uid, row, properties: { ...properties } }]
				: [];
		});
		if (!pending.length) {
			this.status.set({ kind: 'upToDate' });
			return;
		}
		this.saving.set(true);
		this.status.set({ kind: 'saving' });
		const results = await Promise.allSettled(
			pending.map(async ({ uid, row, properties }) => {
				const updated = await this.gateway.update(
					row as unknown as LayoutDocument,
					properties,
					scope.repository,
				);
				return { uid, properties, updated: updated as unknown as SpreadsheetRow };
			}),
		);
		if (epoch !== this.epoch) return;
		const saved = results.flatMap((result) =>
			result.status === 'fulfilled' ? [result.value] : [],
		);
		for (const { uid, properties } of saved) {
			const current = this.dirty.get(uid) ?? {};
			for (const [field, value] of Object.entries(properties))
				if (Object.is(current[field], value)) delete current[field];
			if (!Object.keys(current).length) this.dirty.delete(uid);
		}
		const updates = new Map(saved.map(({ uid, updated }) => [uid, updated]));
		this.rows.update((rows) => rows.map((row) => updates.get(row.uid) ?? row));
		this.savedAny ||= saved.length > 0;
		this.saving.set(false);
		this.status.set(
			saved.length === pending.length ? { kind: 'saved', count: saved.length } : { kind: 'failed' },
		);
		this.api?.refreshCells({ force: true });
	}

	close(): void {
		if (
			[...this.dirty.values()].some((properties) => Object.keys(properties).length) &&
			!window.confirm(
				this.messages.text(
					'app.notices.discard-your-unsaved-changes-f117f1',
					'Discard your unsaved changes?',
				),
			)
		)
			return;
		this.epoch++;
		this.cancelled.next();
		this.dialog()?.nativeElement.close();
		this.opened.set(false);
		this.api = undefined;
		const refresh = this.savedAny;
		this.reset();
		if (refresh) void this.context().refresh();
	}

	/** Records an edited cell; reverting it to the stored value clears the change. */
	setValue(row: SpreadsheetRow, field: SpreadsheetField, value: unknown): boolean {
		const next = propertyValue(field, value);
		const changes = this.dirty.get(row.uid) ?? {};
		const before = field.field in changes ? changes[field.field] : row.properties[field.field];
		if (JSON.stringify(before ?? null) === JSON.stringify(next ?? null)) return false;
		if (JSON.stringify(row.properties[field.field] ?? null) === JSON.stringify(next ?? null))
			delete changes[field.field];
		else changes[field.field] = next;
		if (Object.keys(changes).length) this.dirty.set(row.uid, changes);
		else this.dirty.delete(row.uid);
		if (this.autosave()) void this.save();
		return true;
	}

	displayValue(row: SpreadsheetRow, field: SpreadsheetField): unknown {
		const changes = this.dirty.get(row.uid);
		const source =
			changes && field.field in changes
				? { ...row, properties: { ...row.properties, [field.field]: changes[field.field] } }
				: row;
		const value = cellValue(source, field);
		return field.kind === 'readonly' ? readonlyText(value) : value;
	}

	private columnDef(field: SpreadsheetField): ColDef<SpreadsheetRow> {
		const choices = this.choices()[field.field];
		const labels = new Map((choices ?? []).map((choice) => [choice.id, choice.label]));
		const editable = field.kind !== 'readonly' && (field.kind !== 'directory' || !!choices);
		return {
			colId: field.field,
			headerName: this.messages.text(field.labelKey, field.label),
			cellDataType: DATA_TYPES[field.kind],
			valueGetter: (params) => (params.data ? this.displayValue(params.data, field) : null),
			valueSetter: (params) => this.setValue(params.data, field, params.newValue),
			editable: (params) => editable && !!params.data && canEditRow(params.data),
			...(field.kind === 'integer' ? { cellEditorParams: { precision: 0 } } : {}),
			...(field.kind === 'directory'
				? {
						cellEditor: 'agSelectCellEditor',
						cellEditorParams: { values: ['', ...labels.keys()] },
						valueFormatter: (params) =>
							labels.get(String(params.value ?? '')) ?? String(params.value ?? ''),
					}
				: {}),
			cellClassRules: {
				'nx-spreadsheet__dirty': (params) =>
					!!params.data && field.field in (this.dirty.get(params.data.uid) ?? {}),
			},
		};
	}

	private async loadChoices(
		fields: readonly SpreadsheetField[],
	): Promise<Record<string, readonly { id: string; label: string }[]>> {
		const directories = fields.filter((field) => field.kind === 'directory' && field.directory);
		const results = await Promise.allSettled(
			directories.map((field) =>
				this.gateway.bulkDirectoryChoices(field.directory!.name, field.directory!.dbl10n),
			),
		);
		const choices: Record<string, readonly { id: string; label: string }[]> = {};
		results.forEach((result, index) => {
			const field = directories[index];
			if (result.status === 'fulfilled')
				choices[field.field] = result.value.map((entry) => ({
					id: entry.id,
					label: displayLabel(field.directory!.name, entry.id, entry.label, this.messages),
				}));
			else this.directoryFailed.set(true);
		});
		return choices;
	}

	private reset(): void {
		this.dirty.clear();
		this.rows.set([]);
		this.fields.set([]);
		this.choices.set({});
		this.status.set(null);
		this.loadFailed.set(false);
		this.directoryFailed.set(false);
		this.loading.set(false);
		this.saving.set(false);
		this.savedAny = false;
	}
}
