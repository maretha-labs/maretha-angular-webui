import { LocalizedUiError } from './i18n/localized-state';
import { InjectionToken, Provider, Type } from '@angular/core';

export type LayoutMode = 'create' | 'edit' | 'view' | 'metadata' | 'import';
export type SchemaFieldType =
	| 'string'
	| 'boolean'
	| 'long'
	| 'integer'
	| 'double'
	| 'date'
	| 'blob'
	| 'complex'
	| 'reference'
	| 'directory';

export interface LayoutField {
	readonly property: string;
	readonly label: string;
	/** Translate only an explicit key; literal customer labels remain unchanged. */
	readonly labelKey?: string;
	readonly required?: boolean;
	readonly readOnly?: boolean;
	readonly min?: number;
	readonly max?: number;
	readonly maxLength?: number;
	readonly widget?: string;
	readonly directoryName?: string;
}
export interface DocumentLayout {
	readonly id: string;
	readonly documentType: string;
	/** When set, layout fields cannot weaken native mandatory or read-only schema constraints. */
	readonly preserveSchemaConstraints?: boolean;
	readonly fields: readonly LayoutField[];
	/** Optional presentation groups; schema validation and save ownership remain one form. */
	readonly sections?: readonly {
		readonly id: string;
		readonly label: string;
		readonly labelKey?: string;
		readonly properties: readonly string[];
		readonly columns?: 1 | 2 | 3;
	}[];
}
export interface SchemaFieldMetadata {
	readonly type?: string;
	readonly fields?: Readonly<Record<string, string | SchemaFieldMetadata>>;
	readonly constraints?: readonly unknown[];
	/** Constraints on each item of a list field, such as a directory resolver on string[]. */
	readonly itemConstraints?: readonly unknown[];
	readonly required?: boolean;
	readonly readOnly?: boolean;
	readonly min?: number;
	readonly max?: number;
	readonly maxLength?: number;
	readonly directoryName?: string;
}
export interface SchemaMetadata {
	readonly name: string;
	readonly prefix?: string;
	readonly '@prefix'?: string;
	readonly fields: Readonly<Record<string, string | SchemaFieldMetadata>>;
}
export interface DocumentTypeMetadata {
	readonly name: string;
	readonly schemas: readonly SchemaMetadata[];
}
export interface LayoutDocument {
	readonly uid: string;
	readonly type: string;
	readonly changeToken?: string;
	readonly properties: Readonly<Record<string, unknown>>;
	readonly contextParameters?: { readonly permissions?: readonly string[] };
}
export interface BlobValue {
	readonly 'upload-batch'?: string;
	readonly 'upload-fileId'?: string;
	readonly name?: string;
	readonly _name?: string;
	readonly mimeType?: string;
	readonly length?: number;
	readonly data?: string;
	readonly downloadUrl?: string;
}
export interface ReferenceValue {
	readonly id: string;
	readonly label?: string;
}
export interface DocumentLayoutGateway {
	readType(type: string): Promise<DocumentTypeMetadata>;
	read(uid: string): Promise<LayoutDocument>;
	update(
		document: LayoutDocument,
		properties: Readonly<Record<string, unknown>>,
	): Promise<LayoutDocument>;
	create(
		parentId: string,
		type: string,
		name: string,
		properties: Readonly<Record<string, unknown>>,
	): Promise<LayoutDocument>;
	uploadBlob?(file: File): Promise<BlobValue>;
	releaseBlob?(blob: BlobValue): Promise<void>;
	resolveReference?(field: ResolvedLayoutField, value: string): Promise<ReferenceValue | null>;
	searchReferences?(field: ResolvedLayoutField, query: string): Promise<readonly ReferenceValue[]>;
}
export const DOCUMENT_LAYOUT_GATEWAY = new InjectionToken<DocumentLayoutGateway>(
	'Document layout gateway',
);

