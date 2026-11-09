import { NgTemplateOutlet } from '@angular/common';
import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ComponentRef,
	EnvironmentInjector,
	Input,
	OnChanges,
	OnDestroy,
	SimpleChanges,
	ViewChild,
	ViewContainerRef,
	inject,
	effect,
	PendingTasks,
} from '@angular/core';
import { finalize, Subscription } from 'rxjs';
import { RouterLink } from '@angular/router';
import {
	COMPARISON_LAYOUTS,
	WebUiMessages,
	ComparisonValueContext,
	resolveComparisonLayout,
} from '@maretha/webui-sdk';
import { ComparisonCell, ComparisonProperty } from '../../../helpers/document-comparison.service';
import {
	comparisonEntryLabel,
	DocumentComparisonResolverService,
} from '../../../helpers/document-comparison-resolver.service';
import { DocumentLinkPipe } from 'app/helpers/document-route';

@Component({
	selector: 'nx-comparison-value',
	templateUrl: './comparison-value.component.html',
	styleUrls: ['./comparison-value.component.scss'],
	imports: [RouterLink, DocumentLinkPipe, NgTemplateOutlet, UserTagComponent],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparisonValueComponent implements OnChanges, OnDestroy {
	@Input() mode: 'unified' | 'split-left' | 'split-right' = 'unified';
	@Input({ required: true }) property!: ComparisonProperty;
	@Input({ required: true }) cell!: ComparisonCell;
	@Input({ required: true }) document!: Record<string, unknown>;
	@ViewChild('outlet', { read: ViewContainerRef, static: true }) private outlet!: ViewContainerRef;
	private readonly layouts = inject(COMPARISON_LAYOUTS, { optional: true }) || [];
	private readonly environment = inject(EnvironmentInjector);
	private readonly resolver = inject(DocumentComparisonResolverService);
	readonly messages = inject(WebUiMessages);
	private readonly cdr = inject(ChangeDetectorRef);
	private readonly pendingTasks = inject(PendingTasks);
	mounted?: ComponentRef<unknown>;
	private mountedType?: unknown;
	private resolveEpoch = 0;
	private resolutionKey = '';
	private readonly resolved = new Map<string, string | Readonly<Record<string, unknown>>>();
	private requests = new Subscription();

	constructor() {
		effect(() => {
			this.messages.locale();
			if (this.mounted && this.property && this.cell && this.document)
				this.mounted.setInput('context', this.context);
		});
	}

	ngOnChanges(_changes: SimpleChanges): void {
		this.mount();
		const key = `${this.property?.name}|${this.property?.kind}|${this.property?.directoryName || ''}|${this.document?.['uid'] || ''}|${JSON.stringify(this.cell?.baseline)}|${JSON.stringify(this.cell?.value)}`;
		if (key !== this.resolutionKey) {
			this.resolutionKey = key;
			this.resolveReferences();
		}
	}
	ngOnDestroy(): void {
		this.resolveEpoch++;
		this.requests.unsubscribe();
	}

	get context(): ComparisonValueContext {
		return {
			property: this.property.name,
			label: this.messages.text(this.property.labelKey, this.property.label),
			kind: this.property.kind,
			value: freeze(clone(this.cell.value)),
			baseline: freeze(clone(this.cell.baseline)),
			changed: this.cell.changed,
			missing: this.cell.missing,
			document: freeze(structuredClone(this.document)),
		};
	}

	get lines(): readonly string[] {
		return this.linesFor(this.cell.value);
	}
	get baselineLines(): readonly string[] {
		return this.linesFor(this.cell.baseline);
	}
	private linesFor(value: unknown): readonly string[] {
		if (value === undefined)
			return [this.messages.format('app.viewer.comparisonMissing', {}, '— missing —')];
		if (value === null)
			return [this.messages.format('app.viewer.comparisonEmpty', {}, '— empty —')];
		if (this.property.kind === 'date') {
			const date = new Date(String(value));
			return [
				Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString(this.messages.locale()),
			];
		}
		if (this.property.kind === 'blob')
			return [blobLabel(value, this.messages.format('app.viewer.unnamedFile', {}, 'unnamed file'))];
		if (this.property.kind === 'directoryEntry' || this.property.kind === 'directoryEntry[]')
			return entries(value).map((entry) => this.resolvedLabel(entry));
		if (this.property.kind === 'user' || this.property.kind === 'user[]')
			return entries(value).map((entry) => this.resolvedLabel(entry));
		if (this.property.kind === 'document' || this.property.kind === 'document[]')
			return entries(value).map((entry) => this.resolvedLabel(entry));
		if (typeof value === 'object') {
			const lines = Object.keys(value).length ? structuralLines(value) : [];
			return lines.length
				? lines
				: [
						Array.isArray(value)
							? this.messages.format('app.viewer.comparisonEmptyList', {}, '— empty list —')
							: this.messages.format('app.viewer.comparisonEmptyObject', {}, '— empty object —'),
					];
		}
		if (typeof value === 'boolean')
			return [
				this.messages.format(value ? 'sdk.dialog.yes' : 'sdk.dialog.no', {}, value ? 'Yes' : 'No'),
			];
		if (typeof value === 'number' && Number.isFinite(value))
			return [
				new Intl.NumberFormat(this.messages.locale(), { maximumFractionDigits: 20 }).format(value),
			];
		return [String(value)];
	}
	get changeLabel(): string {
		const key = {
			addition: 'app.viewer.comparisonAddition',
			deletion: 'app.viewer.comparisonDeletion',
			modification: 'app.viewer.comparisonModification',
			unchanged: 'app.viewer.comparisonUnchanged',
		}[this.changeKind];
		return this.messages.text(key, this.changeKind);
	}
	get changeKind(): 'addition' | 'deletion' | 'modification' | 'unchanged' {
		if (!this.cell.changed) return 'unchanged';
		if (this.cell.baseline === undefined || this.cell.baseline === null) return 'addition';
		if (this.cell.value === undefined || this.cell.value === null) return 'deletion';
		return 'modification';
	}

	isComplex(value: unknown): boolean {
		return !!value && typeof value === 'object' && !this.isBlob(value) && !this.entity(value);
	}
	isBlob(value: any): boolean {
		return (
			!!value &&
			typeof value === 'object' &&
			('mime-type' in value ||
				'mimeType' in value ||
				'digest' in value ||
				('name' in value && 'data' in value))
		);
	}
	entity(value: any): string {
		return value?.['entity-type'] ?? '';
	}
	children(value: unknown): { key: string; value: unknown }[] {
		return Object.entries(value as object).map(([key, value]) => ({ key, value }));
	}
	blobName(value: any): string {
		return String(
			value?.name ||
				value?.['_name'] ||
				this.messages.text('app.viewer.unnamedFile', 'unnamed file'),
		);
	}
	blobHref(value: any): string | null {
		const url = value?.data ?? value?.url;
		return typeof url === 'string' && /^(https?:\/\/|\/)/.test(url) ? url : null;
	}
	leaf(value: unknown, key = ''): string {
		if (Array.isArray(value) && !value.length)
			return this.messages.text('app.viewer.comparisonEmptyList', '— empty list —');
		if (value && typeof value === 'object' && !Object.keys(value).length)
			return this.messages.text('app.viewer.comparisonEmptyObject', '— empty object —');
		if (typeof value === 'boolean')
			return this.messages.text(value ? 'sdk.dialog.yes' : 'sdk.dialog.no', value ? 'Yes' : 'No');
		if (typeof value === 'number')
			return new Intl.NumberFormat(this.messages.locale(), { maximumFractionDigits: 20 }).format(
				value,
			);
		if (
			/created|modified|expired|date$/i.test(key) &&
			typeof value === 'string' &&
			!Number.isNaN(Date.parse(value))
		)
			return new Date(value).toLocaleDateString(this.messages.locale());
		if (value && typeof value === 'object')
			return (
				comparisonEntryLabel(value as Record<string, unknown>, this.messages.locale()) ||
				String((value as any).title ?? (value as any).id ?? '')
			);
		return value == null
			? this.messages.text('app.viewer.comparisonEmpty', '— empty —')
			: String(value);
	}
	get documentIds(): readonly string[] {
		if (this.property.kind !== 'document' && this.property.kind !== 'document[]') return [];
		return entries(this.cell.value).map((entry) => String(entry['uid'] || entry['id'] || ''));
	}

	private mount(): void {
		if (!this.outlet || !this.property || !this.cell || !this.document) return;
		const layout = resolveComparisonLayout(this.layouts, this.property.name, this.property.kind);
		if (!layout) {
			this.outlet.clear();
			this.mounted = undefined;
			this.mountedType = undefined;
			return;
		}
		if (this.mountedType !== layout.component) {
			this.outlet.clear();
			this.mounted = this.outlet.createComponent(layout.component, {
				environmentInjector: this.environment,
			});
			this.mountedType = layout.component;
		}
		this.mounted?.setInput('context', this.context);
	}
	private resolvedLabel(entry: Record<string, unknown>): string {
		const id = String(entry['uid'] || entry['id'] || '');
		return (
			(typeof this.resolved.get(id) === 'string' ? (this.resolved.get(id) as string) : undefined) ||
			String(
				entry['title'] ||
					comparisonEntryLabel(
						(this.resolved.get(id) as Readonly<Record<string, unknown>>) || entry,
						this.messages.locale(),
					) ||
					entry['displayName'] ||
					entry['firstName'] ||
					id ||
					entry,
			)
		);
	}
	private resolveReferences(): void {
		const epoch = ++this.resolveEpoch;
		this.requests.unsubscribe();
		this.requests = new Subscription();
		this.resolved.clear();
		if (
			!this.property ||
			!['directoryEntry', 'directoryEntry[]', 'user', 'user[]', 'document', 'document[]'].includes(
				this.property.kind,
			)
		)
			return;
		const seen = new Set<string>();
		for (const entry of [...entries(this.cell.baseline), ...entries(this.cell.value)]) {
			const id = String(entry['uid'] || entry['id'] || '');
			if (
				!id ||
				seen.has(id) ||
				comparisonEntryLabel(entry, this.messages.locale()) ||
				entry['title']
			)
				continue;
			seen.add(id);
			const done = this.pendingTasks.add();
			this.requests.add(
				this.resolver
					.resolveEntry(this.property, id)
					.pipe(finalize(done))
					.subscribe((resolved) => {
						if (epoch !== this.resolveEpoch || !resolved) return;
						this.resolved.set(id, resolved);
						this.cdr.markForCheck();
					}),
			);
		}
	}
}

function entries(value: unknown): readonly Record<string, unknown>[] {
	return (Array.isArray(value) ? value : [value])
		.filter((item) => item !== null && item !== undefined)
		.map((item) => (typeof item === 'object' ? (item as Record<string, unknown>) : { id: item }));
}
function blobLabel(value: unknown, unnamed: string): string {
	const blob = value as Record<string, unknown>;
	const name = blob['name'] || blob['_name'] || unnamed;
	return String(name);
}
function structuralLines(value: unknown, path = ''): readonly string[] {
	if (value === null) return [`${path}: null`];
	if (typeof value !== 'object') return [`${path}: ${String(value)}`];
	if (Array.isArray(value) && !value.length) return [`${path}: []`];
	if (Array.isArray(value))
		return value.flatMap((item, index) => structuralLines(item, `${path}[${index}]`));
	if (!Object.keys(value as Record<string, unknown>).length) return [`${path}: {}`];
	return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
		structuralLines(item, path ? `${path}.${key}` : key),
	);
}
function clone(value: unknown): unknown {
	return value && typeof value === 'object' ? structuredClone(value) : value;
}
function freeze<T>(value: T): T {
	if (!value || typeof value !== 'object') return value;
	Object.freeze(value);
	for (const item of Object.values(value as Record<string, unknown>)) freeze(item);
	return value;
}
