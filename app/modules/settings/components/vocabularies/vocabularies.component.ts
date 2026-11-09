import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { inject as injectI18n } from '@angular/core';
import { WebUiMessages } from '@maretha/webui-sdk';
import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ElementRef,
	inject,
	OnDestroy,
	OnInit,
	input,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
	DIRECTORY_LAYOUTS,
	DirectoryLayoutContext,
	DirectoryLayoutRegistration,
	GuardedView,
	ViewDeparture,
	WebUiMessagePipe,
	WebUiIconComponent,
} from '@maretha/webui-sdk';
import { Subject, catchError, of, switchMap, takeUntil } from 'rxjs';
import {
	DirectoryEntry,
	DirectoryMetadata,
	DirectoryService,
	isVocabularyDirectory,
} from '../../helpers/directory.service';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

@Component({
	selector: 'nx-vocabularies',
	imports: [FormsModule, NgComponentOutlet, WebUiMessagePipe, WebUiIconComponent],
	templateUrl: './vocabularies.component.html',
	styleUrl: './vocabularies.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VocabulariesComponent implements OnInit, OnDestroy, GuardedView {
	readonly i18n = injectI18n(WebUiMessages);
	private readonly uiVocabulariesComponentConfirmations = injectUiMessages(RuntimeUiMessages);

	readonly noEdit = input(false);
	private readonly destroy$ = new Subject<void>();
	private readonly selection$ = new Subject<string>();
	private parentRequest = 0;
	private editRevision = 0;
	private readonly confirmDialog = inject(ConfirmDialogService);
	private readonly registeredLayouts = inject(DIRECTORY_LAYOUTS, { optional: true }) ?? [];
	directories: DirectoryMetadata[] = [];
	selected = '';
	entries: DirectoryEntry[] = [];
	parentEntries: DirectoryEntry[] = [];
	page = 0;
	hasNextPage = false;
	loading = false;
	catalogLoading = false;
	busy = false;
	private readonly errorState = localizedText();
	get error(): string {
		return this.errorState();
	}
	set error(value: string | MessageText) {
		this.errorState.set(value);
	}
	editing: DirectoryEntry | null = null;
	private editingId = '';
	private dialogTrigger: HTMLElement | null = null;
	isNew = false;
	dirty = false;
	deleteTarget: DirectoryEntry | null = null;
	constructor(
		private readonly api: DirectoryService,
		private readonly cdr: ChangeDetectorRef,
		private readonly element: ElementRef<HTMLElement>,
	) {}
	ngOnInit(): void {
		this.loadDirectories();
		this.selection$
			.pipe(
				switchMap((name) => (name ? this.loadEntries(name) : of(null))),
				takeUntil(this.destroy$),
			)
			.subscribe((result) => {
				if (!result) return;
				this.loading = false;
				this.entries = result.entries ?? [];
				this.hasNextPage = result.isNextPageAvailable === true;
				if (!this.entries.length && this.page > 0) {
					this.page--;
					this.refresh();
					return;
				}
				this.cdr.markForCheck();
			});
	}
	private loadDirectories(): void {
		if (this.catalogLoading) return;
		this.catalogLoading = true;
		this.error = '';
		this.api
			.listDirectories()
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (result) => {
					this.directories = (result.entries ?? [])
						.filter(isVocabularyDirectory)
						.sort((a, b) => a.name.localeCompare(b.name));
					this.catalogLoading = false;
					this.cdr.markForCheck();
				},
				error: () => {
					this.catalogLoading = false;
					this.fail(
						messageText(
							'app.settingsShared.directories-could-not-be-loaded-retry-the-reques-42d3cc',
							'Directories could not be loaded. Retry the request.',
						),
					);
				},
			});
	}
	selectDirectory(name: string): void {
		if (this.busy || (this.dirty && !this.discard())) return;
		this.selected = name;
		this.page = 0;
		this.editing = null;
		this.editingId = '';
		this.editRevision++;
		this.dirty = false;
		this.entries = [];
		this.hasNextPage = false;
		this.loading = false;
		this.error = '';
		this.parentEntries = [];
		this.parentRequest++;
		this.deleteTarget = null;
		this.selection$.next(name);
		this.cdr.markForCheck();
	}
	refresh(): void {
		if (this.busy) return;
		if (this.selected) this.selection$.next(this.selected);
		else this.loadDirectories();
	}
	edit(entry: DirectoryEntry, event?: Event): void {
		if (!this.canMutate() || (this.dirty && !this.discard())) return;
		this.rememberDialogTrigger(event);
		this.isNew = false;
		this.editing = clone(entry);
		this.editingId = this.idFor(entry);
		this.editRevision++;
		this.loadParents();
		this.dirty = false;
		this.cdr.markForCheck();
		this.focusDialog();
	}
	create(event?: Event): void {
		if (!this.canMutate() || !this.selected || (this.dirty && !this.discard())) return;
		this.rememberDialogTrigger(event);
		this.isNew = true;
		this.editing = { id: '', directoryName: this.selected, properties: defaults(this.schema()) };
		this.editingId = '';
		this.editRevision++;
		this.loadParents();
		this.dirty = false;
		this.cdr.markForCheck();
		this.focusDialog();
	}
	markDirty(): void {
		this.dirty = true;
	}
	save(): void {
		const entry = this.editing;
		if (
			!entry ||
			!this.canMutate() ||
			!valid(entry) ||
			!validParent(entry, this.needsParent(), this.parentRequired()) ||
			!this.allowedParent(entry)
		) {
			this.fail(
				messageText(
					'app.settingsShared.an-entry-id-and-a-valid-parent-are-needed-484ae9',
					'An entry ID and a valid parent are needed.',
				),
			);
			return;
		}
		entry.properties['obsolete'] = Number(entry.properties['obsolete']) > 0 ? 1 : 0;
		if (entry.properties['ordering'] !== '' && entry.properties['ordering'] !== undefined)
			entry.properties['ordering'] = Number(entry.properties['ordering']);
		this.busy = true;
		const request = this.isNew
			? this.api.create(this.selected, entry)
			: this.api.update(this.selected, this.editingId, entry);
		request.pipe(takeUntil(this.destroy$)).subscribe({
			next: () => {
				this.busy = false;
				this.dirty = false;
				this.editing = null;
				this.editingId = '';
				this.refresh();
				this.cdr.markForCheck();
				this.returnDialogFocus();
			},
			error: () => {
				this.busy = false;
				this.fail(
					messageText(
						'app.settingsShared.action-select-create-the-entry-could-not-be-cre-16ce3e',
						'{action, select, create {The entry could not be created.} other {The entry could not be updated.}}',
						{ action: this.isNew ? 'create' : 'update' },
					),
				);
			},
		});
	}
	requestDelete(entry: DirectoryEntry, event?: Event): void {
		if (this.canMutate()) {
			this.rememberDialogTrigger(event);
			this.deleteTarget = { ...clone(entry), directoryName: this.selected };
			this.cdr.markForCheck();
			this.focusDialog();
		}
	}
	confirmDelete(): void {
		if (!this.deleteTarget || !this.canMutate()) return;
		const entry = this.deleteTarget;
		const directory = entry.directoryName;
		const id = this.idFor(entry, directory);
		this.deleteTarget = null;
		this.busy = true;
		this.api
			.delete(directory, id)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: () => {
					this.busy = false;
					this.refresh();
					this.cdr.markForCheck();
					this.returnDialogFocus();
				},
				error: () => {
					this.busy = false;
					this.fail(
						messageText(
							'app.settingsShared.the-entry-could-not-be-deleted-it-may-be-referen-e2289b',
							'The entry could not be deleted. It may be referenced.',
						),
					);
				},
			});
	}
	cancel(): void {
		if (this.busy) return;
		if (!this.dirty) {
			this.closeEntryEditor();
			return;
		}
		const revision = this.editRevision;
		void this.confirmDialog
			.confirm({
				titleKey: 'dialog.unsavedChanges',
				title: 'Unsaved changes',
				messageKey: 'app.notices.discard-unsaved-directory-entry-changes-146cb0',
				message: 'Discard unsaved directory entry changes?',
				confirmKey: 'action.discard',
				confirm: 'Discard',
				destructive: true,
			})
			.then((confirmed) => {
				if (confirmed && !this.busy && revision === this.editRevision) this.closeEntryEditor();
			});
	}
	private closeEntryEditor(): void {
		this.editing = null;
		this.editingId = '';
		this.dirty = false;
		this.cdr.markForCheck();
		this.returnDialogFocus();
	}
	cancelDelete(): void {
		if (this.busy) return;
		this.deleteTarget = null;
		this.cdr.markForCheck();
		this.returnDialogFocus();
	}
	handleDialogKeydown(event: KeyboardEvent, deleteDialog = false): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			if (deleteDialog) this.cancelDelete();
			else this.cancel();
			return;
		}
		if (event.key !== 'Tab' || !(event.currentTarget instanceof HTMLElement)) return;
		const focusable = [
			...event.currentTarget.querySelectorAll<HTMLElement>(
				'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
			),
		].filter((element) => !element.hidden);
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}
	previous(): void {
		if (!this.busy && !this.loading && this.page > 0) {
			this.page--;
			this.refresh();
		}
	}
	next(): void {
		if (!this.busy && !this.loading && this.hasNextPage) {
			this.page++;
			this.refresh();
		}
	}
	schema(): string {
		return this.directories.find((item) => item.name === this.selected)?.schema || 'vocabulary';
	}
	columns(): string[] {
		const properties = this.entries[0]?.properties ?? defaults(this.schema());
		const ranks: Record<string, number> = { parent: 1, id: 2, obsolete: 98, ordering: 99 };
		const rank = (key: string) => ranks[key] ?? 50;
		return Object.keys(properties).sort((left, right) => rank(left) - rank(right));
	}
	columnLabel(key: string): string {
		return (
			(
				{
					id: this.i18n.format('app.settingsShared.id-384397', {}, 'ID'),
					parent: this.i18n.format('app.settingsShared.parent-5f7953', {}, 'Parent'),
					label: this.i18n.format('app.settingsShared.label-0e6637', {}, 'Label'),
					label_en: this.i18n.format(
						'app.settingsShared.english-label-100733',
						{},
						'English label',
					),
					label_fr: this.i18n.format('app.settingsShared.french-label-c8eef1', {}, 'French label'),
					obsolete: this.i18n.format('app.settingsShared.obsolete-a97fc8', {}, 'Obsolete'),
					ordering: this.i18n.format('app.settingsShared.order-6be090', {}, 'Order'),
				} as Record<string, string>
			)[key] ?? key
		);
	}
	needsParent(): boolean {
		return ['xvocabulary', 'l10nxvocabulary'].includes(this.schema());
	}
	parentDirectory(): string {
		if (this.schema() === 'l10nxvocabulary') return this.selected;
		return this.directories.find((item) => item.name === this.selected)?.parent || '';
	}
	parentRequired(): boolean {
		return !!this.parentDirectory() && this.parentDirectory() !== this.selected;
	}
	parentOptions(): DirectoryEntry[] {
		if (this.parentDirectory() !== this.selected || !this.editing) return this.parentEntries;
		const excluded = this.excludedParents(this.editing);
		return this.parentEntries.filter((entry) => !excluded.has(String(entry.properties['id'])));
	}
	private excludedParents(entry: DirectoryEntry): Set<string> {
		const id = String(entry.properties['id'] ?? '');
		const excluded = new Set<string>(id ? [id] : []);
		let found = true;
		while (found) {
			found = false;
			for (const candidate of this.parentEntries) {
				const id = String(candidate.properties['id']);
				if (!excluded.has(id) && excluded.has(String(candidate.properties['parent']))) {
					excluded.add(id);
					found = true;
				}
			}
		}
		return excluded;
	}
	private allowedParent(entry: DirectoryEntry): boolean {
		return (
			this.parentDirectory() !== this.selected ||
			!entry.properties['parent'] ||
			!this.excludedParents(entry).has(String(entry.properties['parent']))
		);
	}
	layout(): DirectoryLayoutRegistration | undefined {
		return this.registeredLayouts.flat().find((layout) => layout.schema === this.schema());
	}
	layoutContext(): DirectoryLayoutContext | null {
		if (!this.editing) return null;
		const revision = this.editRevision;
		return {
			directory: {
				name: this.selected,
				schema: this.schema(),
				parent: this.parentDirectory() || undefined,
			},
			draft: { ...this.editing, properties: { ...this.editing.properties } },
			isNew: this.isNew,
			noEdit: this.noEdit(),
			readOnly: this.readonlyDirectory(),
			busy: this.busy,
			dirty: this.dirty,
			commit: (draft) => this.commitCustom(draft, revision),
			cancel: () => this.cancelCustom(revision),
		};
	}
	canDeactivate(_departure: ViewDeparture): boolean {
		return !this.busy && (!this.dirty || this.discard());
	}
	hasPendingChanges(): boolean {
		return this.dirty || this.busy;
	}
	readonlyDirectory(): boolean {
		return this.directories.find((item) => item.name === this.selected)?.readOnly === true;
	}
	canMutate(): boolean {
		return !this.noEdit() && !this.readonlyDirectory() && !this.busy;
	}
	private loadEntries(name: string) {
		this.loading = true;
		this.entries = [];
		this.hasNextPage = false;
		this.error = '';
		this.cdr.markForCheck();
		return this.api.listEntries(name, this.page).pipe(
			catchError(() => {
				this.loading = false;
				this.fail(
					messageText(
						'app.settingsShared.directory-entries-could-not-be-loaded-retry-the-031629',
						'Directory entries could not be loaded. Retry the request.',
					),
				);
				return of(null);
			}),
		);
	}
	private fail(message: string | MessageText): void {
		this.error = message;
		this.cdr.markForCheck();
	}
	private rememberDialogTrigger(event?: Event): void {
		const target = event?.currentTarget;
		if (target instanceof HTMLElement) this.dialogTrigger = target;
	}
	private focusDialog(): void {
		queueMicrotask(() =>
			this.element.nativeElement.querySelector<HTMLElement>('[data-dialog-initial]')?.focus(),
		);
	}
	private returnDialogFocus(): void {
		queueMicrotask(() => this.dialogTrigger?.focus());
	}
	private loadParents(): void {
		const parent = this.parentDirectory();
		if (!parent) return;
		const request = ++this.parentRequest;
		this.api
			.listEntries(parent, 0, 0)
			.pipe(
				takeUntil(this.destroy$),
				catchError(() => of(null)),
			)
			.subscribe((result) => {
				if (request !== this.parentRequest) return;
				this.parentEntries = result?.entries ?? [];
				this.cdr.markForCheck();
			});
	}
	private discard(): boolean {
		return (
			typeof window === 'undefined' ||
			window.confirm(
				this.uiVocabulariesComponentConfirmations.text(
					'app.notices.discard-unsaved-directory-entry-changes-146cb0',
					'Discard unsaved directory entry changes?',
				),
			)
		);
	}
	private commitCustom(draft: DirectoryEntry, revision: number): boolean {
		if (
			revision !== this.editRevision ||
			!this.canMutate() ||
			!this.editing ||
			draft.directoryName !== this.selected ||
			(!this.isNew && this.idFor(draft) !== this.editingId)
		)
			return false;
		this.editing = clone(draft);
		this.dirty = true;
		this.cdr.markForCheck();
		return true;
	}
	private cancelCustom(revision: number): boolean {
		if (revision !== this.editRevision || this.busy) return false;
		this.cancel();
		return this.editing === null;
	}
	private idFor(entry: DirectoryEntry, directory = this.selected): string {
		return String(
			entry.properties[this.directories.find((item) => item.name === directory)?.idField || 'id'],
		);
	}
	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
		this.selection$.complete();
	}
}
function clone(entry: DirectoryEntry): DirectoryEntry {
	return { ...entry, properties: { ...entry.properties } };
}
function valid(entry: DirectoryEntry): boolean {
	return typeof entry.properties['id'] === 'string' && entry.properties['id'].trim().length > 0;
}
function validParent(entry: DirectoryEntry, needsParent: boolean, required: boolean): boolean {
	return (
		!needsParent ||
		!required ||
		(typeof entry.properties['parent'] === 'string' && entry.properties['parent'].trim().length > 0)
	);
}
function defaults(schema: string): Record<string, unknown> {
	return {
		id: '',
		...(schema.includes('l10n') ? { label_en: '', label_fr: '' } : { label: '' }),
		...(['xvocabulary', 'l10nxvocabulary'].includes(schema) ? { parent: '' } : {}),
		obsolete: 0,
		ordering: '',
	};
}
