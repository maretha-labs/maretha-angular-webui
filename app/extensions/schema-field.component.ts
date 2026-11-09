import { localizedState } from './i18n/localized-state';
import { WebUiMessagePipe } from './webui-messages';
import { WebUiMessages } from './webui-messages';
import { SuggestionScope, SuggestionSettings, suggestionMinCharsText } from './suggestion-settings';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	ElementRef,
	effect,
	untracked,
	forwardRef,
	input,
	inject,
	OnDestroy,
	signal,
} from '@angular/core';
import {
	ResolvedLayoutField,
	SchemaFieldMetadata,
	WidgetProps,
	cloneLayoutValue,
} from './document-layout';

let nextFieldId = 0;
@Component({
	selector: 'nx-schema-field',
	imports: [forwardRef(() => SchemaFieldComponent), WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	styleUrls: ['./schema-controls.component.css'],
	template: `
		@if (field().type === 'directory' || (field().type === 'reference' && !field().multiple)) {
			<div class="control directory-control" (focusout)="directoryBlur($event)">
				<label [for]="id()">{{ fieldLabel() }}{{ field().required ? ' *' : '' }}</label>
				@if (field().multiple && list().length) {
					<div class="directory-values">
						@for (value of list(); track $index; let index = $index) {
							<span class="directory-value"
								>{{ directoryLabel(value) }}
								<button
									type="button"
									[disabled]="props().disabled"
									(click)="remove(index)"
									[attr.aria-label]="'app.sdk.schema-field.remove-7bd9fb' | webuiMessage: 'Remove'"
								>
									×
								</button>
							</span>
						}
					</div>
				}
				<div class="directory-input">
					<input
						class="directory-query"
						[id]="id()"
						role="combobox"
						aria-autocomplete="list"
						aria-haspopup="listbox"
						[attr.aria-expanded]="directoryOpen()"
						[attr.aria-controls]="id() + '-options'"
						[value]="field().type === 'directory' ? directoryInputValue() : text(props().value)"
						[placeholder]="
							'dublincoreEdit.directorySuggestion.placeholder' | webuiMessage: 'Select a value.'
						"
						[disabled]="props().disabled"
						[attr.aria-required]="!!field().required"
						[attr.aria-invalid]="currentError() ? true : null"
						[attr.aria-describedby]="describedBy()"
						autocomplete="off"
						(focus)="field().type === 'directory' && openDirectory()"
						(input)="lookup($event)"
						(keydown.arrowdown)="openDirectory($event)"
						(keydown.escape)="closeDirectory($event)"
					/>
					@if (!field().multiple && props().value) {
						<button
							type="button"
							class="directory-clear"
							[disabled]="props().disabled"
							(click)="clearDirectory()"
							[attr.aria-label]="'app.sdk.schema-field.remove-7bd9fb' | webuiMessage: 'Remove'"
						>
							×
						</button>
					}
					<button
						type="button"
						class="directory-toggle"
						[disabled]="props().disabled"
						(click)="toggleDirectory()"
						[attr.aria-label]="
							'sdk.field.matches' | webuiMessage: '{label} matches' : { label: fieldLabel() }
						"
						[attr.aria-expanded]="directoryOpen()"
					>
						<span aria-hidden="true">▾</span>
					</button>
				</div>
				@if (
					directoryOpen() ||
					(field().type === 'reference' &&
						(lookupLoading() || lookupComplete() || lookupHint() || options().length))
				) {
					<div class="directory-popup">
						@if (lookupLoading()) {
							<p role="status">
								{{
									'app.sdk.schema-field.loading-matches-388fb6' | webuiMessage: 'Loading matches…'
								}}
							</p>
						}
						@if (lookupHint() && !lookupLoading()) {
							<p role="status">{{ lookupHint() }}</p>
						}
						@if (lookupComplete() && !lookupLoading() && !options().length && !lookupError()) {
							<p>
								{{
									'app.sdk.schema-field.no-matches-found-1c9c32' | webuiMessage: 'No matches found.'
								}}
							</p>
						}
						<ul
							[id]="id() + '-options'"
							role="listbox"
							[attr.aria-multiselectable]="field().multiple ? true : null"
							[attr.aria-label]="
								'sdk.field.matches' | webuiMessage: '{label} matches' : { label: fieldLabel() }
							"
						>
							@for (option of options(); track option.id) {
								<li role="presentation">
									<button
										type="button"
										role="option"
										[disabled]="props().disabled"
										[attr.aria-selected]="directorySelected(option.id)"
										(click)="choose(option.id)"
									>
										{{ option.label || option.id }}
									</button>
								</li>
							}
						</ul>
					</div>
				}
			</div>
		} @else if (field().type === 'complex' && !field().multiple) {
			<fieldset [attr.aria-describedby]="describedBy()">
				<legend>{{ fieldLabel() }}{{ field().required ? ' *' : '' }}</legend>
				@for (child of children(); track child.property) {
					<nx-schema-field [props]="childProps(child)" />
				}
			</fieldset>
		} @else if (field().multiple) {
			<fieldset class="list" [attr.aria-describedby]="describedBy()">
				<legend>{{ fieldLabel() }}{{ field().required ? ' *' : '' }}</legend>
				@for (item of list(); track itemIdentity(item, $index); let index = $index) {
					<div class="item">
						<nx-schema-field [props]="itemProps(item, index)" />
						<div class="item-actions">
							<button
								type="button"
								[disabled]="props().disabled || index === 0"
								(click)="move(index, -1)"
							>
								{{ 'app.sdk.schema-field.move-up-025ce1' | webuiMessage: 'Move up' }}</button
							><button
								type="button"
								[disabled]="props().disabled || index === list().length - 1"
								(click)="move(index, 1)"
							>
								{{ 'app.sdk.schema-field.move-down-d7d110' | webuiMessage: 'Move down' }}</button
							><button type="button" [disabled]="props().disabled" (click)="remove(index)">
								{{ 'app.sdk.schema-field.remove-7bd9fb' | webuiMessage: 'Remove' }}
							</button>
						</div>
					</div>
				}
				<button type="button" [disabled]="props().disabled" (click)="add()">
					{{ 'sdk.field.add' | webuiMessage: 'Add {label}' : { label: fieldLabel() } }}
				</button>
			</fieldset>
		} @else if (field().type === 'blob') {
			<div class="control">
				<label [for]="id()">{{ fieldLabel() }}{{ field().required ? ' *' : '' }}</label>
				@if (blobName()) {
					<p class="blob-name">{{ blobName() }}</p>
					<button type="button" [disabled]="props().disabled" (click)="clearBlob()">
						{{
							'app.modules.standard-content-editor.remove-file-73be3e' | webuiMessage: 'Remove file'
						}}
					</button>
				}
				<input
					[id]="id()"
					type="file"
					[disabled]="props().disabled"
					[required]="!!field().required && !blobName()"
					[attr.aria-invalid]="currentError() ? true : null"
					[attr.aria-describedby]="describedBy()"
					(change)="pick($event)"
				/>
			</div>
		} @else {
			<div class="control">
				<label [for]="id()">{{ fieldLabel() }}{{ field().required ? ' *' : '' }}</label
				><input
					[id]="id()"
					[type]="inputType()"
					[checked]="props().value === true"
					[value]="text(props().value)"
					[disabled]="props().disabled"
					[required]="!!field().required"
					[attr.step]="field().type === 'double' ? 'any' : null"
					[attr.min]="field().min ?? null"
					[attr.max]="field().max ?? null"
					[attr.maxlength]="field().maxLength ?? null"
					[attr.aria-invalid]="currentError() ? true : null"
					[attr.aria-describedby]="describedBy()"
					(input)="scalar($event)"
				/>
			</div>
		}
		@if (currentError()) {
			<span class="validation" [id]="errorId()">{{ currentError() }}</span>
		}
	`,
	styles: `
		.item {
			display: grid;
			gap: 6px;
			margin: 8px 0;
			padding: 8px;
			border: 1px solid var(--nuxeo-border);
		}
		.item-actions {
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
		}
		fieldset {
			border: 1px solid var(--nuxeo-border);
			margin: 8px 0;
			padding: 10px;
		}
		.control {
			display: flex;
			flex-direction: column;
			gap: 6px;
		}
		.validation {
			color: var(--nuxeo-warn-text);
		}
		.blob-name {
			margin: 0;
		}
		ul {
			margin: 0;
			padding: 0;
			list-style: none;
		}
		.directory-control {
			position: relative;
		}
		.directory-input {
			display: flex;
			align-items: center;
			gap: 4px;
			border-bottom: 1px solid var(--nuxeo-border, #a6a8ad);
		}
		:host .directory-input input {
			flex: 1;
			min-width: 0;
			border: 0;
			min-height: 36px;
			padding: 6px 0;
			background: transparent;
			box-shadow: none;
		}
		:host .directory-input button {
			flex: none;
			border: 0;
			background: transparent;
			min-width: 30px;
			padding: 4px;
		}
		.directory-input:focus-within {
			border-bottom-color: var(--nuxeo-primary-color, #006bff);
		}
		.directory-values {
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
		}
		.directory-value {
			display: inline-flex;
			align-items: center;
			gap: 5px;
			padding: 3px 5px 3px 8px;
			background: var(--nuxeo-pill-background, #edf0f3);
			border-radius: 3px;
		}
		:host .directory-value button {
			min-height: 24px;
			border: 0;
			padding: 0 4px;
			background: transparent;
		}
		.directory-popup {
			border: 1px solid var(--nuxeo-border, #d8d8dc);
			background: var(--nuxeo-box, #fff);
			max-height: 240px;
			overflow: auto;
		}
		.directory-popup p {
			margin: 0;
			padding: 10px;
		}
		:host .directory-popup button {
			width: 100%;
			text-align: start;
			border: 0;
			border-radius: 0;
			padding: 9px 12px;
			background: transparent;
		}
		.directory-popup button[aria-selected='true'] {
			font-weight: 600;
			color: var(--nuxeo-primary-color, #006bff);
		}
	`,
})
export class SchemaFieldComponent implements OnDestroy {
	private readonly messages = inject(WebUiMessages);
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
	readonly props = input.required<WidgetProps>();
	readonly options = signal<readonly { id: string; label?: string }[]>([]);
	readonly lookupLoading = signal(false);
	readonly lookupError = localizedState('');
	readonly lookupComplete = signal(false);
	/** Stock "Please enter {0} or more characters" while the query is shorter than `minChars`. */
	readonly lookupHint = signal('');
	private readonly suggestionSettings = inject(SuggestionSettings);
	private readonly suggestionScope = inject(SuggestionScope, { optional: true });
	/** Stock nuxeo-directory-suggestion and nuxeo-document-suggestion `minChars`, and the pause. */
	readonly limits = computed(() =>
		this.suggestionSettings.resolve({
			widget: this.field().type === 'directory' ? 'directory' : 'document',
			layout: this.suggestionScope?.layout() ?? null,
			field: this.field().property,
		}),
	);
	readonly query = signal('');
	readonly directoryOpen = signal(false);
	private readonly directoryLabels = signal<Readonly<Record<string, string>>>({});
	private directoryLabelScope?: string;
	private lookupGeneration = 0;
	private lookupTimer?: ReturnType<typeof setTimeout>;
	private listState?: { readonly values: readonly unknown[]; readonly keys: readonly string[] };
	private nextItemKey = 0;
	private lookupScope?: string;
	private lookupLocale?: string;
	private readonly instance = ++nextFieldId;
	constructor() {
		effect(() => {
			const props = this.props();
			const scope = this.lookupToken(props);
			const labelScope = `${props.identity}:${props.field.directoryName ?? ''}`;
			if (this.directoryLabelScope !== labelScope) this.directoryLabels.set({});
			this.directoryLabelScope = labelScope;
			const locale = this.messages.locale();
			if (
				this.lookupScope === scope &&
				this.lookupLocale !== undefined &&
				this.lookupLocale !== locale
			) {
				untracked(() => {
					const query = this.query();
					if (
						(query.trim() || this.directoryOpen()) &&
						query.trim().length >= this.limits().minChars &&
						this.props().search
					) {
						if (this.lookupTimer) clearTimeout(this.lookupTimer);
						this.options.set([]);
						this.lookupLoading.set(true);
						void this.search(this.props(), query, ++this.lookupGeneration);
					}
				});
			}
			this.lookupLocale = locale;
			if (this.lookupScope !== undefined && this.lookupScope !== scope) this.cancelLookup();
			this.lookupScope = scope;
		});
	}

	ngOnDestroy(): void {
		this.cancelLookup();
	}
	id(): string {
		return `nx-schema-field-${this.props().identity}-${this.instance}`.replace(
			/[^a-z0-9_-]/gi,
			'-',
		);
	}
	errorId(): string {
		return `${this.id()}-error`;
	}
	describedBy(): string | null {
		return this.currentError() ? this.errorId() : null;
	}
	field(): ResolvedLayoutField {
		return this.props().field;
	}
	fieldLabel(): string {
		const field = this.field();
		return field.labelKey ? this.messages.text(field.labelKey, field.label) : field.label;
	}
	currentError(): string | null {
		return this.lookupError() || this.props().error;
	}
	list(): readonly unknown[] {
		return Array.isArray(this.props().value) ? (this.props().value as readonly unknown[]) : [];
	}
	itemIdentity(_item: unknown, index: number): string {
		return this.listKeys()[index];
	}
	itemField(): ResolvedLayoutField {
		const field = this.field();
		return { ...field, multiple: false, type: field.itemType || field.type };
	}
	children(): readonly ResolvedLayoutField[] {
		return Object.entries(this.field().fields || {}).map(([property, raw]) =>
			this.childField(property, raw),
		);
	}
	private childField(property: string, raw: string | SchemaFieldMetadata): ResolvedLayoutField {
		const definition = typeof raw === 'string' ? { type: raw } : raw;
		const multiple = !!definition.type?.endsWith('[]');
		const type = (
			multiple ? definition.type!.slice(0, -2) : definition.type || 'complex'
		) as ResolvedLayoutField['type'];
		return {
			...definition,
			property,
			label: property,
			type,
			itemType: multiple ? type : undefined,
			multiple,
			fields: definition.fields,
		};
	}
	childProps(field: ResolvedLayoutField): WidgetProps {
		const root = this.props();
		const object = this.object(root.value);
		return {
			...root,
			field,
			value: cloneLayoutValue(object[field.property]),
			identity: `${root.identity}:${field.property}`,
			commit: (value) => root.commit({ ...object, [field.property]: value }),
		};
	}
	itemProps(item: unknown, index: number): WidgetProps {
		const root = this.props();
		const key = this.listKeys()[index];
		return {
			...root,
			field: this.itemField(),
			value: item,
			identity: `${root.identity}:item:${this.listKeys()[index]}`,
			commit: (value) => {
				if (this.props().identity !== root.identity) return;
				const keys = this.listKeys();
				const currentIndex = keys.indexOf(key);
				if (currentIndex < 0) return;
				const next = [...this.list()];
				next[currentIndex] = value;
				this.rememberList(next, keys);
				root.commit(next);
			},
		};
	}
	inputType(): string {
		const type = this.field().type;
		return type === 'boolean'
			? 'checkbox'
			: type === 'date'
				? 'date'
				: ['integer', 'long', 'double'].includes(type)
					? 'number'
					: 'text';
	}
	text(value: unknown): string {
		if (value == null || typeof value === 'object') return '';
		return this.field().type === 'date' ? String(value).slice(0, 10) : String(value);
	}
	blobName(): string {
		const value = this.props().value;
		if (!value || typeof value !== 'object') return '';
		const blob = value as { name?: unknown; _name?: unknown };
		return typeof blob.name === 'string'
			? blob.name
			: typeof blob._name === 'string'
				? blob._name
				: this.messages.format('sdk.field.fileSelected', {}, 'File selected');
	}
	scalar(event: Event): void {
		const input = event.target as HTMLInputElement;
		this.props().commit(this.field().type === 'boolean' ? input.checked : input.value);
	}
	add(): void {
		const next = [...this.list(), this.defaultValue(this.itemField())];
		this.rememberList(next, [...this.listKeys(), this.newItemKey()]);
		this.props().commit(next);
	}
	remove(index: number): void {
		const next = this.list().filter((_, item) => item !== index);
		this.rememberList(
			next,
			this.listKeys().filter((_, item) => item !== index),
		);
		this.props().commit(next);
	}
	move(index: number, delta: number): void {
		const next = [...this.list()];
		const target = index + delta;
		if (target < 0 || target >= next.length) return;
		[next[index], next[target]] = [next[target], next[index]];
		const keys = [...this.listKeys()];
		[keys[index], keys[target]] = [keys[target], keys[index]];
		this.rememberList(next, keys);
		this.props().commit(next);
	}
	clearBlob(): void {
		this.props().commit(null);
	}
	async pick(event: Event): Promise<void> {
		const props = this.props();
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !props.upload) {
			this.lookupError.setMessage('sdk.field.noUpload', 'This widget has no upload gateway.');
			input.value = '';
			return;
		}
		try {
			props.commit(await props.upload(file));
		} catch (error) {
			this.lookupError.setError(error, 'sdk.field.uploadFailed', 'The file could not be uploaded.');
		} finally {
			input.value = '';
		}
	}
	lookup(event: Event): void {
		if (this.props().disabled) return;
		const query = (event.target as HTMLInputElement).value;
		const generation = ++this.lookupGeneration;
		if (this.lookupTimer) clearTimeout(this.lookupTimer);
		this.query.set(query);
		this.options.set([]);
		this.lookupError.set('');
		this.lookupHint.set('');
		this.lookupComplete.set(false);
		if (this.field().type === 'directory') this.directoryOpen.set(true);
		if (!query.trim() && this.field().type !== 'directory') {
			this.lookupLoading.set(false);
			this.props().commit(null);
			return;
		}
		const props = this.props();
		if (!props.search) {
			this.lookupError.setMessage(
				'sdk.field.noSearch',
				'This application has no reference search.',
			);
			return;
		}
		const { minChars, pauseMs } = this.limits();
		if (query.trim().length < minChars) {
			this.lookupLoading.set(false);
			this.lookupHint.set(suggestionMinCharsText(this.messages, minChars));
			return;
		}
		this.lookupLoading.set(true);
		this.lookupTimer = setTimeout(() => void this.search(props, query, generation), pauseMs);
	}
	directoryLabel(value: unknown): string {
		const id = typeof value === 'string' ? value : '';
		return this.props().labels?.[id] || this.directoryLabels()[id] || id;
	}
	directoryInputValue(): string {
		return this.query() || (this.field().multiple ? '' : this.directoryLabel(this.props().value));
	}
	directorySelected(id: string): boolean {
		return this.field().multiple ? this.list().includes(id) : this.props().value === id;
	}
	openDirectory(event?: Event): void {
		event?.preventDefault();
		if (this.props().disabled || this.directoryOpen()) return;
		this.directoryOpen.set(true);
		this.query.set('');
		this.options.set([]);
		this.lookupError.set('');
		this.lookupHint.set('');
		this.lookupComplete.set(false);
		if (!this.props().search) {
			this.lookupError.setMessage(
				'sdk.field.noSearch',
				'This application has no reference search.',
			);
			return;
		}
		if (this.lookupTimer) clearTimeout(this.lookupTimer);
		const { minChars } = this.limits();
		if (minChars > 0) {
			this.lookupHint.set(suggestionMinCharsText(this.messages, minChars));
			return;
		}
		this.lookupLoading.set(true);
		void this.search(this.props(), '', ++this.lookupGeneration);
	}
	toggleDirectory(): void {
		if (this.directoryOpen()) this.closeDirectory();
		else this.openDirectory();
	}
	closeDirectory(event?: Event): void {
		event?.preventDefault();
		this.cancelLookup();
	}
	directoryBlur(event: FocusEvent): void {
		if (!this.element.nativeElement.contains(event.relatedTarget as Node | null))
			this.closeDirectory();
	}
	clearDirectory(): void {
		if (this.props().disabled) return;
		this.props().commit(null);
		this.closeDirectory();
	}
	private async search(props: WidgetProps, query: string, generation: number): Promise<void> {
		try {
			const options = await props.search!(props.field, query);
			if (
				generation !== this.lookupGeneration ||
				this.lookupToken(props) !== this.lookupToken(this.props())
			)
				return;
			if (props.field.type === 'directory')
				this.directoryLabels.update((labels) => ({
					...labels,
					...Object.fromEntries(options.map((option) => [option.id, option.label || option.id])),
				}));
			this.options.set(options);
			this.lookupComplete.set(true);
		} catch {
			if (
				generation !== this.lookupGeneration ||
				this.lookupToken(props) !== this.lookupToken(this.props())
			)
				return;
			this.lookupError.setMessage('sdk.field.searchFailed', 'References could not be loaded.');
			this.lookupComplete.set(true);
		} finally {
			if (
				generation === this.lookupGeneration &&
				this.lookupToken(props) === this.lookupToken(this.props())
			)
				this.lookupLoading.set(false);
		}
	}
	choose(id: string): void {
		if (this.props().disabled) return;
		if (this.field().type === 'directory' && this.field().multiple) {
			if (!this.list().includes(id)) this.props().commit([...this.list(), id]);
		} else this.props().commit(id);
		this.options.set([]);
		this.query.set('');
		this.lookupComplete.set(false);
		this.directoryOpen.set(false);
	}
	private defaultValue(field: ResolvedLayoutField): unknown {
		if (field.type === 'complex') return {};
		if (field.type === 'boolean') return false;
		return null;
	}
	private object(value: unknown): Readonly<Record<string, unknown>> {
		return value && typeof value === 'object' && !Array.isArray(value)
			? (value as Readonly<Record<string, unknown>>)
			: {};
	}
	private listKeys(): readonly string[] {
		const values = this.list();
		if (!this.listState || !this.sameList(this.listState.values, values))
			this.listState = { values, keys: values.map(() => this.newItemKey()) };
		return this.listState.keys;
	}
	private rememberList(values: readonly unknown[], keys: readonly string[]): void {
		this.listState = { values, keys };
	}
	private newItemKey(): string {
		return `item-${++this.nextItemKey}`;
	}
	private sameList(left: readonly unknown[], right: readonly unknown[]): boolean {
		return (
			left.length === right.length &&
			left.every((item, index) => JSON.stringify(item) === JSON.stringify(right[index]))
		);
	}
	private cancelLookup(): void {
		this.lookupGeneration++;
		if (this.lookupTimer) clearTimeout(this.lookupTimer);
		this.lookupTimer = undefined;
		this.options.set([]);
		this.lookupLoading.set(false);
		this.lookupError.set('');
		this.lookupHint.set('');
		this.lookupComplete.set(false);
		this.query.set('');
		this.directoryOpen.set(false);
	}
	private lookupToken(props: WidgetProps): string {
		return `${props.identity}:${props.revision ?? 0}`;
	}
}
