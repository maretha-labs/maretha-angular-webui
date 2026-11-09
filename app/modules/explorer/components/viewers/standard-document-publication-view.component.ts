import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	input,
	PendingTasks,
	signal,
	untracked,
} from '@angular/core';

import { RouterLink } from '@angular/router';
import {
	DocumentViewContext,
	GuardedView,
	ResultsProjectionColumn,
	ResultsProjectionComponent,
	ResultsProjectionTemplateDirective,
	WebUiMessages,
	WebUiIconComponent,
} from '@maretha/webui-sdk';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AutomationsService } from '../../helpers/automations.service';
import { firstValueFrom, filter } from 'rxjs';
import { environment } from 'environments/environment';
import { DocumentLinkPipe } from 'app/helpers/document-route';
import { hasPermission } from 'app/helpers/document-permissions';

@Component({
	selector: 'nx-publication-column-header',
	template: '{{ label }}',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class PublicationColumnHeaderComponent {
	label = '';
	agInit(params: { displayName: string }): void {
		this.label = params.displayName;
	}
	refresh(params: { displayName: string }): boolean {
		this.label = params.displayName;
		return true;
	}
}

interface PublicationDocument extends Record<string, unknown> {
	uid: string;
	path: string;
	parentRef: string;
	isVersion?: boolean;
	isCheckedOut?: boolean;
	properties: Record<string, unknown>;
	contextParameters?: {
		permissions?: string[];
		audit?: { eventId: string; principalName: string; eventDate: string }[];
	};
}
@Component({
	selector: 'nx-standard-document-publication-view',
	imports: [
		RouterLink,
		UserTagComponent,
		WebUiDatePipe,
		ResultsProjectionComponent,
		ResultsProjectionTemplateDirective,
		DocumentLinkPipe,
		WebUiIconComponent,
		WebUiMessagePipe,
	],
	template: `
		<header>
			<h2>{{ messages.text('publication.details', 'Publication details') }}</h2>
			<button
				type="button"
				[disabled]="!canUnpublishAll() || busy() || loading()"
				(click)="requestUnpublishAll()"
			>
				{{ 'publication.unpublishAll' | webuiMessage: 'Unpublish All' }}
			</button>
		</header>
		@if (actionMessage()) {
			<p role="status">{{ actionMessage() }}</p>
		}

		@if (error()) {
			<p role="alert">{{ error() }}</p>
			<button type="button" (click)="reload()" [disabled]="busy()">
				{{ 'app.modules.standard-document-publication-view.retry-401902' | webuiMessage: 'Retry' }}
			</button>
		}
		@if (loading()) {
			<p role="status">
				{{
					'app.modules.standard-document-publication-view.loading-publications-348857'
						| webuiMessage: 'Loading publications…'
				}}
			</p>
		}
		<nx-results-projection
			[hidden]="!rows().length"
			hostId="document-publication"
			mode="table"
			[rows]="rows()"
			[columns]="columns"
			[scope]="source()"
			[loading]="false"
			[readOnly]="loading() || busy()"
			[contextEpoch]="epoch()"
			[selectionEnabled]="false"
			(loadMore)="loadMore()"
		>
			<ng-template nxResultsTemplate="cell:path" let-row="row"
				><a [routerLink]="$any(row) | documentLink">
					@if ($any(row).contextParameters?.thumbnail?.url) {
						<img [src]="$any(row).contextParameters.thumbnail.url" alt="" width="32" height="32" />
					}
					{{ $any(row).path }}</a
				></ng-template
			>
			<ng-template nxResultsTemplate="cell:publisher" let-row="row"
				><nx-user-tag [user]="publisher($any(row))"
			/></ng-template>
			<ng-template nxResultsTemplate="cell:published" let-row="row">{{
				$any(publishedDate($any(row))) | webuiDate: 'longDate'
			}}</ng-template>
			<ng-template nxResultsTemplate="cell:publicationActions" let-row="row">
				@if (canChange($any(row))) {
					<button
						type="button"
						[attr.aria-label]="'publication.unpublish' | webuiMessage: 'Unpublish'"
						[attr.title]="'publication.unpublish' | webuiMessage: 'Unpublish'"
						[disabled]="busy()"
						(click)="confirm.set({ row: $any(row), action: 'unpublish' })"
					>
						<nx-webui-icon name="nuxeo:delete" />
					</button>
				}
				@if (canRepublish($any(row))) {
					<button
						type="button"
						[attr.aria-label]="'publication.republish' | webuiMessage: 'Republish'"
						[attr.title]="'publication.republish' | webuiMessage: 'Republish'"
						[disabled]="busy()"
						(click)="confirm.set({ row: $any(row), action: 'republish' })"
					>
						<nx-webui-icon name="nuxeo:refresh" />
					</button>
				}
			</ng-template>
		</nx-results-projection>
		@if (!rows().length) {
			<div class="empty-table">
				<div class="empty-head">
					@for (column of columns.slice(0, 5); track column.id) {
						<span>{{
							column.labelKey ? messages.text(column.labelKey, column.label) : column.label
						}}</span>
					}
				</div>
				<p role="status">{{ 'publication.noPublications' | webuiMessage: 'No Publications' }}</p>
			</div>
		}
		@if (hasMore()) {
			<button type="button" [disabled]="loading()" (click)="loadMore()">
				{{
					'app.modules.standard-document-publication-view.load-more-e2f3be'
						| webuiMessage: 'Load more'
				}}
			</button>
		}
		@if (confirm(); as pending) {
			<div role="alert">
				<p>
					{{
						pending.action === 'unpublish-all'
							? ('app.modules.standard-document-publication-view.remove-all-publications-you-are-allowed-to-8bf586'
								| webuiMessage
									: 'Remove all publications you are allowed to delete, including publications on other pages?')
							: pending.action === 'unpublish'
								? ('app.modules.standard-document-publication-view.remove-this-publication-e28ecf'
									| webuiMessage: 'Remove this publication?')
								: ('app.modules.standard-document-publication-view.replace-this-publication-with-the-current--b4f7e2'
									| webuiMessage: 'Replace this publication with the current version?')
					}}
				</p>
				<button type="button" [disabled]="busy()" (click)="runAction()">
					{{ 'command.confirm' | webuiMessage: 'Confirm' }}</button
				><button type="button" [disabled]="busy()" (click)="confirm.set(null)">
					{{
						'app.modules.standard-document-publication-view.cancel-bd0410' | webuiMessage: 'Cancel'
					}}
				</button>
			</div>
		}
	`,
	styles:
		':host { display:block; margin:16px; padding:16px; min-width:0; min-height:calc(100vh - 140px); background:var(--nuxeo-box); } header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}h2 { font-size:14px;font-weight:700; } .empty-head{display:grid;grid-template-columns:repeat(5,minmax(100px,1fr));padding:16px 24px;border-bottom:1px solid var(--nuxeo-border);font-weight:600;font-size:13px}.empty-table{overflow:auto}.empty-table p{text-align:center;padding:20px}button:disabled{opacity:.4} .table-scroll { overflow:auto; } table { width:100%; border-collapse:collapse; } th,td { padding:12px; text-align:start; border-bottom:1px solid var(--nuxeo-border); } details { margin-block:20px; } button { margin:4px; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandardDocumentPublicationViewComponent implements GuardedView {
	readonly context = input.required<DocumentViewContext>();
	readonly messages = inject(WebUiMessages);
	private readonly http = inject(HttpClient);
	private readonly tasks = inject(PendingTasks);
	private readonly api = `${environment.nuxeoUrl}/api/v1`;
	private generation = 0;
	private page = 0;
	readonly source = signal<PublicationDocument | null>(null);
	readonly rows = signal<PublicationDocument[]>([]);
	readonly loading = signal(false);
	readonly busy = signal(false);
	readonly error = localizedText('');
	readonly actionMessage = localizedText('');
	readonly hasMore = signal(false);
	readonly epoch = signal(0);
	readonly columns: readonly ResultsProjectionColumn<PublicationDocument>[] = [
		{
			headerComponent: PublicationColumnHeaderComponent,
			id: 'path',
			label: 'Path',
			labelKey: 'app.columns.path',
			value: (row) => row.path,
		},
		{
			headerComponent: PublicationColumnHeaderComponent,
			id: 'version',
			label: 'Version',
			labelKey: 'app.columns.version',
			value: (row) =>
				`${row.properties['uid:major_version']}.${row.properties['uid:minor_version']}`,
		},
		{
			headerComponent: PublicationColumnHeaderComponent,
			id: 'rendition',
			label: 'Rendition',
			labelKey: 'app.columns.rendition',
			value: (row) => row.properties['rend:renditionName'] || '',
		},
		{
			headerComponent: PublicationColumnHeaderComponent,
			id: 'publisher',
			label: 'Publisher',
			labelKey: 'app.columns.publisher',
			value: (row) => this.publisher(row) ?? '',
		},
		{
			headerComponent: PublicationColumnHeaderComponent,
			id: 'published',
			label: 'Publish Date',
			labelKey: 'app.columns.publish-date',
			value: (row) => this.publishedDate(row) ?? '',
		},
		{
			headerComponent: PublicationColumnHeaderComponent,
			id: 'publicationActions',
			label: '',
			value: () => '',
			width: 100,
			flex: 0,
		},
	];
	readonly confirm = signal<{
		row: PublicationDocument;
		action: 'unpublish' | 'republish' | 'unpublish-all';
	} | null>(null);
	readonly canUnpublishAll = computed(
		() => !this.context().noEdit && !!this.source() && this.rows().length > 0,
	);
	requestUnpublishAll(): void {
		const source = this.source();
		if (source && this.canUnpublishAll() && !this.busy() && !this.loading())
			this.confirm.set({ row: source, action: 'unpublish-all' });
	}
	constructor() {
		inject(AutomationsService)
			.documentPublished$.pipe(
				takeUntilDestroyed(),
				filter(
					(event) =>
						event.documentUid === this.source()?.uid &&
						(event.repository === undefined ||
							event.repository === String(this.context().document?.['repository'] ?? 'default')),
				),
			)
			.subscribe(() => this.reload());
		// One load per document, not per refreshed copy of the same document.
		let loaded: string | undefined;
		effect(() => {
			const document = this.context().document;
			const identity = JSON.stringify([
				document?.['repository'] ?? 'default',
				document?.['uid'] ?? null,
			]);
			if (identity === loaded) return;
			loaded = identity;
			untracked(() => this.tasks.run(() => this.load(document)));
		});
		inject(DestroyRef).onDestroy(() => this.generation++);
	}
	private async load(document: Readonly<Record<string, unknown>> | null): Promise<void> {
		const generation = ++this.generation;
		this.rows.set([]);
		this.epoch.update((value) => value + 1);
		this.source.set(null);
		this.hasMore.set(false);
		this.page = 0;
		this.error.set('');
		this.actionMessage.set('');
		this.loading.set(true);
		this.confirm.set(null);
		try {
			if (!document?.['uid']) return;
			const source = await firstValueFrom(
				document['isVersion'] || document['isProxy']
					? this.http.post<PublicationDocument>(
							`${this.api}/automation/Proxy.GetSourceDocument`,
							{ input: document['uid'], params: {} },
							{
								headers: {
									'enrichers-document': 'permissions',
									properties: '*',
									'X-NXRepository': String(document['repository'] ?? 'default'),
								},
							},
						)
					: this.http.get<PublicationDocument>(
							`${this.api}/id/${encodeURIComponent(String(document['uid']))}`,
							{
								headers: {
									'enrichers-document': 'permissions',
									properties: '*',
									'X-NXRepository': String(document['repository'] ?? 'default'),
								},
							},
						),
			);
			if (generation !== this.generation) return;
			this.source.set(source);
			await this.fetch(0, generation);
		} catch {
			if (generation === this.generation)
				this.error.set(
					messageText(
						'app.state.publications-could-not-be-loaded-4e082f',
						'Publications could not be loaded.',
					),
				);
		} finally {
			if (generation === this.generation) this.loading.set(false);
		}
	}
	private async fetch(page: number, generation: number): Promise<void> {
		const uid = this.source()?.uid;
		if (!uid || !/^[a-zA-Z0-9_-]+$/.test(uid)) throw new Error('Invalid source identifier.');
		const query = `SELECT * FROM Document WHERE ecm:isProxy = 1 AND ecm:isTrashed = 0 AND (rend:sourceVersionableId = '${uid}' OR ecm:proxyVersionableId = '${uid}')`;
		const params = new HttpParams()
			.set('queryParams', query)
			.set('pageSize', 40)
			.set('currentPageIndex', page)
			.set('sortBy', 'dc:modified')
			.set('sortOrder', 'desc');
		const result = await firstValueFrom(
			this.http.get<{ entries: PublicationDocument[]; isNextPageAvailable: boolean }>(
				`${this.api}/search/pp/nxql_search/execute`,
				{
					params,
					headers: {
						properties: 'dublincore,common,uid,rendition',
						'X-NXRepository': String(this.context().document?.['repository'] ?? 'default'),
						'fetch-document': 'properties',
						'enrichers-document': 'permissions,audit,thumbnail',
					},
				},
			),
		);
		if (generation !== this.generation) return;
		this.rows.update((rows) => [
			...new Map([...(page ? rows : []), ...result.entries].map((row) => [row.uid, row])).values(),
		]);
		this.epoch.update((value) => value + 1);
		this.page = page;
		this.hasMore.set(result.isNextPageAvailable);
	}
	reload(): void {
		if (!this.busy()) this.tasks.run(() => this.load(this.context().document));
	}
	async loadMore(): Promise<void> {
		if (this.loading() || this.busy() || !this.hasMore()) return;
		this.loading.set(true);
		this.error.set('');
		const generation = this.generation;
		try {
			await this.fetch(this.page + 1, generation);
		} catch {
			if (generation === this.generation)
				this.error.set(
					messageText(
						'app.state.more-publications-could-not-be-loaded-86eb10',
						'More publications could not be loaded.',
					),
				);
		} finally {
			if (generation === this.generation) this.loading.set(false);
		}
	}
	canChange(row: PublicationDocument): boolean {
		return !this.context().noEdit && hasPermission(row, 'WriteVersion');
	}
	canRepublish(row: PublicationDocument): boolean {
		const source = this.source();
		if (!source || !this.canChange(row)) return false;
		const major = Number(row.properties['uid:major_version']);
		const minor = Number(row.properties['uid:minor_version']);
		const currentMajor = Number(source.properties['uid:major_version']);
		const currentMinor = Number(source.properties['uid:minor_version']);
		return (
			major < currentMajor ||
			(major === currentMajor &&
				(minor < currentMinor || (minor === currentMinor && !!source.isCheckedOut)))
		);
	}
	publisher(row: PublicationDocument): unknown {
		return (
			row.contextParameters?.audit?.find((event) => event.eventId === 'documentCreated')
				?.principalName ??
			row.properties['dc:publisher'] ??
			row.properties['dc:lastContributor']
		);
	}
	publishedDate(row: PublicationDocument): unknown {
		return (
			row.contextParameters?.audit?.find((event) => event.eventId === 'documentCreated')
				?.eventDate ??
			row.properties['dc:publishDate'] ??
			row.properties['dc:created']
		);
	}
	async runAction(): Promise<void> {
		const pending = this.confirm();
		if (
			!pending ||
			this.busy() ||
			(pending.action === 'unpublish-all'
				? !this.canUnpublishAll() || pending.row.uid !== this.source()?.uid
				: !this.rows().some((row) => row.uid === pending.row.uid && this.canChange(row))) ||
			(pending.action === 'republish' && !this.canRepublish(pending.row))
		)
			return;
		this.busy.set(true);
		this.error.set('');
		const generation = this.generation;
		try {
			const operation =
				pending.action === 'unpublish-all'
					? 'Document.UnpublishAll'
					: pending.action === 'unpublish'
						? 'Document.Delete'
						: 'Document.PublishToSection';
			const input = pending.action === 'unpublish' ? pending.row.uid : this.source()?.uid;
			const params =
				pending.action !== 'republish'
					? {}
					: {
							target: pending.row.parentRef,
							override: true,
							renditionName: pending.row.properties['rend:renditionName'],
						};
			await firstValueFrom(
				this.http.post(
					`${this.api}/automation/${operation}`,
					{ input, params },
					{
						headers: {
							'nx-es-sync': 'true',
							'X-NXRepository': String(this.context().document?.['repository'] ?? 'default'),
						},
					},
				),
			);
			if (generation === this.generation) {
				this.confirm.set(null);
				this.context().refreshDocument?.();
				await this.load(this.context().document);
				if (pending.action === 'unpublish-all' && !this.error())
					this.actionMessage.set(
						this.rows().length
							? messageText(
									'app.state.some-publications-remain-nuxeo-only-removes-p-81b56e',
									'Some publications remain. Nuxeo only removes publications you are allowed to delete.',
								)
							: messageText('app.state.publications-removed-e98c00', 'Publications removed.'),
					);
			}
		} catch {
			if (generation === this.generation)
				this.error.set(
					messageText(
						'app.state.the-publication-action-failed-verify-your-per-8ec829',
						'The publication action failed. Verify your permissions and retry.',
					),
				);
		} finally {
			this.busy.set(false);
		}
	}
	publisherId(row: PublicationDocument): string {
		const user = this.publisher(row) as any;
		return typeof user === 'string' ? user : String(user?.id ?? user?.properties?.username ?? '');
	}
	publisherLabel(row: PublicationDocument): string {
		const user = this.publisher(row) as any;
		return (
			[user?.properties?.firstName, user?.properties?.lastName].filter(Boolean).join(' ') ||
			user?.properties?.email ||
			this.publisherId(row)
		);
	}
	canDeactivate(): boolean {
		return !this.busy();
	}
}
