import {
	comparisonEntryLabel,
	nativeDirectoryLabel,
} from '../helpers/document-comparison-resolver.service';
import { NgComponentOutlet, formatDate } from '@angular/common';
import {
	errorMessage,
	localizedText,
	messageText,
	MessageText,
} from 'app/helpers/localized-message';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	Input,
	OnChanges,
	OnDestroy,
	OnInit,
	SimpleChanges,
	inject,
	effect,
	untracked,
} from '@angular/core';
import {
	DOCUMENT_LAYOUT_WIDGETS,
	DocumentFieldExtensionRegistry,
	DocumentLayoutWidget,
	DocumentLayoutContext,
	LayoutField,
	documentLayoutContext,
	layoutFieldError,
	DocumentTypeMetadata,
	LayoutDocument,
	ResolvedLayoutField,
	SchemaFieldComponent,
	WebUiMessagePipe,
	WebUiMessages,
	WidgetProps,
	resolveLayoutFields,
	cloneLayoutValue,
} from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subscription } from 'rxjs';
import { DocumentLayoutGatewayService } from '../helpers/document-layout-gateway.service';
import { MetadataPolicyService, UserMetadataPreferences } from '../helpers/metadata-policy.service';
import { DocumentsManagerService } from '../helpers/documents-manager.service';

interface MetadataField {
	property: string;
	name: string;
	schema: string;
	value: unknown;
	type?: string;
}

