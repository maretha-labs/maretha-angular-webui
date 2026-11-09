import { localizedText, messageText } from 'app/helpers/localized-message';
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
	viewChild,
	untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
	DocumentViewContext,
	DocumentViewsComponent,
	GuardedView,
	ResultsProjectionColumn,
	ResultsProjectionComponent,
	ResultsProjectionTemplateDirective,
	ViewDeparture,
} from '@maretha/webui-sdk';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AutomationsService } from '../../helpers/automations.service';
import { firstValueFrom, filter } from 'rxjs';
import { environment } from 'environments/environment';
import { DocumentLinkPipe } from 'app/helpers/document-route';
import { hasPermission } from 'app/helpers/document-permissions';

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
	selector: 'nx-document-publication-view',
	imports: [
		RouterLink,
		DocumentViewsComponent,
		ResultsProjectionComponent,
		ResultsProjectionTemplateDirective,
		DocumentLinkPipe,
		WebUiMessagePipe,
	],
	template: `
		<h2>{{ 'documentInfo.publications' | webuiMessage: 'Publications' }}</h2>
		@if (actionMessage()) {
			<p role="status">{{ actionMessage() }}</p>
		}
		@if (canUnpublishAll()) {
			<button type="button" [disabled]="busy() || loading()" (click)="requestUnpublishAll()">
				{{
					'app.modules.document-publication-view.unpublish-all-fe13b2'
						| webuiMessage: 'Unpublish all'
				}}
			</button>
		}
		@if (error()) {
			<p role="alert">{{ error() }}</p>
			<button type="button" (click)="reload()" [disabled]="busy()">
				{{ 'app.modules.document-publication-view.retry-c04766' | webuiMessage: 'Retry' }}
			</button>
		}
		@if (loading()) {
			<p role="status">
				{{
					'app.modules.document-publication-view.loading-publications-df3a6c'
						| webuiMessage: 'Loading publications…'
				}}
			</p>
		}
		@if (canPublish()) {
			<details>
				<summary>
					{{
						'app.modules.document-publication-view.publish-to-a-section-17072a'
							| webuiMessage: 'Publish to a section'
					}}
				</summary>
				<nx-paired-views
					itemSlot="PUBLISH_ITEMS"
					pageSlot="PUBLISH_PAGES"
					[label]="
						'app.modules.document-publication-view.publish-destinations-adf342'
							| webuiMessage: 'Publish destinations'
					"
					[context]="publishContext()"
				/>
			</details>
		}
		<nx-results-projection
			hostId="document-publication"
			mode="table"
			[rows]="rows()"
			[columns]="columns"
			[scope]="source()"
			[loading]="loading() || busy()"
			[contextEpoch]="epoch()"
			[selectionEnabled]="false"
			(loadMore)="loadMore()"
		>
			<ng-template nxResultsTemplate="cell:path" let-row="row"
				><a [routerLink]="$any(row) | documentLink">{{ $any(row).path }}</a></ng-template
			>
			<ng-template nxResultsTemplate="action" let-row="row">
				@if (canChange($any(row))) {
					<button
						type="button"
						[disabled]="busy()"
						(click)="confirm.set({ row: $any(row), action: 'unpublish' })"
					>
						{{ 'publication.unpublish' | webuiMessage: 'Unpublish' }}
					</button>
				}
				@if (canRepublish($any(row))) {
					<button
						type="button"
						[disabled]="busy()"
						(click)="confirm.set({ row: $any(row), action: 'republish' })"
					>
						{{ 'publication.republish' | webuiMessage: 'Republish' }}
					</button>
				}
			</ng-template>
		</nx-results-projection>
		@if (hasMore()) {
			<button type="button" [disabled]="loading()" (click)="loadMore()">
				{{ 'app.modules.document-publication-view.load-more-d8986b' | webuiMessage: 'Load more' }}
			</button>
		}
		@if (confirm(); as pending) {
			<div role="alert">
				<p>
					{{
						pending.action === 'unpublish-all'
							? ('app.modules.document-publication-view.remove-all-publications-you-are-allowed-to-6b5232'
								| webuiMessage
									: 'Remove all publications you are allowed to delete, including publications on other pages?')
							: pending.action === 'unpublish'
								? ('app.modules.document-publication-view.remove-this-publication-892f4a'
									| webuiMessage: 'Remove this publication?')
								: ('app.modules.document-publication-view.replace-this-publication-with-the-current--bbfa2c'
									| webuiMessage: 'Replace this publication with the current version?')
					}}
				</p>
				<button type="button" [disabled]="busy()" (click)="runAction()">
					{{ 'command.confirm' | webuiMessage: 'Confirm' }}</button
				><button type="button" [disabled]="busy()" (click)="confirm.set(null)">
					{{ 'app.modules.document-publication-view.cancel-11b260' | webuiMessage: 'Cancel' }}
				</button>
			</div>
		}
	`,
	styles:
		':host { display:block; padding:20px; min-width:0; } h2 { font-size:18px; } .table-scroll { overflow:auto; } table { width:100%; border-collapse:collapse; } th,td { padding:12px; text-align:start; border-bottom:1px solid var(--nuxeo-border); } details { margin-block:20px; } button { margin:4px; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentPublicationViewComponent implements GuardedView {
	readonly context = input.required<DocumentViewContext>();
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
		{ id: 'path', label: 'Path', labelKey: 'app.columns.path', value: (row) => row.path },
		{
			id: 'version',
			label: 'Version',
			labelKey: 'app.columns.version',
			value: (row) =>
				`${row.properties['uid:major_version']}.${row.properties['uid:minor_version']}`,
		},
		{
			id: 'rendition',
			label: 'Rendition',
			labelKey: 'app.columns.rendition',
			value: (row) => row.properties['rend:renditionName'] || 'Original',
		},
		{
			id: 'publisher',
			label: 'Publisher',
			labelKey: 'app.columns.publisher',
			value: (row) => this.publisher(row) ?? '',
		},
		{
			id: 'published',
			label: 'Published',
			labelKey: 'app.columns.published',
			value: (row) => this.publishedDate(row) ?? '',
		},
	];
	readonly confirm = signal<{
		row: PublicationDocument;
		action: 'unpublish' | 'republish' | 'unpublish-all';
	} | null>(null);
	readonly canUnpublishAll = computed(
		() => !!this.source() && this.rows().some((row) => this.canChange(row)),
	);
	requestUnpublishAll(): void {
		const source = this.source();
		if (source && this.canUnpublishAll() && !this.busy() && !this.loading())
			this.confirm.set({ row: source, action: 'unpublish-all' });
	}
	private readonly publishOutlet = viewChild(DocumentViewsComponent);
	readonly canPublish = computed(
		() => !this.context().noEdit && hasPermission(this.source(), 'WriteVersion'),
	);
	readonly publishContext = computed<DocumentViewContext>(() => ({
		...this.context(),
		document: this.source() as unknown as Record<string, unknown> | null,
	}));
	constructor() {
		inject(AutomationsService)
			.documentPublished$.pipe(
				takeUntilDestroyed(),
				filter((event) => event.documentUid === this.source()?.uid),
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
							{ headers: { 'enrichers-document': 'permissions', properties: '*' } },
						)
					: this.http.get<PublicationDocument>(
							`${this.api}/id/${encodeURIComponent(String(document['uid']))}`,
							{ headers: { 'enrichers-document': 'permissions', properties: '*' } },
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
						properties: 'dublincore,uid,rendition',
						'enrichers-document': 'permissions,audit',
					},
				},
			),
		);
		if (generation !== this.generation) return;
		this.rows.update((rows) => (page ? [...rows, ...result.entries] : result.entries));
		this.epoch.update((value) => value + 1);
		this.page = page;
		this.hasMore.set(result.isNextPageAvailable);
	}
	reload(): void {
		if (!this.busy()) this.tasks.run(() => this.load(this.context().document));
	}
	async loadMore(): Promise<void> {
		if (this.loading()) return;
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
				?.eventDate ?? row.properties['dc:created']
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
					{ headers: { 'nx-es-sync': 'true' } },
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
	canDeactivate(departure: ViewDeparture): boolean | Promise<boolean> {
		if (this.busy()) return false;
		return this.publishOutlet()?.canDeactivate(departure) ?? true;
	}
}
