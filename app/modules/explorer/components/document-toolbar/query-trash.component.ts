import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiMessagePipe, WebUiMessages } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	input,
	signal,
} from '@angular/core';
import { firstValueFrom, Subject, takeUntil, timer } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ResultsToolbarContext } from '@maretha/webui-sdk';
import { QueryBulkActionService } from 'app/modules/search/helpers/query-bulk-action.service';

@Component({
	imports: [WebUiMessagePipe],
	selector: 'nx-query-trash',
	styles: [
		':host { display: inline-flex; gap: 8px; align-items: center; } button { min-height: 32px; padding: 6px 10px; border: 1px solid var(--nuxeo-border); border-radius: 3px; color: var(--nuxeo-primary-color); background: var(--nuxeo-box, #fff); font-size: 13px; font-weight: 600; } button:first-child { color: var(--nuxeo-box, #fff); background: var(--nuxeo-primary-color); border-color: var(--nuxeo-primary-color); } button:disabled { opacity: .55; cursor: not-allowed; }',
	],
	template: `@if (
			context().queryScope || commandId() || submissionUncertain() || running() || confirm()
		) {
			<button
				type="button"
				[disabled]="
					running() ||
					context().busy ||
					!context().queryScope ||
					context().totalCount <= 0 ||
					submissionUncertain()
				"
				(click)="open()"
			>
				{{ labelText() }}
			</button>
		}
		@if (confirm()) {
			<!-- Keep quoted ICU braces intact: Prettier misreads them as Angular interpolation endings. -->
			<!-- prettier-ignore -->
			<p role="alert">
				{{ 'query.trashConfirm' | webuiMessage:'{operation, select, restore {Restore all {count, number} results from {repository}/{provider} matching the applied filters from trash?} other {Move all {count, number} results from {repository}/{provider} matching the applied filters to trash?}}': {operation: (operation()), count: (openedTotal()), repository:
				(openedScope()?.repository || ''), provider: (openedScope()?.providerName || '')} }}
			</p>
			<button (click)="start()">{{ 'command.confirm' | webuiMessage: 'Confirm' }}</button
			><button (click)="confirm.set(false)">
				{{ 'app.modules.query-trash.cancel-fe5a86' | webuiMessage: 'Cancel' }}
			</button>
		}
		@if (commandId()) {
			<p>{{ 'query.job' | webuiMessage: 'Job {id}' : { id: commandId() } }}</p>
		}
		@if (running() || status() || (commandId() && error())) {
			<p role="status">{{ status() }}</p>
			@if (running()) {
				<button (click)="abort()">
					{{ 'app.modules.query-trash.abort-job-a57a99' | webuiMessage: 'Abort job' }}
				</button>
			}
		}
		@if (!running() && commandId() && error()) {
			<button (click)="retryStatus()">
				{{ 'app.modules.query-trash.retry-status-0fca72' | webuiMessage: 'Retry status' }}
			</button>
		}
		@if (error()) {
			<p role="alert">{{ error() }}</p>
		}`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueryTrashComponent {
	readonly context = input.required<ResultsToolbarContext>();
	readonly operation = input<'trash' | 'restore'>('trash');
	// Preserve the public label binding while distinguishing an omitted label from a customer literal.
	// eslint-disable-next-line @angular-eslint/no-input-rename
	readonly configuredLabel = input<string | undefined>(undefined, { alias: 'label' });
	readonly label = computed(() => this.configuredLabel() ?? 'Trash all matching');
	readonly labelKey = input<string>();
	private readonly labelMessages = inject(WebUiMessages);
	readonly labelText = computed(() =>
		this.labelKey()
			? this.labelMessages.text(this.labelKey(), this.label())
			: this.configuredLabel() !== undefined
				? this.label()
				: this.labelMessages.text('query.trashAll', this.label()),
	);
	readonly confirm = signal(false);
	readonly running = signal(false);
	readonly status = localizedText('');
	readonly error = localizedText('');
	readonly commandId = signal('');
	readonly openedScope = signal<ResultsToolbarContext['queryScope']>(undefined);
	readonly openedTotal = signal(0);
	readonly openedExclusions = signal<readonly string[]>([]);
	readonly submissionUncertain = signal(false);
	private readonly bulk = inject(QueryBulkActionService);
	private readonly destroy = inject(DestroyRef);
	private readonly cancelled = new Subject<void>();
	private command?: { repository: string; id: string };
	private commandContext?: ResultsToolbarContext;
	private commandToken?: number;
	private terminal = false;
	constructor() {
		effect(() => {
			if (this.confirm() && !this.sameScope(this.openedScope(), this.context().queryScope))
				this.confirm.set(false);
		});
		this.destroy.onDestroy(() => {
			this.cancelled.next();
			this.cancelled.complete();
		});
	}
	open() {
		const scope = this.context().queryScope;
		if (
			!scope ||
			this.context().totalCount <= 0 ||
			this.context().noEdit ||
			this.context().busy ||
			this.submissionUncertain()
		)
			return;
		if (this.command && !this.terminal) {
			this.error.set(
				messageText(
					'app.state.the-accepted-job-is-still-pending-retry-its-s-25239c',
					'The accepted job is still pending. Retry its status instead.',
				),
			);
			return;
		}
		if (this.terminal) {
			this.command = undefined;
			this.commandId.set('');
			this.status.set('');
			this.error.set('');
			this.terminal = false;
		}
		this.openedScope.set(structuredClone(scope));
		this.openedTotal.set(this.context().totalCount);
		this.openedExclusions.set([...new Set(this.context().queryExclusions ?? [])]);
		this.confirm.set(true);
	}
	async start() {
		const context = this.context();
		const scope = this.openedScope();
		if (
			!scope ||
			this.running() ||
			this.command ||
			this.submissionUncertain() ||
			this.openedTotal() <= 0 ||
			context.totalCount <= 0 ||
			!this.sameScope(scope, context.queryScope) ||
			!this.sameExclusions(this.openedExclusions(), context.queryExclusions ?? []) ||
			context.noEdit
		) {
			this.confirm.set(false);
			this.error.set(
				messageText(
					'app.state.the-search-scope-changed-review-and-confirm-a-cfc692',
					'The search scope changed. Review and confirm again.',
				),
			);
			return;
		}
		const snapshot = structuredClone(scope);
		this.confirm.set(false);
		this.running.set(true);
		this.error.set('');
		context.setBusy(true);
		try {
			const job = await firstValueFrom(
				this.operation() === 'restore'
					? this.bulk.restore(snapshot, this.openedExclusions())
					: this.bulk.trash(snapshot, this.openedExclusions()),
			);
			if (!job.commandId) {
				this.submissionUncertain.set(true);
				throw new Error('missing command id');
			}
			this.command = { repository: snapshot.repository, id: job.commandId };
			this.commandContext = context;
			this.commandToken = context.queryToken;
			this.commandId.set(job.commandId);
			await this.poll(snapshot, context);
		} catch (error) {
			if (
				!this.command &&
				!(error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500)
			)
				this.submissionUncertain.set(true);
			this.error.set(
				this.submissionUncertain()
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
									'app.state.unable-to-start-the-query-trash-action-cfabb0',
									'Unable to start the query trash action.',
								),
			);
		} finally {
			this.running.set(false);
			context.setBusy(false);
		}
	}
	async abort() {
		if (!this.command) return;
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
		}
	}
	async retryStatus() {
		if (!this.command || this.running()) return;
		this.running.set(true);
		this.error.set('');
		try {
			const scope = this.openedScope();
			if (!scope) throw new Error('missing search scope');
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
	private async poll(scope: ResultsToolbarContext['queryScope'], context: ResultsToolbarContext) {
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
			if (this.isTerminal(job.state)) {
				if (
					this.sameScope(scope, this.context().queryScope) &&
					this.commandToken === this.context().queryToken
				)
					await context.refresh();
				this.terminal = true;
				return;
			}
			await firstValueFrom(timer(1000).pipe(takeUntil(this.cancelled)));
		}
	}
	private sameScope(
		left: ResultsToolbarContext['queryScope'],
		right: ResultsToolbarContext['queryScope'],
	): boolean {
		return JSON.stringify(left) === JSON.stringify(right);
	}
	private sameExclusions(left: readonly string[], right: readonly string[]): boolean {
		return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
	}

	private isTerminal(state: string): boolean {
		return ['COMPLETED', 'ABORTED', 'PARTIAL', 'FAILED', 'ERROR'].includes(state);
	}
	confirmationVerb(): string {
		return this.operation() === 'restore' ? 'Restore' : 'Move';
	}
}