/** Policy-aware metadata reader. Values denied by the policy never enter the DOM. */
@Component({
	selector: 'nx-default-document-metadata-layout',
	standalone: true,
	imports: [SchemaFieldComponent, WebUiMessagePipe, NgComponentOutlet],
	template: ` @if (modal && !embedded) {
			<div class="modal-header">
				<h4 class="modal-title text-truncate">
					{{ 'documentInfo.title' | webuiMessage: 'Document information' }}
				</h4>
				<button
					type="button"
					class="btn-close"
					[attr.aria-label]="'command.close' | webuiMessage: 'Close'"
					(click)="close()"
				></button>
			</div>
		}
		<div [class.modal-body]="modal && !embedded" data-layout-mode="metadata">
			@if (!externalToolbar) {
				<div class="metadata-toolbar">
					@if (editing) {
						<button
							type="button"
							class="btn btn-sm btn-outline-secondary"
							[disabled]="saving"
							(click)="cancelEdit()"
						>
							{{
								'app.modules.default-document-metadata-layout.cancel-8bc5e9'
									| webuiMessage: 'Cancel'
							}}
						</button>
						<button
							type="button"
							class="btn btn-sm btn-primary"
							[disabled]="saving || !dirty || hasInvalidChanges"
							(click)="save()"
						>
							{{
								saving
									? ('sdk.layout.saving' | webuiMessage: 'Saving…')
									: ('app.modules.default-document-metadata-layout.save-changes-baa2a7'
										| webuiMessage: 'Save changes')
							}}
						</button>
					} @else {
						<button
							type="button"
							class="btn btn-sm btn-outline-secondary"
							(click)="customizing = !customizing"
						>
							{{
								'app.modules.default-document-metadata-layout.customize-bf2d9d'
									| webuiMessage: 'Customize'
							}}
						</button>
						@if (hasEditableFields) {
							<button type="button" class="btn btn-sm btn-primary" (click)="beginEdit()">
								{{
									'app.modules.default-document-metadata-layout.edit-metadata-d96a3a'
										| webuiMessage: 'Edit metadata'
								}}
							</button>
						}
					}
				</div>
			}
			@if (saveError) {
				<div class="alert alert-danger py-2">{{ saveError }}</div>
			}
			@if (customizing) {
				<section
					class="metadata-customize"
					[attr.aria-label]="
						'app.modules.default-document-metadata-layout.customize-metadata-9cada1'
							| webuiMessage: 'Customize metadata'
					"
				>
					<strong>{{
						'app.modules.default-document-metadata-layout.visible-fields-5fafa0'
							| webuiMessage: 'Visible fields'
					}}</strong>
					<p class="text-muted mb-2">
						{{
							'metadata.chooseFields'
								| webuiMessage
									: 'Choose fields shown for {type}. Administrator-restricted fields are not listed.'
									: {
											type:
												document?.type ||
												('metadata.thisType' | webuiMessage: 'this document type'),
									  }
						}}
					</p>
					@for (field of allowedFields; track field.property; let index = $index) {
						<div class="metadata-customize-field">
							<label
								><input
									type="checkbox"
									[checked]="!preferences().hiddenFields.includes(field.property)"
									(change)="setFieldHidden(field.property, $any($event.target).checked)"
								/>
								{{ fieldLabel(field) }}</label
							><span
								><button
									class="btn btn-sm btn-link"
									[disabled]="index === 0"
									(click)="moveField(field.property, -1)"
								>
									↑</button
								><button
									class="btn btn-sm btn-link"
									[disabled]="index === allowedFields.length - 1"
									(click)="moveField(field.property, 1)"
								>
									↓
								</button></span
							>
						</div>
					}
					@if (allowedSchemas.length > 1) {
						<div class="metadata-schema-options">
							@for (schema of allowedSchemas; track schema) {
								<label
									><input
										type="checkbox"
										[checked]="!preferences().hiddenSchemas.includes(schema)"
										(change)="setSchemaHidden(schema, $any($event.target).checked)"
									/>
									{{ schema }}</label
								>
							}
						</div>
					}
					<button type="button" class="btn btn-link btn-sm p-0" (click)="resetCustomization()">
						{{
							'app.modules.default-document-metadata-layout.show-all-allowed-fields-20a225'
								| webuiMessage: 'Show all allowed fields'
						}}
					</button>
				</section>
			}
			@if (preferences().metadataHidden) {
				<p class="text-muted mb-0">
					{{
						'app.modules.default-document-metadata-layout.metadata-is-hidden-in-your-display-prefere-684259'
							| webuiMessage: 'Metadata is hidden in your display preferences.'
					}}
				</p>
			} @else {
				@if (!editing) {
					<label class="empty-fields-toggle"
						><input
							type="checkbox"
							[checked]="showEmptyFields"
							(change)="showEmptyFields = $any($event.target).checked"
						/>

						{{
							'app.modules.default-document-metadata-layout.show-empty-fields-16e57e'
								| webuiMessage: 'Show empty fields'
						}}</label
					>
				}
				<div class="metadata-grid">
					@for (schema of visibleSchemas; track schema.name) {
						<section class="metadata-schema">
							<h5>
								{{
									schema.name === 'dc'
										? ('app.modules.default-document-metadata-layout.descriptive-metadata-48a40e'
											| webuiMessage: 'Descriptive metadata')
										: schema.name
								}}
							</h5>
							@for (field of schema.fields; track field.property) {
								<section class="metadata-field" [attr.data-field]="field.name">
									@if (!editing || !canEdit(field)) {
										<div class="metadata-label">{{ fieldLabel(field) }}</div>
									}
									@if (editing && canEdit(field)) {
										@if (widgetProps(field); as props) {
											@if (customWidget(field); as widget) {
												<ng-container
													*ngComponentOutlet="widget.component; inputs: { props: props }"
												/>
											} @else {
												<nx-schema-field [props]="props" />
											}
										}
									} @else {
										<div class="metadata-value" [class.multiline]="isMultiline(field.value)">
											{{ display(field.value, directoryFor(field.property), field.type) || '—' }}
										</div>
									}
								</section>
							}
						</section>
					}
				</div>
			}
		</div>`,
	styles: [
		`
			.metadata-toolbar {
				position: sticky;
				top: 0;
				z-index: 2;
				background: var(--nuxeo-box, #fff);
				padding-block: 8px;
				flex-wrap: wrap;
				display: flex;
				justify-content: flex-end;
				gap: 0.5rem;
				margin-bottom: 0.75rem;
			}
			.metadata-grid {
				display: grid;
				gap: 1rem;
			}
			.metadata-schema {
				display: grid;
				gap: 0.75rem;
			}
			.metadata-schema h5 {
				border-bottom: 0;
				font-size: 13px;
				font-weight: 600;
				margin: 0;
				padding-bottom: 0.35rem;
			}
			.metadata-label {
				font-size: 12px;
				color: var(--bs-secondary-color);
				font-weight: 400;
			}
			.empty-fields-toggle {
				display: flex;
				align-items: center;
				gap: 8px;
				font-size: 12px;
				color: var(--bs-secondary-color);
				margin-bottom: 16px;
			}
			.metadata-value {
				font-size: 14px;
				line-height: 1.5;
				font-weight: 500;
				white-space: pre-wrap;
			}
			.metadata-actions {
				display: flex;
				gap: 0.5rem;
				margin-top: 0.35rem;
			}
			.metadata-customize {
				border: 1px solid #dee2e6;
				border-radius: 0.25rem;
				padding: 0.75rem;
				margin-bottom: 1rem;
				display: grid;
				gap: 0.45rem;
			}
			.metadata-customize label {
				display: block;
			}
			.metadata-customize-field {
				display: flex;
				justify-content: space-between;
				align-items: center;
			}
			.metadata-schema-options {
				display: flex;
				gap: 1rem;
				flex-wrap: wrap;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefaultDocumentMetadataLayoutComponent implements OnChanges, OnInit, OnDestroy {
	@Input() document: LayoutDocument | any;
	@Input() layoutContext: DocumentLayoutContext | undefined;
	@Input() embedded = false;
	@Input() externalToolbar = false;
	@Input() noEdit = false;
	readonly modal = inject(BsModalRef, { optional: true });
	private readonly messages = inject(WebUiMessages);
	private directoryLocale = this.messages.locale();
	constructor() {
		effect(() => {
			const locale = this.messages.locale();
			if (this.directoryLocale !== locale) {
				this.directoryLocale = locale;
				untracked(() => this.resolveDirectories());
			}
		});
	}
	private readonly fieldExtensions = inject(DocumentFieldExtensionRegistry);
	private readonly widgets = inject(DOCUMENT_LAYOUT_WIDGETS, { optional: true }) ?? [];
	private readonly gateway = inject(DocumentLayoutGatewayService);
	private readonly policy = inject(MetadataPolicyService);
	private readonly documents = inject(DocumentsManagerService);
	private readonly cdr = inject(ChangeDetectorRef);
	private requests = new Subscription();
	private labels = new Map<string, string>();
	private fieldTypes: Record<string, string> = {};
	private typeMetadata?: DocumentTypeMetadata;
	private metadataGeneration = 0;
	private metadataDocument?: unknown;
	private metadataIdentity: string | undefined;
	private destroyed = false;
	customizing = false;
	showEmptyFields = false;
	editing = false;
	dirty = false;
	saving = false;
	private readonly saveErrorText = localizedText();
	get saveError(): string {
		return this.saveErrorText();
	}
	set saveError(value: string | MessageText) {
		this.saveErrorText.set(value);
	}
	private changes: Record<string, unknown> = {};

	ngOnInit(): void {
		void this.policy.load().finally(() => this.cdr.markForCheck());
		this.loadFieldMetadata();
		this.resolveDirectories();
	}
	ngOnChanges(changes: SimpleChanges): void {
		if (changes['document']) {
			this.changes = {};
			this.dirty = false;
			this.editing = false;
			this.loadFieldMetadata();
			this.resolveDirectories();
		}
	}
	ngOnDestroy(): void {
		this.destroyed = true;
		this.metadataGeneration++;
		this.requests.unsubscribe();
	}
	preferences(): UserMetadataPreferences {
		return this.policy.userPreferences(String(this.document?.type || ''));
	}
	get allowedFields(): MetadataField[] {
		const document = this.policy.visibleDocument(this.document) || this.document;
		const properties: Record<string, unknown> = { ...document?.properties };
		for (const field of this.supplementalFields())
			if (!Object.prototype.hasOwnProperty.call(properties, field.property))
				properties[field.property] = undefined;
		return Object.entries(properties)
			.map(([property, value]) => {
				const [schema = 'other', ...rest] = property.split(':');
				return {
					property,
					schema,
					name: rest.join(':') || property,
					value: Object.prototype.hasOwnProperty.call(this.changes, property)
						? this.changes[property]
						: value,
					type: this.fieldTypes[property] || fallbackType(property),
				};
			})
			.filter(
				(field) => this.policy.canRead(this.document, field.property) && this.presentable(field),
			)
			.sort((a, b) => {
				const order = this.preferences().fieldOrder.length
					? this.preferences().fieldOrder
					: ['dc:title', 'dc:description', 'dc:nature', 'dc:subjects', 'dc:coverage', 'dc:rights'];
				const rank = (property: string) =>
					order.includes(property) ? order.indexOf(property) : 9999;
				return rank(a.property) - rank(b.property) || a.property.localeCompare(b.property);
			});
	}
	/** Descriptive metadata first, then the type's own schemas in server order (stock Web UI shows the
	 *  type layout before shared facets), then anything else alphabetically. */
	get allowedSchemas(): string[] {
		const order = new Map<string, number>();
		(this.typeMetadata?.schemas || []).forEach((schema, index) =>
			order.set(String(schema.prefix || schema['@prefix'] || schema.name), index + 1),
		);
		const rank = (schema: string) => (schema === 'dc' ? 0 : (order.get(schema) ?? 9999));
		return [...new Set(this.allowedFields.map((field) => field.schema))].sort(
			(a, b) => rank(a) - rank(b) || a.localeCompare(b),
		);
	}
	get visibleSchemas(): { name: string; fields: MetadataField[] }[] {
		const prefs = this.preferences();
		const order = new Map(this.allowedFields.map((field, index) => [field.property, index]));
		const fields = this.allowedFields.filter(
			(field) =>
				!['picture', 'imd', 'iptc'].includes(field.schema) &&
				(this.editing ||
					(!prefs.hiddenFields.includes(field.property) &&
						!prefs.hiddenSchemas.includes(field.schema))) &&
				(this.editing || this.showEmptyFields || !this.isEmpty(field.value)),
		);
		fields.sort(
			(a, b) =>
				(order.get(a.property) ?? 9999) - (order.get(b.property) ?? 9999) ||
				a.property.localeCompare(b.property),
		);
		return this.allowedSchemas
			.map((name) => ({ name, fields: fields.filter((field) => field.schema === name) }))
			.filter((schema) => schema.fields.length);
	}
	canEdit(field: MetadataField): boolean {
		const resolved = this.resolvedField(field);
		return (
			!this.noEdit &&
			!this.layoutContext?.noEdit &&
			this.policy.canWrite(this.document, field.property) &&
			this.editableValue(field) &&
			!!resolved &&
			!resolved.readOnly
		);
	}
	get hasInvalidChanges(): boolean {
		return Object.entries(this.changes).some(([property, value]) => {
			const field = this.allowedFields.find((candidate) => candidate.property === property);
			const resolved = field && this.resolvedField(field);
			return !resolved || !!layoutFieldError(resolved, value);
		});
	}
	get hasEditableFields(): boolean {
		return this.allowedFields.some(
			(field) => !['picture', 'imd', 'iptc'].includes(field.schema) && this.canEdit(field),
		);
	}
	beginEdit(): void {
		this.editing = true;
		this.customizing = false;
		this.saveError = '';
		this.cdr.markForCheck();
	}
	cancelEdit(): void {
		if (this.saving) return;
		this.changes = {};
		this.dirty = false;
		this.editing = false;
		this.saveError = '';
		this.cdr.markForCheck();
	}
	toggleCustomize(): void {
		this.customizing = !this.customizing;
		this.cdr.markForCheck();
	}
	private isEmpty(value: unknown): boolean {
		return (
			value == null ||
			(typeof value === 'string' && !value.trim()) ||
			(Array.isArray(value) && (!value.length || value.every((item) => this.isEmpty(item))))
		);
	}
	customWidget(field: MetadataField): DocumentLayoutWidget | undefined {
		const resolved = this.resolvedField(field);
		return resolved?.widget
			? this.widgets.find((widget) => widget.id === resolved.widget)
			: undefined;
	}
	widgetProps(field: MetadataField): WidgetProps | null {
		const document = this.document;
		const generation = this.metadataGeneration;
		const resolved = this.resolvedField(field);
		if (!resolved) return null;
		return {
			field: resolved,
			value: cloneLayoutValue(field.value),
			disabled: this.saving || !this.canEdit(field),
			mode: 'edit',
			identity: `metadata-${this.document?.uid || 'document'}-${field.property}`,
			revision: generation,
			error: layoutFieldError(resolved, field.value, (key, values, fallback) =>
				this.messages.format(key, values, fallback),
			),
			search: (candidate, query) => this.gateway.searchReferences(candidate, query),
			commit: (value) => {
				if (!this.destroyed && generation === this.metadataGeneration && document === this.document)
					this.stageField(field.property, value);
			},
		};
	}
	private stageField(property: string, value: unknown): void {
		const field = this.allowedFields.find((candidate) => candidate.property === property);
		if (!field || !this.canEdit(field) || this.saving) return;
		if (JSON.stringify(this.document?.properties?.[property]) === JSON.stringify(value))
			delete this.changes[property];
		else this.changes[property] = cloneLayoutValue(value);
		this.dirty = Object.keys(this.changes).length > 0;
		this.cdr.markForCheck();
	}
	async save(): Promise<void> {
		if (!this.dirty || this.saving || this.hasInvalidChanges) return;
		this.saving = true;
		this.saveError = '';
		try {
			await this.policy.assertWritable(this.document, this.changes);
			const updated = await this.gateway.update(this.document, this.changes);
			this.changes = {};
			this.dirty = false;
			this.editing = false;
			this.documents.reloadDocument(updated.uid);
		} catch (error) {
			this.saveError =
				error instanceof Error
					? errorMessage(error)
					: messageText(
							'app.state.metadata-could-not-be-saved-refresh-the-docum-c4fa8b',
							'Metadata could not be saved. Refresh the document and try again.',
						);
		} finally {
			this.saving = false;
			this.cdr.markForCheck();
		}
	}
	setFieldHidden(property: string, checked: boolean): void {
		const prefs = this.preferences();
		this.policy.setUserPreferences(String(this.document?.type || ''), {
			hiddenFields: checked
				? prefs.hiddenFields.filter((item: string) => item !== property)
				: [...prefs.hiddenFields, property],
		});
	}
	setSchemaHidden(schema: string, checked: boolean): void {
		const prefs = this.preferences();
		this.policy.setUserPreferences(String(this.document?.type || ''), {
			hiddenSchemas: checked
				? prefs.hiddenSchemas.filter((item: string) => item !== schema)
				: [...prefs.hiddenSchemas, schema],
		});
	}
	moveField(property: string, direction: number): void {
		const order = [...this.allowedFields.map((field) => field.property)];
		const index = order.indexOf(property);
		const next = index + direction;
		if (index < 0 || next < 0 || next >= order.length) return;
		[order[index], order[next]] = [order[next], order[index]];
		this.policy.setUserPreferences(String(this.document?.type || ''), { fieldOrder: order });
	}
	resetCustomization(): void {
		this.policy.setUserPreferences(String(this.document?.type || ''), {
			hiddenFields: [],
			hiddenSchemas: [],
			metadataHidden: false,
			fieldOrder: [],
		});
	}
	fieldLabel(field: MetadataField): string {
		const supplemental = this.supplementalFields().find(
			(candidate) => candidate.property === field.property,
		);
		if (supplemental) return this.messages.text(supplemental.labelKey, supplemental.label);
		const labels: Readonly<Record<string, readonly [string, string]>> = {
			'dc:title': ['label.dublincore.title', 'Title'],
			'dc:description': ['label.dublincore.description', 'Description'],
			'dc:nature': ['label.dublincore.nature', 'Nature'],
			'dc:subjects': ['label.dublincore.subjects', 'Subjects'],
			'dc:coverage': ['label.dublincore.coverage', 'Coverage'],
			'dc:rights': ['app.viewer.metadataRights', 'Rights'],
			'dc:source': ['app.viewer.metadataSource', 'Source'],
			'dc:language': ['app.viewer.metadataLanguage', 'Language'],
			'dc:publisher': ['app.viewer.metadataPublisher', 'Publisher'],
			'dc:issued': ['app.viewer.metadataIssued', 'Issued'],
			'dc:valid': ['app.viewer.metadataValid', 'Valid'],
			'dc:expired': ['label.dublincore.expire', 'Expires'],
		};
		const label = labels[field.property];
		return label
			? this.messages.text(label[0], label[1])
			: field.name
					.replace(/([a-z])([A-Z])/g, '$1 $2')
					.replace(/[_-]/g, ' ')
					.replace(/^./, (x) => x.toUpperCase());
	}
	isMultiline(value: unknown): boolean {
		return typeof value === 'string' && value.length > 80;
	}
	display(value: any, directory?: string, type?: string): string {
		if (value == null) return '';
		if (Array.isArray(value))
			return value.map((item) => this.display(item, directory, type)).join(', ');
		if (typeof value === 'string') {
			if (type === 'date' && !Number.isNaN(Date.parse(value)))
				return formatDate(value, 'mediumDate', this.messages.locale(), 'UTC');
			return directory
				? nativeDirectoryLabel(
						this.labels.get(`${directory}:${value}`) || value,
						directory,
						this.messages,
					) || value
				: value;
		}
		if (typeof value === 'boolean')
			return this.messages.text(value ? 'sdk.dialog.yes' : 'sdk.dialog.no', value ? 'Yes' : 'No');
		if (typeof value === 'number')
			return new Intl.NumberFormat(this.messages.locale(), { maximumFractionDigits: 20 }).format(
				value,
			);
		const label =
			comparisonEntryLabel(value, this.messages.locale()) ||
			value.displayLabel ||
			value.id ||
			value.uid ||
			JSON.stringify(value);
		return nativeDirectoryLabel(label, directory, this.messages) || label;
	}
	close(): void {
		this.modal?.hide();
	}
	private editableValue(field: MetadataField): boolean {
		return field.type !== 'blob' && !isBlob(field.value);
	}
	private presentable(field: MetadataField): boolean {
		return (
			![
				'common',
				'uid',
				'nxtag',
				'relatedtext',
				'notification',
				'notif',
				// AI interaction store: embeddings and digests, never user-facing metadata.
				'interactionresults',
			].includes(field.schema) &&
			![
				'dc:created',
				'dc:modified',
				'dc:creator',
				'dc:lastContributor',
				'dc:contributors',
			].includes(field.property) &&
			field.property !== 'picture:views' &&
			field.type !== 'blob' &&
			!isBlob(field.value) &&
			!(Array.isArray(field.value) && field.value.some(isBlob))
		);
	}
	directoryFor(property: string): string | undefined {
		const supplemental = this.supplementalFields().find((field) => field.property === property);
		return (
			supplemental?.directoryName ??
			(
				{
					'dc:nature': 'nature',
					'dc:subjects': 'l10nsubjects',
					'dc:coverage': 'l10ncoverage',
				} as Record<string, string>
			)[property]
		);
	}
	private resolveDirectories(): void {
		this.requests.unsubscribe();
		this.requests = new Subscription();
		this.labels.clear();
		for (const field of this.allowedFields) {
			const directory = this.directoryFor(field.property);
			const values = Array.isArray(field.value) ? field.value : [field.value];
			if (!directory) continue;
			for (const value of values)
				if (typeof value === 'string' && value)
					this.requests.add(
						this.gateway
							.resolveReference$(
								{
									property: '',
									label: '',
									type: 'directory',
									multiple: false,
									directoryName: directory,
								},
								value,
							)
							.subscribe((resolved) => {
								if (resolved?.label) {
									this.labels.set(`${directory}:${value}`, resolved.label);
									this.cdr.markForCheck();
								}
							}),
					);
		}
	}
	/** Only schema-verified contributions may extend a native layout's field list. */
	protected supplementalFields(): readonly LayoutField[] {
		if (!this.typeMetadata) return [];
		const context = documentLayoutContext({
			documentType: this.document?.type,
			document: this.document,
			mode: 'metadata',
			noEdit: this.noEdit || this.layoutContext?.noEdit,
		});
		return this.fieldExtensions.fields(context).filter((field) => {
			try {
				resolveLayoutFields(
					{
						id: 'native-metadata-fields',
						documentType: this.typeMetadata!.name,
						preserveSchemaConstraints: true,
						fields: [field],
					},
					this.typeMetadata!,
				);
				return true;
			} catch {
				return false;
			}
		});
	}
	private loadFieldMetadata(): void {
		const document = this.document;
		// The type definition is read once per document shown, not per refreshed copy of it.
		const identity = document
			? JSON.stringify([document.repository ?? 'default', document.uid ?? null, document.type])
			: undefined;
		if (this.metadataIdentity === identity && this.metadataDocument) {
			this.metadataDocument = document;
			return;
		}
		this.metadataIdentity = identity;
		this.metadataDocument = document;
		const generation = ++this.metadataGeneration;
		this.typeMetadata = undefined;
		this.fieldTypes = {};
		const type = document?.type;
		if (!type) return;
		void this.gateway
			.readDocumentType(type, document, 'metadata')
			.then((metadata) => {
				if (
					this.destroyed ||
					generation !== this.metadataGeneration ||
					identity !== this.metadataIdentity
				)
					return;
				this.typeMetadata = metadata;
				const types: Record<string, string> = {};
				for (const schema of metadata.schemas || []) {
					const prefix = schema.prefix || schema['@prefix'] || schema.name;
					for (const [name, definition] of Object.entries(schema.fields || {}))
						types[`${prefix}:${name}`] =
							typeof definition === 'string'
								? definition.replace(/\[\]$/, '')
								: definition.type?.replace(/\[\]$/, '') || 'complex';
				}
				this.fieldTypes = types;
				this.resolveDirectories();
				this.cdr.markForCheck();
			})
			.catch(() => undefined);
	}
	protected resolvedField(field: MetadataField): ResolvedLayoutField | null {
		if (!this.typeMetadata) return null;
		const directoryName = this.directoryFor(field.property);
		const supplemental = this.supplementalFields().find(
			(candidate) => candidate.property === field.property,
		);
		try {
			return (
				resolveLayoutFields(
					{
						id: `metadata-${field.property}`,
						documentType: this.typeMetadata.name,
						preserveSchemaConstraints: true,
						fields: [
							{
								...supplemental,
								property: field.property,
								label: this.fieldLabel(field),
								widget: directoryName ? 'directory' : supplemental?.widget,
								directoryName,
							},
						],
					},
					this.typeMetadata,
				)[0] || null
			);
		} catch {
			return null;
		}
	}
}
function isBlob(value: unknown): boolean {
	return (
		!!value &&
		typeof value === 'object' &&
		('data' in value || 'upload-batch' in value || 'mime-type' in value || 'mimeType' in value)
	);
}
function fallbackType(property: string): string | undefined {
	if (['dc:title', 'dc:description', 'dc:nature', 'dc:coverage'].includes(property))
		return 'string';
	if (['dc:subjects'].includes(property)) return 'string';
	if (['dc:created', 'dc:modified', 'dc:expired', 'dc:issued', 'dc:valid'].includes(property))
		return 'date';
	return undefined;
}
