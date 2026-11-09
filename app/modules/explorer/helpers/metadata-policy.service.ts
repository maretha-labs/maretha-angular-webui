import { LocalizedUiError } from '@maretha/webui-sdk';
import { localizedText, messageText } from 'app/helpers/localized-message';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from 'app/helpers/auth.service';
import { hasPermission } from 'app/helpers/document-permissions';
import { environment } from 'environments/environment';

export interface MetadataRule {
	id: string;
	documentType: string;
	schema: string;
	subjects: { users: string[]; groups: string[]; match: 'any' | 'all' };
	access: 'hidden' | 'read' | 'write';
	fields?: string[];
}
export interface MetadataPolicy {
	version: 1;
	rules: MetadataRule[];
}
export interface UserMetadataPreferences {
	hiddenFields: string[];
	hiddenSchemas: string[];
	fieldOrder: string[];
	metadataHidden: boolean;
}
const emptyPolicy = (): MetadataPolicy => ({ version: 1, rules: [] });
const generatedFields = new Set([
	'dc:created',
	'dc:modified',
	'dc:creator',
	'dc:lastContributor',
	'dc:contributors',
]);
const schemaNames: Record<string, string> = {
	dc: 'dublincore',
	imd: 'image_metadata',
	iptc: 'iptc',
	picture: 'picture',
	file: 'file',
	files: 'files',
	uid: 'uid',
	common: 'common',
};

/** Presentation policy only. Nuxeo remains responsible for API access and document permissions. */
export function metadataAccess(
	policy: MetadataPolicy,
	document: any,
	property: string,
	user: any,
): 'hidden' | 'read' | 'write' {
	const prefix = property.split(':')[0];
	const schema =
		document?.schemas?.find((item: any) => (item.prefix || item['@prefix']) === prefix)?.name ||
		schemaNames[prefix] ||
		prefix;
	const groups = new Set(
		(user?.groups || []).map((group: any) =>
			typeof group === 'string' ? group : group.id || group.name,
		),
	);
	const matches = policy.rules.flatMap((rule) => {
		if (rule.documentType !== '*' && rule.documentType !== document?.type) return [];
		if (!['*', prefix, schema].includes(rule.schema)) return [];
		const userMatch = rule.subjects.users.includes(user?.id);
		const groupMatch = rule.subjects.groups.some((group) => groups.has(group));
		const hasUsers = rule.subjects.users.length > 0;
		const hasGroups = rule.subjects.groups.length > 0;
		const applies =
			rule.subjects.match === 'all'
				? (!hasUsers || userMatch) && (!hasGroups || groupMatch)
				: (!hasUsers && !hasGroups) || userMatch || groupMatch;
		if (!applies) return [];
		const score =
			(userMatch ? 100 : groupMatch ? 10 : 0) +
			(rule.documentType === '*' ? 0 : 2) +
			(rule.schema === '*' ? 0 : 1);
		const access = rule.fields && !rule.fields.includes(property) ? 'hidden' : rule.access;
		return [{ score, access }];
	});
	// No presentation rule: the server permission decides, so the field is writable.
	if (!matches.length) return 'write';
	const score = Math.max(...matches.map((match) => match.score));
	const access = matches.filter((match) => match.score === score).map((match) => match.access);
	return access.includes('hidden') ? 'hidden' : access.includes('read') ? 'read' : 'write';
}

