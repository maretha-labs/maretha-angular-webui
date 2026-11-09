import { localizedState, LocalizedUiError } from './i18n/localized-state';
import { WebUiMessagePipe } from './webui-messages';
import { WebUiMessages } from './webui-messages';
import { formatDate, NgComponentOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	linkedSignal,
	input,
	output,
	PendingTasks,
	signal,
	WritableSignal,
} from '@angular/core';
import {
	DOCUMENT_LAYOUT_GATEWAY,
	DOCUMENT_LAYOUT_WIDGETS,
	DocumentLayout,
	DocumentLayoutWidget,
	LayoutDocument,
	LayoutMode,
	ResolvedLayoutField,
	WidgetProps,
	cloneLayoutValue,
	layoutFieldError,
	layoutPropertyValue,
	resolveLayoutFields,
} from './document-layout';
import { GuardedView } from './view-navigation';
import { SchemaFieldComponent } from './schema-field.component';
import { hasPermission } from './document-permissions';

let nextId = 0;
@Component({
	selector: 'nx-schema-layout',
	imports: [NgComponentOutlet, SchemaFieldComponent, WebUiMessagePipe],
	template: `
		@if (loading()) {
			<p role="status">
				{{ 'app.sdk.schema-layout.loading-layout-d4f8db' | webuiMessage: 'Loading layout…' }}
			</p>
		}
		@if (error()) {
			<p role="alert">{{ error() }}</p>
			<button type="button" [disabled]="saving() || hasUploads()" (click)="reload()">
				{{ 'app.sdk.schema-layout.reload-from-server-a062a5' | webuiMessage: 'Reload from server' }}
			</button>
		}
		@if (ready()) {
			<form (submit)="submit($event)" [attr.aria-busy]="saving() || hasUploads()">
				@for (section of sections(); track section.id) {
					<section [attr.aria-labelledby]="section.label ? idForSection(section.id) : null">
						@if (section.label) {
							<h3 [id]="idForSection(section.id)">{{ sectionLabel(section) }}</h3>
						}
						<div class="layout-section" [style.--columns]="section.columns || 1">
							@for (field of section.fields; track field.property) {
								<div class="field">
									@if (customWidget(field); as widget) {
										<ng-container
											*ngComponentOutlet="widget.component; inputs: { props: widgetProps(field) }"
										/>
									} @else if (readOnly() || field.readOnly) {
										<dl [id]="fieldId(field)">
											<dt>{{ fieldLabel(field) }}</dt>
											<dd>{{ display(field) }}</dd>
										</dl>
									} @else if (
										field.type === 'blob' ||
										field.multiple ||
										field.type === 'complex' ||
										field.type === 'reference' ||
										field.type === 'directory'
									) {
										<nx-schema-field [props]="widgetProps(field)" />
									} @else {
										<label [for]="fieldId(field)"
											>{{ fieldLabel(field) }}{{ field.required ? ' *' : '' }}</label
										>
										<input
											[id]="fieldId(field)"
											[type]="inputType(field)"
											[value]="inputValue(field)"
											[checked]="values()[field.property] === true"
											[required]="!!field.required"
											[attr.step]="field.type === 'double' ? 'any' : null"
											[attr.min]="field.min ?? null"
											[attr.max]="field.max ?? null"
											[attr.maxlength]="field.maxLength ?? null"
											[disabled]="saving()"
											[attr.aria-invalid]="fieldError(field) ? true : null"
											[attr.aria-describedby]="fieldError(field) ? fieldId(field) + '-error' : null"
											(input)="update(field, $event)"
											(blur)="validateReference(field)"
										/>
									}
									@if (fieldError(field)) {
										<span class="validation" [id]="fieldId(field) + '-error'">{{
											fieldError(field)
										}}</span>
									}
								</div>
							}
						</div>
					</section>
				}
				@if (!readOnly() && !draftOnly()) {
					<div class="buttons">
						<button type="submit" [disabled]="saving() || hasUploads() || !dirty() || invalid()">
							{{
								saving()
									? ('sdk.layout.saving' | webuiMessage: 'Saving…')
									: ('sdk.layout.save' | webuiMessage: 'Save')
							}}</button
						><button
							type="button"
							[disabled]="saving() || hasUploads() || !dirty()"
							(click)="discard()"
						>
							{{ 'app.sdk.schema-layout.discard-changes-dfb9e7' | webuiMessage: 'Discard changes' }}
						</button>
					</div>
				}
			</form>
		}
		@if (status()) {
			<p role="status">{{ status() }}</p>
		}
		@if (departurePending()) {
			<div role="alert">
				<p>
					{{
						'app.sdk.schema-layout.there-are-unsaved-changes-750d7c'
							| webuiMessage: 'There are unsaved changes.'
					}}
				</p>
				<button type="button" (click)="resolveDeparture(false)">
					{{ 'app.sdk.schema-layout.keep-editing-cc7530' | webuiMessage: 'Keep editing' }}</button
				><button type="button" (click)="discardAndLeave()">
					{{ 'app.sdk.schema-layout.discard-and-leave-7ee5f7' | webuiMessage: 'Discard and leave' }}
				</button>
			</div>
		}
	`,
	styles: `
		:host {
			display: block;
			padding: 20px;
			color: var(--nuxeo-text-default);
		}
		.field {
			display: flex;
			flex-direction: column;
			margin-block-end: 18px;
			gap: 6px;
		}
		input,
		textarea {
			color: inherit;
			font: inherit;
			width: 100%;
			background: transparent;
			border: 0;
			border-bottom: 1px solid var(--nuxeo-border, #a6a8ad);
			border-radius: 0;
			padding: 6px 0;
		}
		textarea {
			min-height: 110px;
			font-family: ui-monospace, monospace;
		}
		input[type='checkbox'] {
			align-self: flex-start;
		}
		label {
			font-weight: 600;
		}
		.validation {
			color: var(--nuxeo-warn-text);
		}
		.buttons {
			display: flex;
			gap: 12px;
		}
		button {
			appearance: none;
			font: inherit;
			color: inherit;
			border: 1px solid var(--nuxeo-border, #d8d8dc);
			border-radius: 2px;
			background: var(--nuxeo-box, #fff);
			box-shadow: none;
			padding: 8px 16px;
			cursor: pointer;
		}
		button[type='submit'] {
			background: var(--nuxeo-primary-color, #006bff);
			border-color: var(--nuxeo-primary-color, #006bff);
			color: #fff;
		}
		button:disabled {
			opacity: 0.45;
			cursor: default;
		}
		button:hover:not(:disabled) {
			border-color: var(--nuxeo-primary-color, #006bff);
		}
		button:focus-visible,
		input:focus-visible,
		textarea:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color, #006bff);
			outline-offset: 3px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchemaLayoutComponent implements GuardedView {
	readonly layout = input.required<DocumentLayout>();
	readonly documentId = input<string>();
	readonly parentId = input<string>();
	readonly name = input('');
	readonly mode = input<LayoutMode>('edit');
	readonly noEdit = input(false);
	/** Render validated per-item metadata without performing an individual document write. */
	readonly draftOnly = input(false);
	readonly initialValues = input<Readonly<Record<string, unknown>>>({});
	readonly valueChanged = output<Readonly<Record<string, unknown>>>();
	private disposed = false;
	readonly saved = output<LayoutDocument>();
	private readonly messages = inject(WebUiMessages);
	private readonly gateway = inject(DOCUMENT_LAYOUT_GATEWAY);
	private readonly widgets = inject(DOCUMENT_LAYOUT_WIDGETS, { optional: true }) || [];
	private readonly tasks = inject(PendingTasks);
	private readonly id = `webui-layout-${++nextId}`;
	private nextUploadId = 0;
	private readonly transientBlobs = new Map<string, import('./document-layout').BlobValue>();
	private nextWriteId = 0;
	private readonly pendingWriteBatches = new Map<number, ReadonlySet<string>>();
	private generation = 0;
	private baseline: Readonly<Record<string, unknown>> = {};
	private departure?: (allow: boolean) => void;
	readonly departurePending = signal(false);
	readonly loading = signal(false);
	readonly saving = signal(false);
	readonly ready = signal(false);
	readonly error = localizedState('');
	readonly status = localizedState('');
	readonly document = signal<LayoutDocument | null>(null);
	readonly fields = signal<readonly ResolvedLayoutField[]>([]);
	readonly values = signal<Readonly<Record<string, unknown>>>({});
	private readonly vocabularyLabels = signal<
		Readonly<Record<string, Readonly<Record<string, string>>>>
	>({});
	private readonly vocabularyRequests = computed(
		() => {
			const targets = this.ready()
				? this.fields()
						.filter((field) => field.type === 'directory')
						.flatMap((field) => {
							const value = this.values()[field.property];
							return (Array.isArray(value) ? value : [value])
								.filter((id): id is string => typeof id === 'string' && !!id)
								.map((id) => ({ field, id }));
						})
				: [];
			return {
				targets,
				key: JSON.stringify([
					this.document()?.uid,
					this.messages.locale(),
					targets.map(({ field, id }) => [field.property, field.directoryName, id]),
				]),
			};
		},
		{ equal: (previous, next) => previous.key === next.key },
	);
	readonly sections = computed(() => {
		const fields = this.fields();
		const groups = this.layout().sections;
		if (!groups?.length)
			return [
				{ id: 'default', label: '', labelKey: undefined as string | undefined, columns: 1, fields },
			];
		return groups.map((section) => ({
			...section,
			fields: section.properties
				.map((property) => fields.find((field) => field.property === property))
				.filter((field): field is ResolvedLayoutField => !!field),
		}));
	});
	idForSection(id: string): string {
		return `${this.id}-section-${id}`;
	}
	sectionLabel(section: { label: string; labelKey?: string }): string {
		return this.messages.text(section.labelKey, section.label);
	}

	private readonly structuredErrorValues = signal<
		Readonly<Record<string, string | LocalizedUiError>>
	>({});
	readonly structuredErrors: WritableSignal<Readonly<Record<string, string>>> =
		this.createStructuredErrors();
	readonly uploading = signal<Readonly<Record<string, readonly string[]>>>({});
	readonly dirty = signal(false);
	private readonly revision = signal(0);
	readonly invalid = computed(() => this.fields().some((field) => !!this.fieldError(field)));
	readonly readOnly = computed(
		() =>
			this.noEdit() ||
			['view', 'metadata'].includes(this.mode()) ||
			(!!this.document() &&
				(!this.document()?.changeToken || !hasPermission(this.document(), 'WriteProperties'))),
	);
	constructor() {
		inject(DestroyRef).onDestroy(() => {
			this.disposed = true;
			this.generation++;
			this.releaseWhenSafe();
			this.resolveDeparture(false);
		});
		effect(() => {
			this.tasks.run(() =>
				this.load(
					this.documentId(),
					this.layout(),
					this.parentId(),
					this.mode(),
					this.initialValues(),
				),
			);
		});
		effect((onCleanup) => {
			const { targets } = this.vocabularyRequests();
			this.vocabularyLabels.set({});
			if (!this.gateway.resolveReference || !targets.length) return;
			let active = true;
			const release = this.tasks.add();
			let released = false;
			const finish = () => {
				if (!released) {
					released = true;
					release();
				}
			};
			onCleanup(() => {
				active = false;
				finish();
			});
			void Promise.all(
				targets.map(async ({ field, id }) => {
					try {
						return {
							property: field.property,
							id,
							label: (await this.gateway.resolveReference!(field, id))?.label || id,
						};
					} catch {
						return { property: field.property, id, label: id };
					}
				}),
			)
				.then((entries) => {
					if (!active || this.disposed) return;
					const labels: Record<string, Record<string, string>> = {};
					for (const { property, id, label } of entries) (labels[property] ??= {})[id] = label;
					this.vocabularyLabels.set(labels);
				})
				.finally(finish);
		});
	}
	private async load(
		id: string | undefined,
		layout: DocumentLayout,
		parent: string | undefined,
		mode: LayoutMode,
		initial: Readonly<Record<string, unknown>> = this.initialValues(),
	): Promise<void> {
		const generation = ++this.generation;
		this.releaseWhenSafe();
		this.resolveDeparture(false);
		this.ready.set(false);
		this.loading.set(true);
		this.saving.set(false);
		this.error.set('');
		this.status.set('');
		this.dirty.set(false);
		this.structuredErrorValues.set({});
		this.uploading.set({});
		try {
			if (!id && !(['create', 'import'].includes(mode) && parent))
				throw new LocalizedUiError(
					'sdk.layout.missingDocument',
					'A document or parent folder is required.',
				);
			const [metadata, document] = await Promise.all([
				this.gateway.readType(layout.documentType),
				id ? this.gateway.read(id) : Promise.resolve(null),
			]);
			if (generation !== this.generation) return;
			if (document && document.type !== layout.documentType)
				throw new LocalizedUiError(
					'sdk.layout.wrongType',
					'The document type does not match this layout.',
				);
			this.fields.set(resolveLayoutFields(layout, metadata));
			this.document.set(document);
			this.baseline = Object.fromEntries(
				this.fields().map((field) => [
					field.property,
					cloneLayoutValue(document?.properties[field.property] ?? initial[field.property] ?? null),
				]),
			);
			this.values.set(this.cloneValues(this.baseline));
			this.ready.set(true);
		} catch (error) {
			if (generation === this.generation)
				this.error.setError(error, 'sdk.layout.loadFailed', 'The layout could not be loaded.');
		} finally {
			if (generation === this.generation) this.loading.set(false);
		}
	}
	async reload(): Promise<void> {
		if (this.dirty() && !(await this.canDeactivate())) return;
		await this.load(this.documentId(), this.layout(), this.parentId(), this.mode());
	}
	fieldId(field: ResolvedLayoutField): string {
		return `${this.id}-${field.property.replace(/[^a-z0-9_-]/gi, '-')}`;
	}
	inputType(field: ResolvedLayoutField): string {
		return field.type === 'boolean'
			? 'checkbox'
			: field.type === 'date'
				? 'date'
				: ['integer', 'long', 'double'].includes(field.type)
					? 'number'
					: 'text';
	}
	inputValue(field: ResolvedLayoutField): string {
		const value = this.values()[field.property];
		return value == null ? '' : field.type === 'date' ? String(value).slice(0, 10) : String(value);
	}
	display(field: ResolvedLayoutField): string {
		const value = this.values()[field.property];
		if (value == null) return '—';
		if (field.type === 'boolean')
			return value === true
				? this.messages.format('sdk.dialog.yes', {}, 'Yes')
				: this.messages.format('sdk.dialog.no', {}, 'No');
		if (field.type === 'blob') return this.blobDisplay(value);
		if (field.type === 'directory') {
			const label = (item: unknown) =>
				typeof item === 'string'
					? this.vocabularyLabels()[field.property]?.[item] || item
					: item && typeof item === 'object' && 'label' in item
						? String(item.label || ('id' in item ? item.id : '—'))
						: String(item ?? '');
			return Array.isArray(value) ? value.map(label).join(', ') : label(value);
		}
		if (field.type === 'reference')
			return typeof value === 'object' && 'label' in value
				? String((value as { label?: unknown }).label || (value as { id?: unknown }).id || '—')
				: String(value);
		if (field.type === 'date') {
			const date = String(value).slice(0, 10);
			return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))
				? formatDate(date, 'mediumDate', this.messages.locale(), 'UTC')
				: date;
		}
		if (
			['integer', 'long', 'double'].includes(field.type) &&
			typeof value === 'number' &&
			Number.isFinite(value)
		)
			return new Intl.NumberFormat(this.messages.locale(), { maximumFractionDigits: 20 }).format(
				value,
			);
		return typeof value === 'object' ? JSON.stringify(value) : String(value);
	}
	customWidget(field: ResolvedLayoutField): DocumentLayoutWidget | undefined {
		return field.widget ? this.widgets.find((widget) => widget.id === field.widget) : undefined;
	}
	widgetProps(field: ResolvedLayoutField): WidgetProps {
		const generation = this.generation;
		const revision = this.revision();
		return {
			field,
			value: cloneLayoutValue(this.values()[field.property]),
			labels: this.vocabularyLabels()[field.property],
			disabled: this.saving() || this.readOnly() || !!field.readOnly,
			mode: this.mode(),
			identity: `${this.document()?.uid || this.parentId() || 'new'}:${field.property}:${generation}`,
			revision,
			error: this.fieldError(field),
			commit: (value) => this.commit(field, value, generation, revision),
			upload: this.gateway.uploadBlob
				? async (file) => {
						const uploadId = `${generation}:${++this.nextUploadId}`;
						this.uploading.update((items) => ({
							...items,
							[field.property]: [...(items[field.property] || []), uploadId],
						}));
						try {
							const value = await this.gateway.uploadBlob!(file);
							if (generation !== this.generation || revision !== this.revision()) {
								void this.releaseBlob(value);
								throw new LocalizedUiError(
									'sdk.layout.uploadTargetChanged',
									'The upload target changed.',
								);
							}
							this.trackBlob(value);
							return value;
						} catch (error) {
							if (generation === this.generation && revision === this.revision())
								this.structuredErrorValues.update((errors) => ({
									...errors,
									[field.property]: new LocalizedUiError(
										'sdk.field.uploadFailed',
										'The file could not be uploaded.',
									),
								}));
							throw error;
						} finally {
							this.uploading.update((items) => {
								const remaining = (items[field.property] || []).filter((id) => id !== uploadId);
								if (remaining.length) return { ...items, [field.property]: remaining };
								const { [field.property]: _, ...rest } = items;
								return rest;
							});
						}
					}
				: undefined,
			search: this.gateway.searchReferences
				? (searchField, query) => this.gateway.searchReferences!(searchField, query)
				: undefined,
		};
	}
	private blobDisplay(value: unknown): string {
		if (Array.isArray(value))
			return value
				.map((item) => this.blobDisplay(item))
				.filter(Boolean)
				.join(', ');
		if (!value || typeof value !== 'object') return '';
		const blob = value as { name?: unknown; _name?: unknown };
		return typeof blob.name === 'string'
			? blob.name
			: typeof blob._name === 'string'
				? blob._name
				: this.messages.format('sdk.field.fileSelected', {}, 'File selected');
	}
	fieldLabel(field: ResolvedLayoutField): string {
		return field.labelKey ? this.messages.text(field.labelKey, field.label) : field.label;
	}
	private createStructuredErrors(): WritableSignal<Readonly<Record<string, string>>> {
		const text = linkedSignal<Readonly<Record<string, string>>>(() =>
			Object.fromEntries(
				Object.entries(this.structuredErrorValues()).map(([property, value]) => [
					property,
					value instanceof LocalizedUiError
						? this.messages.format(value.key, value.values, value.fallback)
						: value,
				]),
			),
		);
		// Callers see only strings. Public writes intentionally make the whole supplied
		// record literal, while internal changes preserve other fields' descriptors.
		return Object.assign(text, {
			set: (value: Readonly<Record<string, string>>) => this.structuredErrorValues.set(value),
			update: (
				update: (value: Readonly<Record<string, string>>) => Readonly<Record<string, string>>,
			) => this.structuredErrorValues.set(update(text())),
		});
	}
	private structuredError(property: string): string | null {
		return this.structuredErrors()[property] || null;
	}
	fieldError(field: ResolvedLayoutField): string | null {
		return (
			this.structuredError(field.property) ||
			layoutFieldError(field, this.values()[field.property], (key, values, fallback) =>
				this.messages.format(key, values, fallback),
			)
		);
	}
	update(field: ResolvedLayoutField, event: Event): void {
		const input = event.target as HTMLInputElement;
		this.commit(field, field.type === 'boolean' ? input.checked : input.value);
	}
	async validateReference(field: ResolvedLayoutField): Promise<void> {
		if (field.type !== 'reference' && field.type !== 'directory') return;
		const generation = this.generation;
		const value = this.values()[field.property];
		if (value == null || value === '') return;
		if (!this.gateway.resolveReference) {
			this.structuredErrorValues.update((errors) => ({
				...errors,
				[field.property]: new LocalizedUiError(
					'sdk.field.noResolver',
					'This application has no reference resolver.',
				),
			}));
			return;
		}
		try {
			const reference = await this.gateway.resolveReference(field, String(value));
			if (generation !== this.generation || this.values()[field.property] !== value) return;
			if (!reference) throw new Error('not found');
			this.structuredErrorValues.update(({ [field.property]: _, ...errors }) => errors);
			this.commit(field, reference.id);
		} catch {
			this.structuredErrorValues.update((errors) => ({
				...errors,
				[field.property]: new LocalizedUiError(
					'sdk.field.invalidReference',
					'Choose a valid reference.',
				),
			}));
		}
	}
	private commit(
		field: ResolvedLayoutField,
		value: unknown,
		generation = this.generation,
		revision = this.revision(),
	): void {
		if (generation !== this.generation || revision !== this.revision()) return;
		if (this.readOnly() || field.readOnly || this.saving()) return;
		this.values.update((values) => ({ ...values, [field.property]: cloneLayoutValue(value) }));
		this.releaseOrphanedBlobs();
		this.revision.update((value) => value + 1);
		this.dirty.set(
			this.fields().some(
				(item) =>
					!this.same(
						layoutPropertyValue(item, this.values()[item.property]),
						this.baseline[item.property],
					),
			),
		);
		this.status.set('');
		this.valueChanged.emit(this.draftProperties());
	}
	/** A cloned, normalized snapshot; schema read-only properties are never writable. */
	draftProperties(): Readonly<Record<string, unknown>> {
		return Object.fromEntries(
			this.fields()
				.filter((field) => !field.readOnly)
				.map((field) => [
					field.property,
					cloneLayoutValue(layoutPropertyValue(field, this.values()[field.property])),
				]),
		);
	}
	/** Keep draft uploads alive until the external writer has a definitive outcome. */
	protectDraft(): (outcome: 'committed' | 'failed' | 'uncertain') => void {
		const id = ++this.nextWriteId;
		const batches = this.currentBatchIds();
		this.pendingWriteBatches.set(id, batches);
		let finished = false;
		return (outcome) => {
			if (finished) return;
			finished = true;
			if (outcome !== 'failed') for (const batch of batches) this.transientBlobs.delete(batch);
			this.pendingWriteBatches.delete(id);
			if (this.disposed) this.releaseWhenSafe();
		};
	}
	async submit(event: Event): Promise<void> {
		event.preventDefault();
		if (
			this.draftOnly() ||
			this.readOnly() ||
			this.invalid() ||
			this.saving() ||
			Object.keys(this.uploading()).length ||
			!this.dirty()
		)
			return;
		const generation = this.generation;
		const writeId = ++this.nextWriteId;
		const protectedBatches = this.currentBatchIds();
		this.pendingWriteBatches.set(writeId, protectedBatches);
		let definitiveFailure = false;
		this.saving.set(true);
		this.error.set('');
		const properties = Object.fromEntries(
			this.fields()
				.filter(
					(field) =>
						!field.readOnly &&
						!this.same(
							layoutPropertyValue(field, this.values()[field.property]),
							this.baseline[field.property],
						),
				)
				.map((field) => [
					field.property,
					layoutPropertyValue(field, this.values()[field.property]),
				]),
		);
		try {
			const current = this.document();
			const saved = current
				? await this.gateway.update(current, properties)
				: await this.gateway.create(
						this.parentId()!,
						this.layout().documentType,
						this.name(),
						properties,
					);
			for (const batchId of protectedBatches) this.transientBlobs.delete(batchId);
			if (generation !== this.generation) return;
			this.document.set(saved);
			this.baseline = Object.fromEntries(
				this.fields().map((field) => [
					field.property,
					cloneLayoutValue(saved.properties[field.property] ?? null),
				]),
			);
			this.values.set(this.cloneValues(this.baseline));
			this.dirty.set(false);
			this.status.setMessage('sdk.layout.saved', 'Changes saved.');
			this.saved.emit(saved);
		} catch (error) {
			const status = (error as { status?: unknown })?.status;
			definitiveFailure =
				typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 500;
			if (generation === this.generation) {
				this.error.setMessage(
					status === 409 || status === 412
						? 'sdk.layout.conflict'
						: status === 403
							? 'sdk.layout.forbidden'
							: 'sdk.layout.saveFailed',
					status === 409 || status === 412
						? 'This document changed on the server. Your draft is preserved. Reload to review the latest version.'
						: status === 403
							? 'You no longer have permission to save this document.'
							: 'Saving failed. Your draft is preserved; retry when the server is available.',
				);
			}
		} finally {
			this.pendingWriteBatches.delete(writeId);
			if (definitiveFailure) this.releaseOrphanedBlobs();
			if (generation === this.generation) {
				this.saving.set(false);
			}
		}
	}
	discard(): void {
		if (this.saving()) return;
		this.revision.update((value) => value + 1);
		this.values.set(this.cloneValues(this.baseline));
		this.structuredErrorValues.set({});
		this.dirty.set(false);
		this.error.set('');
		this.status.setMessage('sdk.layout.discarded', 'Changes discarded.');
		this.releaseTransientBlobs();
		this.valueChanged.emit(this.draftProperties());
	}
	hasPendingChanges(): boolean {
		return this.dirty() || this.saving() || this.hasUploads();
	}
	hasUploads(): boolean {
		return Object.values(this.uploading()).some((ids) => ids.length > 0);
	}
	canDeactivate(): boolean | Promise<boolean> {
		if (this.saving() || this.hasUploads()) return false;
		if (!this.dirty()) return true;
		this.resolveDeparture(false);
		this.departurePending.set(true);
		return new Promise((resolve) => (this.departure = resolve));
	}
	resolveDeparture(allow: boolean): void {
		this.departure?.(allow);
		this.departure = undefined;
		this.departurePending.set(false);
	}
	discardAndLeave(): void {
		this.discard();
		this.resolveDeparture(true);
	}
	private cloneValues(
		values: Readonly<Record<string, unknown>>,
	): Readonly<Record<string, unknown>> {
		return Object.fromEntries(
			Object.entries(values).map(([key, value]) => [key, cloneLayoutValue(value)]),
		);
	}
	private same(a: unknown, b: unknown): boolean {
		return JSON.stringify(a) === JSON.stringify(b);
	}
	private trackBlob(blob: import('./document-layout').BlobValue): void {
		const batchId = blob['upload-batch'];
		if (batchId) this.transientBlobs.set(batchId, blob);
	}
	private releaseTransientBlobs(): void {
		for (const [batchId, blob] of this.transientBlobs) {
			if (this.isBatchProtected(batchId)) continue;
			this.transientBlobs.delete(batchId);
			void this.releaseBlob(blob);
		}
	}
	private releaseWhenSafe(): void {
		this.releaseTransientBlobs();
	}
	private releaseOrphanedBlobs(): void {
		const attached = new Set<string>();
		for (const value of Object.values(this.values())) this.collectBatchIds(value, attached);
		for (const [batchId, blob] of this.transientBlobs) {
			if (!attached.has(batchId) && !this.isBatchProtected(batchId)) {
				this.transientBlobs.delete(batchId);
				void this.releaseBlob(blob);
			}
		}
	}
	private currentBatchIds(): ReadonlySet<string> {
		const batches = new Set<string>();
		for (const value of Object.values(this.values())) this.collectBatchIds(value, batches);
		return batches;
	}
	private isBatchProtected(batchId: string): boolean {
		for (const batches of this.pendingWriteBatches.values()) if (batches.has(batchId)) return true;
		return false;
	}
	private collectBatchIds(value: unknown, batches: Set<string>): void {
		if (!value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			for (const item of value) this.collectBatchIds(item, batches);
			return;
		}
		const object = value as Record<string, unknown>;
		if (typeof object['upload-batch'] === 'string') batches.add(object['upload-batch']);
		for (const item of Object.values(object)) this.collectBatchIds(item, batches);
	}
	private async releaseBlob(blob: import('./document-layout').BlobValue): Promise<void> {
		try {
			await this.gateway.releaseBlob?.(blob);
		} catch {
			return;
		}
	}
}
