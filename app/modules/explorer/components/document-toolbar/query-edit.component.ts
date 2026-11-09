import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { NgComponentOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	Type,
	inject,
	effect,
	untracked,
	input,
	signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
	BulkFieldChange,
	BulkLayoutComponent,
	BulkLayoutContext,
	BulkLayoutResolver,
	DefaultBulkLayoutComponent,
	ResultsToolbarContext,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { firstValueFrom, Subject, takeUntil, timer } from 'rxjs';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { QueryBulkActionService } from 'app/modules/search/helpers/query-bulk-action.service';
import { loadBulkDirectoryChoices } from './bulk-directory-choices';

@Component({
	selector: 'nx-query-edit',
	imports: [NgComponentOutlet, WebUiMessagePipe],
	styles: [
		':host { display: inline-flex; gap: 8px; align-items: center; } button { min-height: 32px; padding: 6px 10px; border: 1px solid var(--nuxeo-border); border-radius: 3px; color: var(--nuxeo-primary-color); background: var(--nuxeo-box, #fff); font-size: 13px; font-weight: 600; } button:first-child { color: var(--nuxeo-box, #fff); background: var(--nuxeo-primary-color); border-color: var(--nuxeo-primary-color); } button:disabled { opacity: .55; cursor: not-allowed; }',
	],
	template: `@if (context().queryScope || commandId() || editing() || confirm()) {
			<button
				type="button"
				[disabled]="
					context().busy ||
					context().noEdit ||
					context().totalCount <= 0 ||
					running() ||
					pendingStatus() ||
					uncertain()
				"
				(click)="open()"
			>
				{{ 'app.modules.query-edit.edit-all-matching-dd782f' | webuiMessage: 'Edit all matching' }}
			</button>
		}
		@if (editing()) {
			<section
				[attr.aria-label]="
					'app.modules.query-edit.edit-all-matching-results-9374a6'
						| webuiMessage: 'Edit all matching results'
				"
			>
				<p>
					{{
						'query.editScope'
							| webuiMessage
								: 'Changes apply to all {count, number} matching results. Excluded matching results: {excluded, number}.'
								: { count: openedTotal(), excluded: openedExclusions().length }
					}}
				</p>
				<fieldset [disabled]="confirm() || directoryLoading()">
					<ng-container *ngComponentOutlet="layoutComponent; inputs: layoutInputs" />
				</fieldset>
				@if (directoryError()) {
					<p role="alert">
						{{ directoryError() }}
						<button type="button" (click)="loadDirectories()">
							{{ 'app.modules.query-edit.retry-choices-1aa187' | webuiMessage: 'Retry choices' }}
						</button>
					</p>
				}
				<button type="button" [disabled]="!canConfirm()" (click)="requestConfirmation()">
					{{
						'app.modules.query-edit.review-changes-79a82d' | webuiMessage: 'Review changes'
					}}</button
				><button type="button" (click)="close()">
					{{ 'app.modules.query-edit.cancel-b0ff70' | webuiMessage: 'Cancel' }}
				</button>
			</section>
		}
		@if (confirm()) {
			<p role="alert">
				{{
					'query.editConfirm'
						| webuiMessage
							: 'Apply the reviewed metadata changes to all {count, number} results matching the captured filters?'
							: { count: openedTotal() }
				}}
			</p>
			<button type="button" (click)="start()">
				{{ 'command.confirm' | webuiMessage: 'Confirm' }}</button
			><button type="button" (click)="confirm.set(false)">
				{{ 'app.modules.query-edit.cancel-b0ff70' | webuiMessage: 'Cancel' }}
			</button>
		}
		@if (commandId()) {
			<p>{{ 'query.job' | webuiMessage: 'Job {id}' : { id: commandId() } }}</p>
		}
		@if (running() || status()) {
			<p role="status">{{ status() }}</p>
		}
		@if (pendingStatus()) {
			<button type="button" [disabled]="running()" (click)="retryStatus()">
				{{ 'app.modules.query-edit.retry-status-538426' | webuiMessage: 'Retry status' }}</button
			><button type="button" [disabled]="abortBusy()" (click)="abort()">
				{{ 'app.modules.query-edit.abort-job-0ab470' | webuiMessage: 'Abort job' }}
			</button>
		}
		@if (error()) {
			<p role="alert">{{ error() }}</p>
		}`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueryEditComponent {
	readonly context = input.required<ResultsToolbarContext>();
	readonly editing = signal(false);
	readonly confirm = signal(false);
	readonly running = signal(false);
	readonly abortBusy = signal(false);
	readonly pendingStatus = signal(false);
	readonly uncertain = signal(false);
	readonly error = localizedText('');
	readonly status = localizedText('');
	readonly commandId = signal('');
	readonly options = signal<Record<string, readonly { id: string; label: string }[]>>({});
	readonly directoryError = localizedText('');
	readonly directoryLoading = signal(false);
	readonly openedScope = signal<ResultsToolbarContext['queryScope']>(undefined);
	readonly openedTotal = signal(0);
	readonly openedExclusions = signal<readonly string[]>([]);
	changes: readonly BulkFieldChange[] = [];
	layoutContext: BulkLayoutContext = this.makeContext([]);
	layoutComponent: Type<BulkLayoutComponent> = DefaultBulkLayoutComponent;
	private readonly bulk = inject(QueryBulkActionService);
	private readonly gateway = inject(DocumentLayoutGatewayService);
	private readonly messages = inject(WebUiMessages);
	private readonly layouts = inject(BulkLayoutResolver);
	private readonly destroy = inject(DestroyRef);
	private readonly cancelled = new Subject<void>();
	private command?: { repository: string; id: string };
	private commandContext?: ResultsToolbarContext;
	private terminal = false;
	private openedToken?: number;
	private openedRouteToken?: number;
	private reviewedChanges: readonly BulkFieldChange[] = [];
	private directoryEpoch = 0;
	private editorEpoch = 0;
	private directoryLocale = this.messages.locale();
	constructor() {
		effect(() => {
			const locale = this.messages.locale();
			if (locale !== this.directoryLocale) {
				this.directoryLocale = locale;
				untracked(() => {
					if (this.editing() && !this.running()) void this.loadDirectories();
				});
			}
		});
		this.destroy.onDestroy(() => {
			this.directoryEpoch++;
			this.cancelled.next();
			this.cancelled.complete();
		});
	}
	get layoutInputs(): Record<string, unknown> {
		return this.layoutComponent === DefaultBulkLayoutComponent
			? { context: this.layoutContext, options: this.options() }
			: { context: this.layoutContext };
	}
	async open(): Promise<void> {
		const c = this.context();
		if (
			!c.queryScope ||
			c.noEdit ||
			c.busy ||
			c.totalCount <= 0 ||
			this.running() ||
			this.uncertain() ||
			this.pendingStatus()
		)
			return;
		if (this.command && !this.terminal) {
			this.error.set(
				messageText(
					'app.state.the-accepted-job-is-still-pending-retry-its-s-4eb054',
					'The accepted job is still pending. Retry its status or abort it.',
				),
			);
			return;
		}
		this.command = undefined;
		this.commandId.set('');
		this.status.set('');
		this.error.set('');
		this.terminal = false;
		this.openedScope.set(structuredClone(c.queryScope));
		this.openedTotal.set(c.totalCount);
		this.openedExclusions.set([...new Set(c.queryExclusions ?? [])]);
		this.openedToken = c.queryToken;
		this.openedRouteToken = c.routeToken;
		this.changes = [];
		this.reviewedChanges = [];
		this.editorEpoch++;
		this.layoutContext = this.makeContext([]);
		this.layoutComponent = this.layouts.resolve('default')?.component ?? DefaultBulkLayoutComponent;
		this.editing.set(true);
		this.confirm.set(false);
		await this.loadDirectories();
	}
	close(): void {
		if (!this.running()) {
			this.editorEpoch++;
			this.editing.set(false);
			this.confirm.set(false);
			this.reviewedChanges = [];
		}
	}
	canConfirm(): boolean {
		return (
			!this.directoryLoading() &&
			!this.directoryError() &&
			this.changes.some((x) => x.mode !== 'keep') &&
			!this.invalid(this.changes) &&
			this.sameCapturedContext()
		);
	}
	requestConfirmation(): void {
		if (this.canConfirm()) {
			this.reviewedChanges = structuredClone(this.changes);
			this.confirm.set(true);
		}
	}
	async start(): Promise<void> {
		const scope = this.openedScope();
		if (
			!scope ||
			this.context().noEdit ||
			this.context().busy ||
			!this.confirm() ||
			!this.sameCapturedContext() ||
			!this.reviewedChanges.length ||
			this.invalid(this.reviewedChanges) ||
			this.running()
		) {
			this.error.set(
				messageText(
					'app.state.the-search-scope-changed-review-and-confirm-a-cfc692',
					'The search scope changed. Review and confirm again.',
				),
			);
			this.confirm.set(false);
			return;
		}
		this.confirm.set(false);
		this.editing.set(false);
		this.running.set(true);
		this.error.set('');
		const c = this.context();
		c.setBusy(true);
		try {
			const job = await firstValueFrom(
				this.bulk.update(
					scope,
					this.operationParameters(this.reviewedChanges),
					this.openedExclusions(),
				),
			);
			if (!job.commandId) {
				this.uncertain.set(true);
				throw new Error('missing command id');
			}
			this.command = { repository: scope.repository, id: job.commandId };
			this.commandContext = c;
			this.commandId.set(job.commandId);
			this.pendingStatus.set(true);
			await this.poll(scope, c);
		} catch (error) {
			if (
				!this.command &&
				!(error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500)
			)
				this.uncertain.set(true);
			this.error.set(
				this.uncertain()
					? messageText(
							'app.state.the-submission-outcome-is-unknown-do-not-subm-d63d25',
							'The submission outcome is unknown. Do not submit it again.',
						)
					: error instanceof HttpErrorResponse && error.status === 404
						? messageText(
								'app.state.the-bulk-runaction-endpoint-was-not-found-che-7e29bd',
								'The Bulk.RunAction endpoint was not found. Check the server or proxy configuration before using query-wide actions.',
							)
						: this.command
							? messageText(
									'app.state.the-job-was-accepted-but-status-could-not-be-210342',
									'The job was accepted but status could not be read.',
								)
							: messageText(
									'app.state.unable-to-start-the-query-metadata-update-c12746',
									'Unable to start the query metadata update.',
								),
			);
		} finally {
			this.running.set(false);
			c.setBusy(false);
		}
	}
	async retryStatus(): Promise<void> {
		const scope = this.openedScope();
		if (!scope || !this.command || this.running() || !this.pendingStatus()) return;
		this.running.set(true);
		this.error.set('');
		try {
			await this.poll(scope, this.commandContext ?? this.context());
		} catch {
			this.error.set(
				messageText(
					'app.state.the-job-status-is-still-unavailable-7d9210',
					'The job status is still unavailable.',
				),
			);
		} finally {
			this.running.set(false);
		}
	}
	async abort(): Promise<void> {
		if (!this.command || !this.pendingStatus() || this.abortBusy()) return;
		this.abortBusy.set(true);
		try {
			await firstValueFrom(this.bulk.abort(this.command.repository, this.command.id));
			this.status.set(messageText('app.state.abort-requested-452edb', 'Abort requested.'));
		} catch {
			this.error.set(
				messageText(
					'app.state.the-server-could-not-abort-this-job-db90a8',
					'The server could not abort this job.',
				),
			);
		} finally {
			this.abortBusy.set(false);
		}
	}
	private async poll(
		scope: ResultsToolbarContext['queryScope'],
		c: ResultsToolbarContext,
	): Promise<void> {
		while (this.command && !this.destroy.destroyed) {
			const job = await firstValueFrom(
				this.bulk.status(this.command.repository, this.command.id).pipe(takeUntil(this.cancelled)),
			);
			this.status.set(
				messageText(
					'query.progress',
					'{state, select, SCHEDULED {Scheduled} RUNNING {Running} COMPLETED {Completed} ABORTED {Aborted} PARTIAL {Partially completed} FAILED {Failed} ERROR {Error} other {{state}}}: {processed, number} processed, {failed, number} failed.',
					{ state: job.state, processed: job.processed ?? 0, failed: job.errorCount ?? 0 },
				),
			);
			if (['COMPLETED', 'ABORTED', 'PARTIAL', 'FAILED', 'ERROR'].includes(job.state)) {
				this.terminal = true;
				this.pendingStatus.set(false);
				if (this.sameCapturedContext()) await c.refresh();
				return;
			}
			await firstValueFrom(timer(1000).pipe(takeUntil(this.cancelled)));
		}
	}
	private makeContext(documents: readonly Readonly<Record<string, unknown>>[]): BulkLayoutContext {
		const epoch = this.editorEpoch;
		return Object.freeze({
			documents: Object.freeze([...documents]),
			changes: Object.freeze([...this.changes]),
			commit: (next: readonly BulkFieldChange[]) => {
				if (epoch !== this.editorEpoch || !this.editing() || this.running() || this.confirm())
					return;
				this.changes = structuredClone(next);
				this.layoutContext = this.makeContext(documents);
			},
		});
	}
	private invalid(changes: readonly BulkFieldChange[]): boolean {
		return changes.some(
			(x) =>
				x.mode !== 'keep' &&
				x.mode !== 'remove' &&
				(Array.isArray(x.value) ? !x.value.length : x.value == null || x.value === ''),
		);
	}
	private operationParameters(changes: readonly BulkFieldChange[]): Record<string, string> {
		let properties = '';
		let propertiesBehaviors = '';
		for (const x of changes) {
			if (x.mode === 'keep') continue;
			const path = x.property.replace(/\./g, '/');
			const value =
				x.mode === 'remove'
					? ''
					: typeof x.value === 'object'
						? JSON.stringify(x.value)
						: String(x.value ?? '');
			properties += `${path}=${value}\n`;
			if (x.mode === 'addValues') propertiesBehaviors += `${path}=append_excluding_duplicates\n`;
		}
		return { properties, propertiesBehaviors };
	}
	private sameCapturedContext(): boolean {
		const c = this.context();
		return (
			JSON.stringify(this.openedScope()) === JSON.stringify(c.queryScope) &&
			this.openedToken === c.queryToken &&
			this.openedRouteToken === c.routeToken &&
			this.openedTotal() === c.totalCount &&
			JSON.stringify([...this.openedExclusions()].sort()) ===
				JSON.stringify([...(c.queryExclusions ?? [])].sort())
		);
	}
	async loadDirectories(): Promise<void> {
		const epoch = ++this.directoryEpoch;
		this.directoryLoading.set(true);
		this.directoryError.set('');
		try {
			const choices = await loadBulkDirectoryChoices(this.gateway, this.messages);
			if (epoch !== this.directoryEpoch || this.destroy.destroyed) return;
			this.options.set(choices);
		} catch {
			if (epoch === this.directoryEpoch && !this.destroy.destroyed)
				this.directoryError.set(
					messageText(
						'app.state.directory-choices-could-not-be-loaded-retry-b-5c648e',
						'Directory choices could not be loaded. Retry before changing a directory field.',
					),
				);
		} finally {
			if (epoch === this.directoryEpoch && !this.destroy.destroyed)
				this.directoryLoading.set(false);
		}
	}
}
