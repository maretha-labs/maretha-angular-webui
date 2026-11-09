import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { errorMessage, localizedText, messageText } from 'app/helpers/localized-message';
import { LocalizedUiError } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	computed,
	effect,
	inject,
	input,
	signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { HttpClient } from '@angular/common/http';
import { AdministrationContext } from '@maretha/webui-sdk';
import { firstValueFrom } from 'rxjs';
import { environment } from 'environments/environment';
import { UsersAndGroupsFinderService } from 'app/helpers/users-and-groups-finder.service';
import {
	MetadataPolicy,
	MetadataPolicyService,
	MetadataRule,
} from '../../../explorer/helpers/metadata-policy.service';

/** Administrator-facing editor for the shared metadata presentation policy. */
@Component({
	selector: 'nx-metadata-policy',
	standalone: true,
	imports: [WebUiNumberPipe, FormsModule, NgSelectModule, WebUiMessagePipe],
	templateUrl: './metadata-policy.component.html',
	styleUrls: ['./metadata-policy.component.scss', './metadata-policy-rule-editor.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetadataPolicyComponent implements OnInit {
	readonly kind = input<string>('metadata-policy');
	readonly context = input<AdministrationContext>();
	private readonly service = inject(MetadataPolicyService);
	private readonly http = inject(HttpClient);
	private readonly people = inject(UsersAndGroupsFinderService);
	readonly rules = signal<MetadataRule[]>([]);
	private readonly editingRules = signal(false);
	readonly documentTypes = signal<string[]>([]);
	readonly users = signal<string[]>([]);
	readonly groups = signal<string[]>([]);
	readonly fieldsByType = signal<Record<string, string[]>>({});
	readonly saving = signal(false);
	readonly saveError = localizedText('');
	readonly saved = signal(false);
	readonly expandedRule = signal<string | null>(null);
	readonly createChoice = (value: string) => value.trim();
	readonly loading = this.service.loading;
	readonly error = this.service.error;
	readonly administrator = computed(() => this.service.isAdministrator());
	readonly dirty = computed(
		() => JSON.stringify(this.rules()) !== JSON.stringify(this.service.policy().rules),
	);

	constructor() {
		effect(() => {
			const policy = this.service.policy();
			if (!this.editingRules() && !this.loading()) this.rules.set(policy.rules.map(copyRule));
		});
	}
	async ngOnInit(): Promise<void> {
		await this.reload();
		await this.loadChoices();
	}
	async reload(): Promise<void> {
		this.saveError.set('');
		this.editingRules.set(false);
		await this.service.load();
		this.revert();
	}
	revert(): void {
		this.editingRules.set(false);
		this.saved.set(false);
		this.saveError.set('');
		this.rules.set(this.service.policy().rules.map(copyRule));
	}
	add(): void {
		const id = crypto.randomUUID?.() || `rule-${Date.now()}`;
		this.expandedRule.set(id);
		this.editingRules.set(true);
		this.saved.set(false);
		this.rules.update((rules) => [
			...rules,
			{
				id,
				documentType: '*',
				schema: '*',
				subjects: { users: [], groups: [], match: 'any' },
				access: 'read',
			},
		]);
	}
	remove(index: number): void {
		this.editingRules.set(true);
		this.saved.set(false);
		this.rules.update((rules) => rules.filter((_, position) => position !== index));
	}
	update(index: number, patch: Partial<MetadataRule>): void {
		this.editingRules.set(true);
		this.saved.set(false);
		this.rules.update((rules) =>
			rules.map((rule, position) => (position === index ? { ...rule, ...patch } : rule)),
		);
	}
	setSubjects(index: number, kind: 'users' | 'groups', raw: string[]): void {
		this.editingRules.set(true);
		this.saved.set(false);
		this.rules.update((rules) =>
			rules.map((rule, position) =>
				position === index ? { ...rule, subjects: { ...rule.subjects, [kind]: raw || [] } } : rule,
			),
		);
	}
	setFields(index: number, raw: string[]): void {
		this.editingRules.set(true);
		this.saved.set(false);
		this.rules.update((rules) =>
			rules.map((rule, position) =>
				position === index ? { ...rule, fields: raw?.length ? raw : undefined } : rule,
			),
		);
	}
	setDocumentType(index: number, type: string): void {
		this.update(index, { documentType: type || '*' });
		if (type && type !== '*') void this.loadFields(type);
	}
	schemaChoices(type: string): string[] {
		return [
			...new Set(['*', ...(this.fieldsByType()[type] || []).map((field) => field.split(':')[0])]),
		];
	}
	fieldChoices(type: string): string[] {
		return this.fieldsByType()[type] || [];
	}
	async save(): Promise<void> {
		if (!this.dirty() || this.saving()) return;
		this.saving.set(true);
		this.saveError.set('');
		try {
			await this.service.save({
				version: 1,
				rules: this.rules().map(copyRule),
			} satisfies MetadataPolicy);
			this.editingRules.set(false);
			this.saved.set(true);
		} catch (error) {
			this.saveError.set(
				error instanceof LocalizedUiError
					? errorMessage(error)
					: messageText(
							'app.state.metadata-layout-policy-could-not-be-saved-17476f',
							'Metadata layout policy could not be saved.',
						),
			);
		} finally {
			this.saving.set(false);
		}
	}
	private async loadChoices(): Promise<void> {
		try {
			const result: any = await firstValueFrom(
				this.http.get(`${environment.nuxeoUrl}/api/v1/config/types`),
			);
			const types = Array.isArray(result) ? result : result?.entries || result?.types || [];
			this.documentTypes.set(
				types
					.map((item: any) => (typeof item === 'string' ? item : item.id || item.name))
					.filter((item: unknown): item is string => typeof item === 'string')
					.sort(),
			);
			await Promise.all(
				this.rules().map((rule) =>
					rule.documentType !== '*' ? this.loadFields(rule.documentType) : Promise.resolve(),
				),
			);
		} catch {
			/* Type names remain freely enterable when the server does not expose them. */
		}
		try {
			const result: any = await firstValueFrom(this.people.getUsersAndGroups());
			this.users.set(Object.keys(result.users || {}));
			this.groups.set(Object.keys(result.groups || {}));
		} catch {
			/* Suggestions are optional. */
		}
	}
	private async loadFields(type: string): Promise<void> {
		if (this.fieldsByType()[type]) return;
		try {
			const metadata: any = await firstValueFrom(
				this.http.get(`${environment.nuxeoUrl}/api/v1/config/types/${encodeURIComponent(type)}`),
			);
			const fields = (metadata.schemas || []).flatMap((schema: any) =>
				Object.keys(schema.fields || {}).map(
					(name) => `${schema.prefix || schema['@prefix'] || schema.name}:${name}`,
				),
			);
			this.fieldsByType.update((all) => ({ ...all, [type]: fields.sort() }));
		} catch {
			this.fieldsByType.update((all) => ({ ...all, [type]: [] }));
		}
	}
}
function copyRule(rule: MetadataRule): MetadataRule {
	return {
		...rule,
		subjects: {
			...rule.subjects,
			users: [...rule.subjects.users],
			groups: [...rule.subjects.groups],
		},
		fields: rule.fields ? [...rule.fields] : undefined,
	};
}