export interface ResolvedLayoutField extends LayoutField {
	readonly type: SchemaFieldType;
	readonly multiple: boolean;
	readonly itemType?: SchemaFieldType;
	readonly fields?: Readonly<Record<string, string | SchemaFieldMetadata>>;
}
export interface WidgetProps {
	readonly field: ResolvedLayoutField;
	readonly value: unknown;
	readonly disabled: boolean;
	readonly mode: LayoutMode;
	readonly identity: string;
	readonly revision?: number;
	readonly error: string | null;
	/** Presentation labels for persisted vocabulary IDs; values and commits retain their IDs. */
	readonly labels?: Readonly<Record<string, string>>;
	readonly commit: (value: unknown) => void;
	readonly upload?: (file: File) => Promise<BlobValue>;
	readonly search?: (
		field: ResolvedLayoutField,
		query: string,
	) => Promise<readonly ReferenceValue[]>;
}
export interface DocumentLayoutWidget {
	readonly id: string;
	readonly component: Type<unknown>;
}
export const DOCUMENT_LAYOUT_WIDGETS = new InjectionToken<readonly DocumentLayoutWidget[]>(
	'Document layout widgets',
);
export function provideDocumentLayoutWidget(widget: DocumentLayoutWidget): Provider {
	return { provide: DOCUMENT_LAYOUT_WIDGETS, multi: true, useValue: widget };
}

