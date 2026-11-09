import { NgComponentOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	Input,
	OnChanges,
	OnDestroy,
	PendingTasks,
	SimpleChanges,
	effect,
	inject,
	signal,
} from '@angular/core';
import { UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import {
	DOCUMENT_LAYOUT_WIDGETS,
	DocumentFieldExtensionRegistry,
	DocumentLayoutWidget,
	DocumentLayoutContext,
	ResolvedLayoutField,
	SchemaFieldComponent,
	WebUiMessagePipe,
	WebUiMessages,
	WidgetProps,
	cloneLayoutValue,
	layoutFieldError,
	resolveLayoutFields,
} from '@maretha/webui-sdk';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { MetadataPolicyService } from '../../helpers/metadata-policy.service';
import { canRunDocumentCommand } from '../viewers/document-actions-toolbar/document-command-policy';

/** Adds schema-verified fields to the native editor's single save and dirty guard. */
@Component({
	selector: 'nx-supplemental-document-fields',
	standalone: true,
	imports: [SchemaFieldComponent, WebUiMessagePipe, NgComponentOutlet],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		@if (loading()) {
			<p role="status">
				{{ 'editor.supplementalLoading' | webuiMessage: 'Loading additional fields…' }}
			</p>
		}
		@if (failed()) {
			<p role="alert">
				{{
					'editor.supplementalFailed'
						| webuiMessage: 'Additional fields could not be loaded. Retry before saving.'
				}}
			</p>
			<button type="button" class="btn btn-outline-secondary" (click)="load()">
				{{ 'command.retry' | webuiMessage: 'Retry' }}
			</button>
		}
		@for (field of visibleFields(); track field.property) {
			<div class="supplemental-field" [attr.data-property]="field.property">
				@if (customWidget(field); as widget) {
					<ng-container
						*ngComponentOutlet="widget.component; inputs: { props: widgetProps(field) }"
					/>
				} @else {
					<nx-schema-field [props]="widgetProps(field)" />
				}
			</div>
		}
	`,
	styles: ['.supplemental-field { margin-block: 1rem; }'],
})
export class SupplementalDocumentFieldsComponent implements OnChanges, OnDestroy {
	@Input({ required: true }) context!: DocumentLayoutContext;
	@Input({ required: true }) editorForm!: UntypedFormGroup;
	readonly fields = signal<readonly ResolvedLayoutField[]>([]);
	readonly loading = signal(false);
	readonly failed = signal(false);
	private readonly registry = inject(DocumentFieldExtensionRegistry);
	private readonly widgets = inject(DOCUMENT_LAYOUT_WIDGETS, { optional: true }) ?? [];
	private readonly gateway = inject(DocumentLayoutGatewayService);
	private readonly policy = inject(MetadataPolicyService);
	private readonly messages = inject(WebUiMessages);
	private readonly cdr = inject(ChangeDetectorRef);
	private readonly tasks = inject(PendingTasks);
	private finishTask?: () => void;
	private static nextId = 0;
	private readonly identity = `native-supplemental-${++SupplementalDocumentFieldsComponent.nextId}`;
	private readonly sentinelName = `${this.identity}-loading`;
	private boundForm?: UntypedFormGroup;
	private readonly ownedControls = new Map<string, UntypedFormControl>();
	private generation = 0;
	private destroyed = false;

	constructor() {
		effect(() => {
			this.policy.revision();
			for (const field of this.fields()) this.applyAccess(field);
		});
	}
	ngOnChanges(changes: SimpleChanges): void {
		if (changes['context'] || changes['editorForm']) void this.load();
	}
	ngOnDestroy(): void {
		this.destroyed = true;
		this.generation++;
		this.finishTask?.();
		this.clearControls();
	}
	async load(): Promise<void> {
		const generation = ++this.generation;
		this.finishTask?.();
		this.clearControls();
		this.fields.set([]);
		this.failed.set(false);
		this.loading.set(false);
		const context = this.context;
		const form = this.editorForm;
		if (!context || !form || !context.documentType) return;
		const candidates = this.registry.candidates(context);
		if (!candidates.length) return;
		const completeTask = this.tasks.add();
		let taskPending = true;
		const finish = () => {
			if (taskPending) {
				taskPending = false;
				completeTask();
			}
		};
		this.finishTask = finish;
		this.boundForm = form;
		// This pristine guard blocks the native Save while metadata/policy is unresolved.
		// It is removed on success and never marked dirty, so it cannot enter a write.
		form.addControl(
			this.sentinelName,
			new UntypedFormControl(null, () => ({ supplementalLoading: true })),
		);
		this.loading.set(true);
		try {
			const [metadata] = await Promise.all([
				this.gateway.readDocumentType(
					String(context.document?.['type'] || context.documentType),
					context.document,
					context.mode,
				),
				this.policy.load(),
			]);
			if (!this.current(generation, context, form)) return;
			const definitions = candidates.filter((candidate) =>
				metadata.schemas.some((schema) => schema.name === candidate.schema),
			);
			const configured = [
				...new Map(
					definitions
						.flatMap((definition) => definition.fields)
						.map((field) => [field.property, field]),
				).values(),
			];
			const fields = resolveLayoutFields(
				{
					id: this.identity,
					documentType: metadata.name,
					preserveSchemaConstraints: true,
					fields: configured,
				},
				metadata,
			);
			for (const field of fields) {
				if (form.contains(field.property) || form.controls[field.property]) continue;
				const properties = context.document?.['properties'] as
					| Readonly<Record<string, unknown>>
					| undefined;
				const value = cloneLayoutValue(
					properties?.[field.property] ?? (field.multiple ? [] : null),
				);
				const control = new UntypedFormControl(value, (candidate) => {
					const error = layoutFieldError(field, candidate.value, (key, values, fallback) =>
						this.messages.format(key, values, fallback),
					);
					return error ? { supplementalField: error } : null;
				});
				this.ownedControls.set(field.property, control);
				form.addControl(field.property, control);
			}
			this.fields.set(fields.filter((field) => this.ownedControls.has(field.property)));
			for (const field of this.fields()) this.applyAccess(field);
			form.removeControl(this.sentinelName);
		} catch {
			if (!this.current(generation, context, form)) return;
			this.failed.set(true);
		} finally {
			finish();
			if (this.finishTask === finish) this.finishTask = undefined;
			if (this.current(generation, context, form)) {
				this.loading.set(false);
				this.cdr.markForCheck();
			}
		}
	}
	visibleFields(): readonly ResolvedLayoutField[] {
		return this.fields().filter((field) =>
			this.policy.canRead(this.policyDocument(), field.property),
		);
	}
	customWidget(field: ResolvedLayoutField): DocumentLayoutWidget | undefined {
		return field.widget ? this.widgets.find((widget) => widget.id === field.widget) : undefined;
	}
	widgetProps(field: ResolvedLayoutField): WidgetProps {
		const generation = this.generation;
		const control = this.ownedControls.get(field.property)!;
		return {
			field,
			value: cloneLayoutValue(control.value),
			disabled: control.disabled || !this.writable(field),
			mode: this.context.mode,
			identity: `${this.identity}-${field.property}`,
			revision: generation,
			error: control.errors?.['supplementalField'] ?? null,
			search: (candidate, query) => this.gateway.searchReferences(candidate, query),
			commit: (value) => {
				if (
					generation !== this.generation ||
					this.destroyed ||
					this.ownedControls.get(field.property) !== control ||
					!this.writable(field) ||
					control.disabled
				)
					return;
				control.setValue(cloneLayoutValue(value));
				control.markAsDirty();
				this.cdr.markForCheck();
			},
		};
	}
	private policyDocument(): any {
		const document: any = this.context?.document;
		if (this.context?.mode !== 'create' && this.context?.mode !== 'import') return document;
		const permissions =
			(this.context.parentDocument?.['contextParameters'] as any)?.permissions ?? [];
		const mayCreate = permissions.some((permission: string) =>
			['AddChildren', 'Write', 'ReadWrite', 'Everything'].includes(permission),
		);
		return {
			...document,
			type: document?.type || this.context.documentType,
			contextParameters: {
				...document?.contextParameters,
				permissions: mayCreate ? ['WriteProperties'] : [],
			},
		};
	}
	private writable(field: ResolvedLayoutField): boolean {
		if (this.context.noEdit || field.readOnly) return false;
		if (
			this.context.mode !== 'create' &&
			this.context.mode !== 'import' &&
			!canRunDocumentCommand(
				{ document: this.context.document, noEdit: this.context.noEdit },
				'edit',
			)
		)
			return false;
		const document: any = this.context.document;
		if (document?.isUnderRetentionOrLegalHold || document?.facets?.includes('Immutable'))
			return false;
		return this.policy.canWrite(this.policyDocument(), field.property);
	}
	private applyAccess(field: ResolvedLayoutField): void {
		const control = this.ownedControls.get(field.property);
		if (!control) return;
		if (this.writable(field)) {
			if (control.disabled) control.enable({ emitEvent: false });
		} else {
			control.disable({ emitEvent: false });
			// A policy change must also remove an already edited value from the native dirty payload.
			control.markAsPristine();
		}
	}
	private clearControls(): void {
		if (this.boundForm) {
			this.boundForm.removeControl(this.sentinelName);
			for (const [property, control] of this.ownedControls)
				if (this.boundForm.controls[property] === control) this.boundForm.removeControl(property);
		}
		this.ownedControls.clear();
		this.boundForm = undefined;
	}
	private current(
		generation: number,
		context: DocumentLayoutContext,
		form: UntypedFormGroup,
	): boolean {
		return (
			!this.destroyed &&
			generation === this.generation &&
			context === this.context &&
			form === this.editorForm
		);
	}
}
