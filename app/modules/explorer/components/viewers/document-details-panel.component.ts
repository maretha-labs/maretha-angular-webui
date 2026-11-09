import { NgComponentOutlet } from '@angular/common';
import {
	isFallbackLayout,
	reportFallbackMetadataLayout,
} from '../../helpers/fallback-document-layouts';
import { Injector } from '@angular/core';
import { DocumentVersionsComponent } from '../document-snapshots/document-snapshots.component';
import {
	UserTagComponent,
	principalId,
} from 'app/modules/shared/components/user-tag/user-tag.component';
import { WebUiMessages, WebUiLocale } from '@maretha/webui-sdk';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ComponentRef,
	Input,
	OnChanges,
	Type,
	ViewChild,
	ViewContainerRef,
	effect,
	reflectComponentType,
	inject,
} from '@angular/core';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { DocumentLayoutRegistry, documentLayoutContext, SuggestionScope } from '@maretha/webui-sdk';
import { CommentsComponent } from '../comments/comments.component';
import { DocumentActivityComponent } from '../document-activity/document-activity.component';
import { DocumentTagsPanelComponent } from './document-tags-panel.component';
import { DocumentCollectionsPanelComponent } from './document-collections-panel.component';
import { MetadataPolicyService } from 'app/modules/explorer/helpers/metadata-policy.service';