@Injectable({ providedIn: 'root' })
export class MetadataPolicyService {
	private readonly http = inject(HttpClient);
	private readonly auth = inject(AuthService);
	private readonly api = `${environment.nuxeoUrl}/api/v1`;
	private readonly configPath = '/default-domain/.maretha-ui-metadata-pol';
	private configuration: any;
	private pending?: Promise<void>;
	/** The user whose policy is loaded or loading. */
	private loadedFor: string | null | undefined;
	private epoch = 0;
	private readonly ready = signal(false);
	readonly policy = signal<MetadataPolicy>(emptyPolicy());
	readonly loading = signal(false);
	readonly error = localizedText('');
	readonly revision = signal(0);
	readonly isAdministrator = computed(() => this.auth.userInfo()?.isAdministrator === true);
	constructor() {
		effect(() => {
			const id = this.auth.userInfo()?.id ?? null;
			// A view may ask for the policy before this effect first runs: that load stands.
			if (id === this.loadedFor) return;
			this.loadedFor = id;
			this.epoch++;
			this.configuration = undefined;
			this.pending = undefined;
			this.ready.set(false);
			this.policy.set(emptyPolicy());
			if (id) void this.load();
		});
	}
	load(): Promise<void> {
		if (this.pending) return this.pending;
		this.loadedFor = this.auth.userInfo()?.id ?? null;
		const epoch = this.epoch;
		this.loading.set(true);
		this.error.set('');
		this.pending = (async () => {
			try {
				// The policy document is absent on most servers: a query answers 200 with no entries
				// where a path GET would log a 404 in the console on every load.
				const result: any = await firstValueFrom(
					this.http.get(`${this.api}/search/lang/NXQL/execute`, {
						params: {
							query: `SELECT * FROM Document WHERE ecm:path = '${this.configPath}' AND ecm:isVersion = 0 AND ecm:isTrashed = 0`,
							pageSize: 1,
						},
						headers: { properties: '*' },
					}),
				);
				const document: any = result?.entries?.[0];
				if (!document) throw { status: 404 };
				const policy = this.validate(JSON.parse(this.policyContent(document)));
				if (epoch !== this.epoch) return;
				this.configuration = document;
				this.policy.set(policy);
				this.ready.set(true);
			} catch (error: any) {
				if (epoch !== this.epoch) return;
				if (error.status === 404) {
					this.policy.set(emptyPolicy());
					this.ready.set(true);
				} else {
					this.ready.set(false);
					this.error.set(
						messageText(
							'metadata.loadFailed',
							'Metadata settings could not be loaded. Retry to display metadata.',
						),
					);
				}
			} finally {
				if (epoch === this.epoch) {
					this.loading.set(false);
					this.pending = undefined;
					this.revision.update((value) => value + 1);
				}
			}
		})();
		return this.pending;
	}
	async save(value: MetadataPolicy): Promise<void> {
		if (!this.isAdministrator())
			throw new LocalizedUiError(
				'metadata.adminOnly',
				'Only administrators can change metadata settings.',
			);
		const policy = this.validate(value);
		this.loading.set(true);
		this.error.set('');
		try {
			if (!this.configuration) {
				const created: any = await firstValueFrom(
					this.http.post(
						`${this.api}/path/default-domain`,
						{
							'entity-type': 'document',
							type: 'Note',
							name: '.maretha-ui-metadata-pol',
							properties: {
								'dc:title': 'Maretha metadata layouts',
								'note:mime_type': 'application/json',
								'dc:description': JSON.stringify(emptyPolicy()),
								'note:note': 'Maretha shared metadata presentation settings.',
							},
						},
						{ headers: { properties: '*' } },
					),
				);
				this.configuration = created;
			}
			const uid = this.configuration.uid;
			// Secure the shared settings before publishing rules. Failure leaves the draft unpublished.
			await this.operation('Document.AddPermission', uid, {
				users: ['administrators'],
				permission: 'Everything',
				acl: 'local',
			});
			await this.operation('Document.AddPermission', uid, {
				users: ['members'],
				permission: 'Read',
				acl: 'local',
			});
			await this.operation('Document.BlockPermissionInheritance', uid, {});
			await this.operation('Document.AddFacet', uid, { facet: 'HiddenInNavigation', save: true });
			const current: any = await firstValueFrom(
				this.http.get(`${this.api}/id/${encodeURIComponent(uid)}`, {
					headers: { properties: '*' },
				}),
			);
			// Reject overwriting a policy another administrator saved while this page was open.
			const previous = this.policyContent(this.configuration);
			if (previous != null && this.policyContent(current) !== previous)
				throw new LocalizedUiError(
					'metadata.changedBeforeSave',
					'Another administrator changed these settings. Reload before saving.',
				);
			this.configuration = await firstValueFrom(
				this.http.put(
					`${this.api}/id/${encodeURIComponent(uid)}`,
					{
						'entity-type': 'document',
						uid,
						changeToken: current.changeToken,
						properties: { 'dc:description': JSON.stringify(policy) },
					},
					{ headers: { properties: '*' } },
				),
			);
			this.policy.set(policy);
			this.ready.set(true);
			this.revision.update((value) => value + 1);
		} catch (error: any) {
			const message =
				error.status === 409
					? new LocalizedUiError(
							'metadata.conflict',
							'Settings changed on the server. Reload before saving.',
						)
					: error instanceof LocalizedUiError
						? error
						: error.error?.message ||
							error.message ||
							new LocalizedUiError('metadata.saveFailed', 'Could not save metadata settings.');
			this.error.set(message);
			throw typeof message === 'string' ? new Error(message, { cause: error }) : message;
		} finally {
			this.loading.set(false);
		}
	}
	canRead(document: any, property: string): boolean {
		this.revision();
		return (
			this.ready() &&
			(this.isAdministrator() ||
				metadataAccess(this.policy(), document, property, this.auth.userInfo()) !== 'hidden')
		);
	}
	canWrite(document: any, property: string): boolean {
		if (!this.canRead(document, property) || generatedFields.has(property)) return false;
		if (['picture', 'imd', 'uid', 'common'].includes(property.split(':')[0])) return false;
		if (
			!['WriteProperties', 'Write', 'ReadWrite'].some((permission) =>
				hasPermission(document, permission),
			)
		)
			return false;
		return (
			this.isAdministrator() ||
			metadataAccess(this.policy(), document, property, this.auth.userInfo()) === 'write'
		);
	}
	async assertWritable(
		document: any,
		properties: Readonly<Record<string, unknown>>,
	): Promise<void> {
		if (!this.ready()) await this.load();
		for (const [property, value] of Object.entries(properties)) {
			if (JSON.stringify(document.properties?.[property]) === JSON.stringify(value)) continue;
			if (!this.canWrite(document, property))
				throw new LocalizedUiError(
					'metadata.cannotEdit',
					'You cannot edit {property} in this metadata layout.',
					{ property },
				);
		}
	}
	visibleDocument(document: any): any {
		if (!document) return document;
		return {
			...document,
			properties: Object.fromEntries(
				Object.entries(document.properties || {}).filter(([property]) =>
					this.canRead(document, property),
				),
			),
		};
	}
	userPreferences(documentType: string): UserMetadataPreferences {
		this.revision();
		const empty: UserMetadataPreferences = {
			hiddenFields: [],
			hiddenSchemas: [],
			fieldOrder: [],
			metadataHidden: false,
		};
		try {
			const saved = JSON.parse(localStorage.getItem(this.preferenceKey(documentType)) || '{}');
			const list = (value: unknown) =>
				Array.isArray(value)
					? value.filter((item): item is string => typeof item === 'string')
					: [];
			return {
				hiddenFields: list(saved.hiddenFields),
				hiddenSchemas: list(saved.hiddenSchemas),
				fieldOrder: list(saved.fieldOrder),
				metadataHidden: saved.metadataHidden === true,
			};
		} catch {
			return empty;
		}
	}
	setUserPreferences(documentType: string, update: Partial<UserMetadataPreferences>): void {
		try {
			localStorage.setItem(
				this.preferenceKey(documentType),
				JSON.stringify({ ...this.userPreferences(documentType), ...update }),
			);
		} catch {
			throw new LocalizedUiError(
				'metadata.preferencesFailed',
				'Your browser could not save these preferences.',
			);
		}
		this.revision.update((value) => value + 1);
	}
	private preferenceKey(type: string): string {
		return `maretha.metadata.${encodeURIComponent(environment.nuxeoUrl)}.${encodeURIComponent(this.auth.userInfo()?.id || 'anonymous')}.${encodeURIComponent(type)}`;
	}
	private operation(name: string, uid: string, params: Record<string, unknown>): Promise<unknown> {
		return firstValueFrom(
			this.http.post(`${this.api}/automation/${name}`, { input: uid, params, context: {} }),
		);
	}
	private policyContent(document: any): string {
		const properties = document?.properties || {};
		// Note content is HTML-escaped by Nuxeo; use a plain string schema field for JSON.
		if (properties['dc:description']) return properties['dc:description'];
		return (properties['note:note'] || '{}')
			.replace(/&#(\d+);/g, (_: string, code: string) => String.fromCharCode(Number(code)))
			.replace(/&quot;/g, '"')
			.replace(/&amp;/g, '&');
	}

	private validate(value: any): MetadataPolicy {
		if (value?.version !== 1 || !Array.isArray(value.rules))
			throw new LocalizedUiError('metadata.invalidPolicy', 'Unsupported metadata policy format.');
		const ids = new Set<string>();
		for (const rule of value.rules) {
			if (
				!rule?.id ||
				ids.has(rule.id) ||
				typeof rule.documentType !== 'string' ||
				!rule.documentType.trim() ||
				typeof rule.schema !== 'string' ||
				!rule.schema.trim() ||
				!['hidden', 'read', 'write'].includes(rule.access) ||
				!['any', 'all'].includes(rule.subjects?.match) ||
				!Array.isArray(rule.subjects?.users) ||
				!Array.isArray(rule.subjects?.groups) ||
				[...rule.subjects.users, ...rule.subjects.groups].some(
					(subject) => typeof subject !== 'string' || !subject.trim(),
				) ||
				(rule.fields !== undefined &&
					(!Array.isArray(rule.fields) ||
						rule.fields.some((field: any) => typeof field !== 'string' || !field.includes(':'))))
			)
				throw new LocalizedUiError(
					'metadata.invalidRule',
					'Each rule needs a document type, schema, valid access, and user/group IDs.',
				);
			ids.add(rule.id);
		}
		return JSON.parse(JSON.stringify(value));
	}
}