const scalarTypes = new Set<SchemaFieldType>([
	'string',
	'boolean',
	'long',
	'integer',
	'double',
	'date',
	'blob',
	'complex',
	'reference',
	'directory',
]);
function schemaField(
	raw: string | SchemaFieldMetadata | undefined,
): SchemaFieldMetadata | undefined {
	return typeof raw === 'string' ? { type: raw } : raw;
}
function resolveType(raw: string | undefined): {
	type: SchemaFieldType;
	multiple: boolean;
	itemType?: SchemaFieldType;
} {
	const multiple = !!raw?.endsWith('[]');
	const base = (multiple ? raw!.slice(0, -2) : raw || 'complex').toLowerCase();
	if (!scalarTypes.has(base as SchemaFieldType))
		throw new LocalizedUiError(
			'sdk.layout.unsupportedType',
			'Unsupported server schema type: {type}',
			{ type: base },
		);
	const type = base as SchemaFieldType;
	return { type, multiple, itemType: multiple ? type : undefined };
}
export function resolveLayoutFields(
	layout: DocumentLayout,
	metadata: DocumentTypeMetadata,
): readonly ResolvedLayoutField[] {
	if (layout.documentType !== metadata.name)
		throw new LocalizedUiError(
			'sdk.layout.metadataMismatch',
			'The layout does not match the document type.',
			{},
		);
	const seen = new Set<string>();
	return layout.fields.map((field) => {
		if (seen.has(field.property))
			throw new LocalizedUiError(
				'sdk.layout.duplicateProperty',
				'Duplicate layout property: {property}',
				{ property: field.property },
			);
		seen.add(field.property);
		const [prefix, name, ...nested] = field.property.split(':');
		const schema = metadata.schemas.find(
			(candidate) => (candidate.prefix || candidate['@prefix'] || candidate.name) === prefix,
		);
		const definition = schemaField(schema?.fields[name]);
		if (nested.length || !definition)
			throw new LocalizedUiError(
				'sdk.layout.missingProperty',
				'Property is missing from the server schema: {property}',
				{ property: field.property },
			);
		let kind: ReturnType<typeof resolveType>;
		try {
			kind = resolveType(definition.type);
		} catch (error) {
			if (!field.widget) throw error;
			kind = { type: 'string', multiple: false };
		}
		if (field.widget === 'reference') {
			if (!layout.preserveSchemaConstraints) return { ...field, ...kind, type: 'reference' };
			kind = { ...kind, type: 'reference' };
		}
		if (field.widget === 'directory') {
			if (!layout.preserveSchemaConstraints) return { ...field, ...kind, type: 'directory' };
			kind = { ...kind, type: 'directory' };
		}
		return {
			...definition,
			...field,
			...kind,
			...(layout.preserveSchemaConstraints
				? {
						required: definition.required === true || field.required === true,
						readOnly: definition.readOnly === true || field.readOnly === true,
					}
				: {}),
			fields: definition.fields,
		};
	});
}
function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function cloneLayoutValue<T>(value: T): T {
	if (value === undefined || value === null || typeof value !== 'object') return value;
	return JSON.parse(JSON.stringify(value)) as T;
}
export function layoutFieldError(
	field: ResolvedLayoutField,
	value: unknown,
	format: (
		key: string,
		values: Readonly<Record<string, string | number>>,
		fallback: string,
	) => string = (_key, _values, fallback) => fallback,
): string | null {
	if (
		value === null ||
		value === undefined ||
		value === '' ||
		(field.required && Array.isArray(value) && !value.length)
	)
		return field.required ? format('validation.required', {}, 'This field is required.') : null;
	if (field.multiple) {
		if (!Array.isArray(value)) return format('validation.list', {}, 'Use a list value.');
		for (const item of value) {
			const error = layoutFieldError(
				{ ...field, multiple: false, type: field.itemType || field.type },
				item,
				format,
			);
			if (error) return error;
		}
		return null;
	}
	if (field.type === 'boolean')
		return typeof value === 'boolean'
			? null
			: format('validation.boolean', {}, 'Use a boolean value.');
	if (['long', 'integer', 'double'].includes(field.type)) {
		const number = Number(value);
		if (!Number.isFinite(number) || (field.type !== 'double' && !Number.isSafeInteger(number)))
			return format('validation.number', {}, 'Enter a valid number.');
		if (field.min !== undefined && number < field.min)
			return format('validation.minimum', { value: field.min }, `The minimum is ${field.min}.`);
		if (field.max !== undefined && number > field.max)
			return format('validation.maximum', { value: field.max }, `The maximum is ${field.max}.`);
	}
	if (field.type === 'date' && !Number.isFinite(Date.parse(String(value))))
		return format('validation.date', {}, 'Enter a valid date.');
	if (field.type === 'complex') {
		if (!isPlainObject(value)) return format('validation.object', {}, 'Use an object value.');
		for (const [name, raw] of Object.entries(field.fields || {})) {
			const nested = schemaField(raw);
			if (!nested) continue;
			try {
				const kind = resolveType(nested.type);
				const error = layoutFieldError(
					{ property: name, label: name, ...kind, fields: nested.fields },
					value[name],
					format,
				);
				if (error) return format('validation.nested', { field: name, error }, `${name}: ${error}`);
			} catch {
				return format(
					'validation.unsupportedType',
					{ field: name },
					`${name}: unsupported schema type.`,
				);
			}
		}
	}
	if (field.type === 'blob' && !isPlainObject(value))
		return format('validation.file', {}, 'Choose a file.');
	if (field.maxLength !== undefined && String(value).length > field.maxLength)
		return format(
			'validation.maxLength',
			{ count: field.maxLength },
			`Use at most ${field.maxLength} characters.`,
		);
	return null;
}
export function layoutPropertyValue(field: ResolvedLayoutField, value: unknown): unknown {
	if (value === '' || value === undefined) return null;
	if (field.multiple)
		return Array.isArray(value)
			? value.map((item) =>
					layoutPropertyValue(
						{ ...field, multiple: false, type: field.itemType || field.type },
						item,
					),
				)
			: value;
	if (['long', 'integer', 'double'].includes(field.type) && value !== null) return Number(value);
	if (field.type === 'date' && value) {
		const date = new Date(String(value));
		return Number.isFinite(date.getTime()) ? date.toISOString() : value;
	}
	if (field.type === 'complex' && isPlainObject(value)) {
		const normalized: Record<string, unknown> = { ...value };
		for (const [name, raw] of Object.entries(field.fields || {})) {
			const nested = schemaField(raw);
			if (!nested || !(name in value)) continue;
			try {
				const kind = resolveType(nested.type);
				normalized[name] = layoutPropertyValue(
					{ property: name, label: name, ...kind, fields: nested.fields },
					value[name],
				);
			} catch {
				normalized[name] = cloneLayoutValue(value[name]);
			}
		}
		return normalized;
	}
	return cloneLayoutValue(value);
}
