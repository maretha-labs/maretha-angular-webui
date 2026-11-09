import { Injectable } from '@angular/core';
import { ComparisonValueKind } from '@maretha/webui-sdk';

export interface ComparisonProperty {
	readonly name: string;
	readonly label: string;
	readonly labelKey?: string;
	readonly kind: ComparisonValueKind;
	readonly directoryName?: string;
}

export interface ComparisonCell {
	readonly value: unknown;
	readonly baseline: unknown;
	readonly changed: boolean;
	readonly missing: boolean;
}

@Injectable({ providedIn: 'root' })
export class DocumentComparisonService {
	properties(
		documents: readonly Record<string, any>[],
		metadata?: any,
	): readonly ComparisonProperty[] {
		const names = new Set<string>(['type', 'state', 'isCheckedOut']);
		for (const document of documents)
			for (const name of Object.keys(document['properties'] || {})) names.add(`properties.${name}`);
		return [...names]
			.sort((left, right) => left.localeCompare(right))
			.map((name) => ({
				...this.descriptor(name, metadata),
				name,
				label: this.label(name),
				labelKey: (
					{
						type: 'app.viewer.documentType',
						state: 'app.viewer.state',
						isCheckedOut: 'app.viewer.isModified',
					} as Record<string, string>
				)[name],
				kind: this.kind(name, documents, metadata),
			}));
	}

	cell(
		document: Record<string, any>,
		property: ComparisonProperty,
		baseline?: Record<string, any>,
	): ComparisonCell {
		const value = this.value(document, property.name);
		const pivot = baseline ? this.value(baseline, property.name) : undefined;
		return {
			value,
			baseline: pivot,
			changed: !!baseline && !same(value, pivot),
			missing: value === undefined,
		};
	}

	value(document: Record<string, any>, path: string): unknown {
		if (path.startsWith('properties.'))
			return document['properties']?.[path.slice('properties.'.length)];
		return path.split('.').reduce<unknown>((current, segment) => {
			if (!current || typeof current !== 'object') return undefined;
			return (current as Record<string, unknown>)[segment];
		}, document);
	}

	private label(name: string): string {
		if (name === 'type') return 'Document type';
		if (name === 'state') return 'State';
		if (name === 'isCheckedOut') return 'Is modified';
		return name.replace(/^properties\./, '');
	}

	private descriptor(name: string, metadata?: any): Pick<ComparisonProperty, 'directoryName'> {
		const field = this.field(name, metadata);
		if (field?.directoryName) return { directoryName: String(field.directoryName) };
		const standard = (
			{
				'properties.dc:nature': 'nature',
				'properties.dc:subjects': 'l10nsubjects',
				'properties.dc:coverage': 'l10ncoverage',
			} as Record<string, string>
		)[name];
		return standard ? { directoryName: standard } : {};
	}
	private kind(
		name: string,
		documents: readonly Record<string, any>[],
		metadata?: any,
	): ComparisonValueKind {
		const field = this.field(name, metadata);
		const raw = typeof field === 'string' ? field : field?.type || field?.widget;
		if (typeof raw === 'string') {
			const normalized = raw.toLowerCase();
			const multiple = normalized.endsWith('[]');
			const base = multiple ? normalized.slice(0, -2) : normalized;
			if (multiple && (base === 'date' || base === 'blob')) return 'default';
			if (['date', 'blob', 'directoryentry', 'document', 'user'].includes(base))
				return `${base === 'directoryentry' ? 'directoryEntry' : base}${multiple ? '[]' : ''}` as ComparisonValueKind;
			if (field?.directoryName) return multiple ? 'directoryEntry[]' : 'directoryEntry';
		}
		const values = documents
			.map((document) => this.value(document, name))
			.filter((value) => value != null);
		const value = values[0];
		if (/(:|\.)(created|modified|issued|expired|dueDate)$/i.test(name)) return 'date';
		if (isBlob(value)) return 'blob';
		const entity = entityType(value);
		if (entity === 'directoryEntry')
			return Array.isArray(value) ? 'directoryEntry[]' : 'directoryEntry';
		if (entity === 'document') return Array.isArray(value) ? 'document[]' : 'document';
		if (entity === 'user') return Array.isArray(value) ? 'user[]' : 'user';
		if (/(:creator|:contributors|:lastContributor)$/i.test(name))
			return Array.isArray(value) ? 'user[]' : 'user';
		if (/dc:(nature|subjects|coverage)$/i.test(name))
			return Array.isArray(value) ? 'directoryEntry[]' : 'directoryEntry';
		if (/(?:^|:)(references|related|target|document)$/i.test(name))
			return Array.isArray(value) ? 'document[]' : 'document';
		return 'default';
	}
	private field(name: string, metadata?: any): any {
		if (!metadata || !name.startsWith('properties.')) return undefined;
		const property = name.slice('properties.'.length);
		const split = property.indexOf(':');
		if (split < 1) return undefined;
		const prefix = property.slice(0, split);
		const field = property.slice(split + 1);
		const schema = metadata.schemas?.find(
			(candidate: any) => (candidate['@prefix'] || candidate.prefix || candidate.name) === prefix,
		);
		return schema?.fields?.[field];
	}
}

function entityType(value: unknown): string | undefined {
	const item = Array.isArray(value) ? value[0] : value;
	return item && typeof item === 'object'
		? ((item as Record<string, unknown>)['entity-type'] as string | undefined)
		: undefined;
}

function isBlob(value: unknown): boolean {
	return (
		!!value &&
		typeof value === 'object' &&
		('name' in value || '_name' in value) &&
		('mimeType' in value || 'digest' in value || 'contentDigest' in value)
	);
}

function same(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
	if (Array.isArray(left) !== Array.isArray(right)) return false;
	if (Array.isArray(left) && Array.isArray(right))
		return left.length === right.length && left.every((item, index) => same(item, right[index]));
	const leftRecord = left as Record<string, unknown>;
	const rightRecord = right as Record<string, unknown>;
	const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
	return [...keys].every((key) => same(leftRecord[key], rightRecord[key]));
}