/** The responsive companion to Nuxeo's document-page side scroller. */
@Component({
	selector: 'nx-document-details-panel',
	standalone: true,
	imports: [
		WebUiDatePipe,
		NgComponentOutlet,
		UserTagComponent,
		FontAwesomeModule,
		CommentsComponent,
		DocumentActivityComponent,
		DocumentTagsPanelComponent,
		DocumentCollectionsPanelComponent,
		WebUiMessagePipe,
	],
	template: `
		@if (document) {
			<section
				class="details-panel"
				[attr.aria-label]="
					'app.modules.document-details-panel.document-details-1fbb8e'
						| webuiMessage: 'Document details'
				"
			>
				<section
					class="document-status"
					[attr.aria-label]="
						'app.modules.document-details-panel.document-information-2fb193'
							| webuiMessage: 'Document information'
					"
				>
					<dl>
						@if (document.contextParameters?.runningWorkflows?.length) {
							<dt>{{ 'documentInfo.process' | webuiMessage: 'Process' }}</dt>
							<dd>
								<span class="state-pill">{{
									'documentInfo.process.running' | webuiMessage: 'Running'
								}}</span>
							</dd>
						}
						<dt>{{ 'app.modules.document-details-panel.state-60222a' | webuiMessage: 'State' }}</dt>
						<dd>
							<span class="state-pill">{{ messagesForState(document.state) }}</span>
						</dd>
						@if (document.facets?.includes('Versionable')) {
							<dt>
								{{ 'app.modules.document-details-panel.version-48d6d4' | webuiMessage: 'Version' }}
							</dt>
							<dd>
								@if (!document.isProxy && !hasVersions) {
									<ng-container
										*ngComponentOutlet="
											versionsComponent;
											injector: versionsInjector;
											inputs: { noEdit: noEdit, compact: true }
										"
									/>
								} @else if (!document.isProxy) {
									<details class="version-selector">
										<summary>{{ version }} <span aria-hidden="true">▾</span></summary>
										<ng-container
											*ngComponentOutlet="
												versionsComponent;
												injector: versionsInjector;
												inputs: { noEdit: noEdit, compact: true }
											"
										/>
									</details>
								} @else {
									<span>{{ version }}</span>
								}
							</dd>
						}
						@if (canShow('dc:modified') && document.properties?.['dc:modified']) {
							<dt>
								{{
									'app.modules.document-details-panel.last-modified-c6e13b'
										| webuiMessage: 'Last modified'
								}}
							</dt>
							<dd>{{ document.properties['dc:modified'] | webuiDate: 'longDate' }}</dd>
						}
						@if (canShow('dc:created') && document.properties?.['dc:created']) {
							<dt>
								{{ 'app.modules.document-details-panel.created-1a5f57' | webuiMessage: 'Created' }}
							</dt>
							<dd>{{ document.properties['dc:created'] | webuiDate: 'longDate' }}</dd>
						}
						@if (canShow('dc:creator') && document.ng?.createdBy) {
							<dt>{{ 'documentInfo.by' | webuiMessage: 'By' }}</dt>
							<dd>
								<nx-user-tag
									[lookup]="false"
									[user]="document.properties?.['dc:creator'] || document.ng.createdBy"
								/>
							</dd>
						}
						@if (canShow('dc:contributors') && contributors.length) {
							<dt>
								{{
									'app.modules.document-details-panel.contributors-a72898'
										| webuiMessage: 'Contributors'
								}}
							</dt>
							<dd class="people">
								@for (person of contributors; track principalId(person)) {
									<nx-user-tag [lookup]="false" [user]="person" />
								}
							</dd>
						}
					</dl>
				</section>
				<section class="metadata-content"><ng-template #metadataContainer /></section>
				@if (canShow('collection:collections')) {
					<details class="details-section">
						<summary>
							{{
								'app.modules.document-details-panel.collections-fc10ea'
									| webuiMessage: 'Collections'
							}}
						</summary>
						<div class="details-body">
							<nx-document-collections-panel [document]="document" [noEdit]="noEdit" />
						</div>
					</details>
				}
				@if (metadataError) {
					<p class="text-muted small mb-0">
						{{
							'app.modules.document-details-panel.metadata-is-unavailable-for-this-document-86572e'
								| webuiMessage: 'Metadata is unavailable for this document.'
						}}
					</p>
				}
				@if (canShow('nxtag:tags')) {
					<section class="asset-tags">
						<nx-document-tags-panel [document]="document" [noEdit]="noEdit" />
					</section>
				}

				<section class="details-section activity">
					<div class="details-body">
						<div class="nav nav-tabs" role="tablist">
							<button
								class="nav-link"
								role="tab"
								[attr.aria-selected]="activeTab === 'comments'"
								aria-controls="document-comments"
								[class.active]="activeTab === 'comments'"
								(click)="activeTab = 'comments'"
							>
								{{ 'documentPage.comments' | webuiMessage: 'Comments' }}
							</button>
							<button
								class="nav-link"
								role="tab"
								[attr.aria-selected]="activeTab === 'activity'"
								aria-controls="document-activity"
								[class.active]="activeTab === 'activity'"
								(click)="activeTab = 'activity'"
							>
								{{ 'documentPage.activity' | webuiMessage: 'Activity' }}
							</button>
						</div>
						@if (activeTab === 'comments') {
							<div id="document-comments" role="tabpanel"><nx-comments /></div>
						} @else {
							<div id="document-activity" role="tabpanel">
								<nx-document-activity [document]="document" />
							</div>
						}
					</div>
				</section>
			</section>
		}
	`,
	styles: [
		`
			:host {
				display: block;
				min-width: 0;
			}
			.metadata-content {
				padding-block: 16px;
			}
			.document-status {
				padding: 16px 0 24px;
			}
			.state-pill {
				background: var(--nuxeo-background, #f4f4f6);
				border-radius: 12px;
				padding: 3px 9px;
				text-transform: capitalize;
				font-size: 11px;
			}
			.person-pill {
				display: inline-flex;
				align-items: center;
				gap: 5px;
				padding-inline-end: 8px;
				border-radius: 12px;
				background: var(--nuxeo-background, #f4f4f6);
				font-size: 11px;
			}
			.person-avatar {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				border-radius: 50%;
				width: 20px;
				height: 20px;
				background: #9254a3;
				color: white;
				font-size: 9px;
			}
			.people {
				display: flex;
				flex-wrap: wrap;
				gap: 4px;
			}
			.asset-tags {
				margin-block: 24px 32px;
			}
			.asset-tags ::ng-deep h5 {
				font-size: 13px;
				font-weight: 600;
			}

			.activity {
				border: 0;
			}
			.activity ::ng-deep nx-comments > h5,
			.activity ::ng-deep nx-comments > small {
				display: none;
			}
			.activity ::ng-deep textarea {
				border: 0;
				border-bottom: 1px solid var(--nuxeo-border);
				border-radius: 0;
				min-height: 40px;
				font-size: 12px;
			}
			.activity .nav-link {
				border: 0;
				color: var(--bs-secondary-color);
				border-radius: 0;
			}
			.activity .nav-link.active {
				color: var(--nuxeo-primary-color);
				border-bottom: 2px solid var(--nuxeo-primary-color);
				background: transparent;
			}
			.details-panel {
				overflow: auto;
				padding: 0.75rem 1rem 1rem;
			}
			.details-section {
				margin-bottom: 0.75rem;
				border-block-end: 1px solid var(--bs-border-color);
				padding-block-end: 0.75rem;
			}
			.details-section:last-child {
				margin-bottom: 0;
			}
			summary {
				cursor: pointer;
				font-size: 0.875rem;
				font-weight: 600;
				margin-bottom: 0.75rem;
			}
			.details-body {
				padding-top: 0.75rem;
			}
			dl {
				display: grid;
				grid-template-columns: max-content minmax(0, 1fr);
				gap: 0.5rem 0.75rem;
				margin: 0;
				font-size: 12px;
			}
			dt {
				color: var(--bs-secondary-color);
				font-weight: 500;
			}
			dd {
				margin: 0;
				overflow-wrap: anywhere;
			}
			.version-selector summary {
				font-weight: 400;
				margin: 0;
			}
			.version-selector[open] {
				grid-column: 1 / -1;
			}
			.technical-list {
				font-size: 0.8125rem;
			}
			.tags {
				display: flex;
				flex-wrap: wrap;
				gap: 0.35rem;
			}
			.activity .nav {
				margin-bottom: 0.75rem;
			}
			.nav-link {
				font-size: 0.875rem;
				padding: 0.35rem 0.6rem;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	// The metadata layout's id scopes its suggestion fields.
	providers: [SuggestionScope],
})
export class DocumentDetailsPanelComponent implements OnChanges {
	private readonly messages = inject(WebUiMessages);
	readonly versionsComponent = DocumentVersionsComponent;
	private readonly injector = inject(Injector);
	versionsInjector?: Injector;
	private readonly locale = inject(WebUiLocale);

	@Input() document: any;
	@Input() noEdit = false;
	@Input() externalToolbar = false;
	get metadataEditor(): MetadataEditorControls | null {
		const editor = this.metadataRef?.instance as MetadataEditorControls | undefined;
		return typeof editor?.beginEdit === 'function' && typeof editor?.toggleCustomize === 'function'
			? editor
			: null;
	}
	activeTab: 'comments' | 'activity' = 'comments';
	metadataError = false;
	private readonly layouts = inject(DocumentLayoutRegistry);
	private readonly suggestionScope = inject(SuggestionScope);
	private readonly metadataPolicy = inject(MetadataPolicyService);
	private readonly cdr = inject(ChangeDetectorRef);
	private metadataRef?: ComponentRef<unknown>;
	private metadataComponent?: Type<unknown>;
	private metadataUid?: unknown;
	private ready = false;
	private container?: ViewContainerRef;
	private appliedLayoutRevision = -1;
	private appliedMetadataKey = '';
	@ViewChild('metadataContainer', { read: ViewContainerRef })
	set metadataContainer(container: ViewContainerRef | undefined) {
		this.container = container;
		if (container) {
			this.ready = true;
			this.mountMetadata();
		}
	}

	get isPicture(): boolean {
		return this.document?.type === 'Picture' || this.document?.facets?.includes('Picture');
	}
	initials(name: string): string {
		return String(name)
			.split(/[ ._-]+/)
			.filter(Boolean)
			.map((part) => part[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}
	get tags(): string[] {
		const tags =
			this.document?.contextParameters?.tags ?? this.document?.properties?.['nxtag:tags'];
		return Array.isArray(tags)
			? tags
					.map((tag: any) => (typeof tag === 'string' ? tag : (tag?.label ?? tag?.id)))
					.filter(Boolean)
			: [];
	}
	/** Fetched user entities stay entities so each tag labels exactly as the creator's does
	 *  (email when the user has no names); plain ids stay ids. */
	readonly principalId = principalId;
	get contributors(): unknown[] {
		const values = this.document?.properties?.['dc:contributors'];
		return Array.isArray(values) ? values.filter(Boolean) : [];
	}
	get version(): string {
		const properties = this.document?.properties ?? {};
		const major = properties['uid:major_version'];
		const minor = properties['uid:minor_version'];
		const label =
			this.document?.versionLabel ?? (major != null && minor != null ? `${major}.${minor}` : '');
		return label + (label && this.document?.isCheckedOut ? '+' : '');
	}
	get hasVersions(): boolean {
		const properties = this.document?.properties ?? {};
		return (
			Number(properties['uid:major_version']) > 0 ||
			Number(properties['uid:minor_version']) > 0 ||
			this.document?.isVersion === true
		);
	}

	constructor() {
		effect(() => {
			const layoutRevision = this.layouts.revision();
			const metadataKey = this.metadataKey();
			if (
				this.ready &&
				(this.appliedLayoutRevision !== layoutRevision || this.appliedMetadataKey !== metadataKey)
			)
				this.mountMetadata();
		});
	}
	ngOnChanges(): void {
		// The versions component loads its list when created. Recreate it for another document
		// or revision only: a refreshed copy of the same revision (browser back, membership
		// updates) must not start a second Document.GetVersions.
		const key = JSON.stringify([
			this.document?.repository ?? 'default',
			this.document?.uid ?? null,
			this.document?.changeToken ?? null,
		]);
		if (key !== this.versionsKey || !this.versionsInjector) {
			this.versionsKey = key;
			this.versionsInjector = Injector.create({
				parent: this.injector,
				providers: [{ provide: 'document', useValue: this.document }],
			});
		}
		if (this.ready) this.mountMetadata();
	}
	private versionsKey = '';

	private mountMetadata(): void {
		this.metadataError = false;
		if (!this.document || !this.container) return;
		const context = documentLayoutContext({
			documentType: this.document.type,
			mode: 'metadata',
			document: this.document,
		});
		try {
			const layout = this.layouts.resolve(context);
			if (!layout?.component || layout.disabled) {
				this.clearMetadata();
				return;
			}
			this.suggestionScope.layout.set(layout.id);
			if (isFallbackLayout(layout.id)) reportFallbackMetadataLayout(this.document.type, layout.id);
			if (!this.inputName(layout.component, 'layoutContext'))
				throw new Error('Metadata layout must declare a layoutContext input.');
			if (this.metadataComponent !== layout.component || this.metadataUid !== this.document.uid) {
				this.clearMetadata();
				this.metadataRef = this.container.createComponent(layout.component);
				this.metadataComponent = layout.component;
				this.metadataUid = this.document.uid;
			}
			this.setInput('layoutContext', context);
			this.setInput('document', this.document);
			this.setInput('embedded', true);
			this.setInput('noEdit', this.noEdit);
			this.setInput('externalToolbar', this.externalToolbar);
		} catch {
			this.clearMetadata();
			this.metadataError = true;
		}
		this.appliedLayoutRevision = this.layouts.revision();
		this.appliedMetadataKey = this.metadataKey();
		this.cdr.markForCheck();
	}

	private metadataKey(): string {
		const preferences = this.metadataPolicy.userPreferences(this.document?.type);
		return JSON.stringify([
			preferences.hiddenFields,
			preferences.hiddenSchemas,
			this.metadataPolicy.policy(),
		]);
	}

	technicalEntries(prefix: string): { key: string; label: string; value: string }[] {
		const preferences = this.metadataPolicy.userPreferences(this.document?.type);
		if (this.technicalState(prefix) === 'hidden') return [];
		const properties = this.document?.properties ?? {};
		return Object.entries(properties)
			.filter(
				([key, value]) =>
					(key.startsWith(prefix) || (prefix === 'iptc:' && key.startsWith('picture:'))) &&
					key !== 'picture:views' &&
					key !== 'picture:info' &&
					!preferences.hiddenFields.includes(key) &&
					this.metadataPolicy.canRead(this.document, key) &&
					this.presentable(value),
			)
			.map(([key, value]) => ({ key, label: this.label(key), value: this.formatValue(value) }))
			.filter((entry) => !!entry.value);
	}

	messagesForState(value: unknown): string {
		const state = typeof value === 'string' && value ? value : 'project';
		return ['project', 'approved', 'obsolete', 'deleted'].includes(state)
			? this.messages.text(
					`label.ui.state.${state}`,
					(
						{
							project: 'Project',
							approved: 'Approved',
							obsolete: 'Obsolete',
							deleted: 'Deleted',
						} as Record<string, string>
					)[state],
				)
			: state;
	}

	pictureInfoEntries(): { key: string; label: string; value: string }[] {
		if (this.technicalState('picture:') === 'hidden' || !this.canShow('picture:info')) return [];
		const info = this.document?.properties?.['picture:info'];
		if (!info || typeof info !== 'object') return [];
		const labels: Record<string, string> = {
			width: this.messages.text('picture.width', 'Width'),
			height: this.messages.text('picture.height', 'Height'),
			format: this.messages.text('picture.format', 'Format'),
			colorSpace: this.messages.text('picture.colorSpace', 'Color space'),
			depth: this.messages.text('picture.bitDepth', 'Bit depth'),
		};
		return Object.entries(labels)
			.filter(([key]) => this.presentable(info[key]))
			.map(([key, label]) => ({ key, label, value: this.formatValue(info[key]) }));
	}

	technicalState(prefix: string): 'available' | 'empty' | 'hidden' {
		const preferences = this.metadataPolicy.userPreferences(this.document?.type);
		const schema = prefix.slice(0, -1);
		if (preferences.hiddenSchemas.includes(schema) || preferences.hiddenSchemas.includes(prefix))
			return 'hidden';
		const matching = Object.keys(this.document?.properties ?? {}).filter(
			(key) =>
				key.startsWith(prefix) ||
				(prefix === 'iptc:' &&
					key.startsWith('picture:') &&
					!['picture:info', 'picture:views'].includes(key)),
		);
		if (matching.length && matching.every((key) => !this.canShow(key))) return 'hidden';
		if (!matching.length && !this.metadataPolicy.canRead(this.document, `${prefix}metadata`))
			return 'hidden';
		return matching.length ? 'available' : 'empty';
	}

	canShow(property: string): boolean {
		const preferences = this.metadataPolicy.userPreferences(this.document?.type);
		return (
			!preferences.hiddenFields.includes(property) &&
			this.metadataPolicy.canRead(this.document, property)
		);
	}

	private label(key: string): string {
		return key
			.slice(key.indexOf(':') + 1)
			.replace(/([A-Z])/g, ' $1')
			.replace(/[_-]/g, ' ')
			.replace(/^./, (value) => value.toUpperCase());
	}
	private presentable(value: any): boolean {
		return (
			value != null &&
			value !== '' &&
			!(typeof value === 'object' && ('data' in value || 'content' in value))
		);
	}
	private formatValue(value: any): string {
		if (Array.isArray(value))
			return value
				.map((item) => this.formatValue(item))
				.filter(Boolean)
				.join(', ');
		if (value && typeof value === 'object')
			return Object.entries(value)
				.filter(([, item]) => this.presentable(item))
				.map(([key, item]) => `${this.label(key)}: ${this.formatValue(item)}`)
				.join('; ');
		if (typeof value === 'number') return new Intl.NumberFormat(this.locale.locale()).format(value);
		if (typeof value === 'boolean')
			return this.messages.text(value ? 'common.yes' : 'common.no', value ? 'Yes' : 'No');
		return String(value);
	}
	private clearMetadata(): void {
		this.metadataRef?.destroy();
		this.metadataRef = undefined;
		this.metadataComponent = undefined;
		this.metadataUid = undefined;
		this.container?.clear();
	}

	private inputName(component: Type<unknown>, name: string): string | undefined {
		return reflectComponentType(component)?.inputs.find(
			(input) => input.templateName === name || input.propName === name,
		)?.templateName;
	}
	private setInput(name: string, value: unknown): void {
		const publicName = this.metadataRef && this.inputName(this.metadataRef.componentType, name);
		if (this.metadataRef && publicName) this.metadataRef.setInput(publicName, value);
	}
}

interface MetadataEditorControls {
	editing: boolean;
	saving: boolean;
	dirty: boolean;
	hasEditableFields: boolean;
	beginEdit(): void;
	cancelEdit(): void;
	save(): Promise<void>;
	toggleCustomize(): void;
}
