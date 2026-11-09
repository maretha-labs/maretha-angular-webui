import { localizedState } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { NgComponentOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	DestroyRef,
	Input,
	OnDestroy,
	OnInit,
	Type,
	inject,
	effect,
	untracked,
} from '@angular/core';
import {
	BulkFieldChange,
	BulkLayoutComponent,
	BulkLayoutContext,
	DefaultBulkLayoutComponent,
	ViewNavigation,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { BulkEditorService, BulkSaveStatus } from './bulk-editor.service';
import { loadBulkDirectoryChoices } from './bulk-directory-choices';

@Component({
	selector: 'nx-bulk-editor-modal',
	standalone: true,
	imports: [NgComponentOutlet, WebUiMessagePipe],
	templateUrl: './bulk-editor-modal.component.html',
	styles: [':host { display: block; } nx-default-bulk-layout { display: grid; gap: 1rem; }'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BulkEditorModalComponent implements OnInit, OnDestroy {
	static readonly defaultLayout = DefaultBulkLayoutComponent;
	@Input() documents: readonly Readonly<Record<string, unknown>>[] = [];
	@Input() layoutComponent: Type<BulkLayoutComponent> = DefaultBulkLayoutComponent;
	/** The opener checks route, loaded selection, and query scope before each write. */
	@Input() isCurrentScope: () => boolean = () => true;
	private readonly modal = inject(BsModalRef);
	private readonly gateway = inject(DocumentLayoutGatewayService);
	private readonly messages = inject(WebUiMessages);
	private readonly editor = inject(BulkEditorService);
	private readonly cdr = inject(ChangeDetectorRef);
	private readonly destroy = inject(DestroyRef);
	private readonly navigation = inject(ViewNavigation);
	private readonly router = inject(Router);
	ids: string[] = [];
	options: Record<string, readonly { id: string; label: string }[]> = {};
	changes: readonly BulkFieldChange[] = [];
	statuses: BulkSaveStatus[] = [];
	private readonly errorMessage = localizedState('');
	private readonly directoryMessage = localizedState('');
	get error(): string {
		return this.errorMessage();
	}
	set error(value: string) {
		this.errorMessage.set(value);
	}
	get directoryError(): string {
		return this.directoryMessage();
	}
	set directoryError(value: string) {
		this.directoryMessage.set(value);
	}
	busy = false;
	loadingDirectories = true;
	completed = false;
	operationStarted = false;
	private alive = true;
	private contextEpoch = 0;
	private directoryEpoch = 0;
	private directoryLocale = this.messages.locale();
	constructor() {
		effect(() => {
			const locale = this.messages.locale();
			if (locale !== this.directoryLocale) {
				this.directoryLocale = locale;
				untracked(() => {
					if (this.alive && this.layoutContext) void this.loadDirectories();
				});
			}
		});
	}
	get layoutInputs(): Record<string, unknown> {
		return this.layoutComponent === DefaultBulkLayoutComponent
			? { context: this.layoutContext, options: this.options }
			: { context: this.layoutContext };
	}
	layoutContext!: BulkLayoutContext;

	ngOnInit(): void {
		this.ids = [
			...new Set(this.documents.map((document) => String(document['uid'] ?? '')).filter(Boolean)),
		];
		const documents = freezeClone(this.documents);
		this.layoutContext = this.contextFor(documents, []);
		this.destroy.onDestroy(this.navigation.register(async () => this.canLeave()));
		this.router.events.pipe(takeUntilDestroyed(this.destroy)).subscribe((event) => {
			if (event instanceof NavigationEnd && !this.busy) this.modal.hide();
		});
		const unload = (event: BeforeUnloadEvent) => {
			if (this.busy || this.hasChanges) {
				event.preventDefault();
				event.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', unload);
		this.destroy.onDestroy(() => window.removeEventListener('beforeunload', unload));
		this.loadDirectories();
	}
	ngOnDestroy(): void {
		this.alive = false;
	}
	get hasChanges(): boolean {
		return this.changes.some((change) => change.mode !== 'keep');
	}
	get canSave(): boolean {
		return (
			this.hasChanges &&
			!this.hasInvalidChanges &&
			!(
				(this.loadingDirectories || !!this.directoryError) &&
				this.changes.some(
					(change) =>
						['dc:nature', 'dc:subjects', 'dc:coverage'].includes(change.property) &&
						change.mode !== 'keep' &&
						change.mode !== 'remove',
				)
			)
		);
	}
	get hasInvalidChanges(): boolean {
		return this.changes.some((change) => {
			if (change.mode === 'keep' || change.mode === 'remove') return false;
			return Array.isArray(change.value)
				? !change.value.length
				: change.value === undefined || change.value === null || change.value === '';
		});
	}
	get failedIds(): string[] {
		return this.statuses.filter((status) => status.state === 'failed').map((status) => status.uid);
	}
	get unknownIds(): string[] {
		return this.statuses.filter((status) => status.state === 'unknown').map((status) => status.uid);
	}
	get summary(): string {
		return this.messages.format(
			'bulk.summary',
			{
				saved: this.statuses.filter((x) => x.state === 'saved').length,
				skipped: this.statuses.filter((x) => x.state === 'skipped').length,
				failed: this.failedIds.length,
				unknown: this.unknownIds.length,
			},
			'{saved, number} saved, {skipped, number} skipped, {failed, number} failed, {unknown, number} unknown.',
		);
	}
	statusError(status: BulkSaveStatus): string {
		if (status.localizedError)
			return this.messages.format(
				status.localizedError.key,
				status.localizedError.values,
				status.localizedError.fallback,
			);
		const error = status.validationError;
		if (error) return this.messages.format(error.messageKey, error.parameters, error.fallback);
		if (status.errorCode === 'write-unavailable')
			return this.messages.format(
				'bulk.writeUnavailable',
				{},
				'WriteProperties is no longer available.',
			);
		if (status.errorCode === 'save-failed')
			return this.messages.format('bulk.documentFailed', {}, 'Unable to save this document.');
		return status.error || '';
	}
	statusLabel(status: BulkSaveStatus): string {
		return this.messages.format('bulk.state.' + status.state, {}, status.state);
	}
	async save(): Promise<void> {
		if (this.operationStarted) {
			this.errorMessage.setMessage(
				this.unknownIds.length ? 'bulk.checkUnknown' : 'bulk.alreadyStarted',
				this.unknownIds.length
					? 'Check unknown documents before starting a new bulk update. Only known failures can be retried here.'
					: 'This bulk update has already started. Only known failures can be retried.',
			);
			return;
		}
		await this.run(this.ids, true);
	}
	async retryFailed(): Promise<void> {
		await this.run(this.failedIds, false);
	}
	close(): void {
		if (!this.busy) this.modal.hide();
	}
	canLeave(): boolean {
		return (
			!this.busy &&
			(!this.hasChanges ||
				window.confirm(this.messages.format('bulk.discard', {}, 'Discard the bulk edit changes?')))
		);
	}
	private async run(ids: readonly string[], initial: boolean): Promise<void> {
		if (this.busy || this.completed || !this.canSave || !this.isCurrentScope()) {
			this.errorMessage.setMessage(
				'bulk.scopeUnavailable',
				'The selected document scope changed or its choices are unavailable. Reopen the editor.',
			);
			return;
		}
		if (!ids.length) return;
		if (initial) this.operationStarted = true;
		this.busy = true;
		this.error = '';
		this.statuses = this.statuses.filter((status) => !ids.includes(status.uid));
		this.cdr.markForCheck();
		try {
			const statuses = await this.editor.save(
				ids,
				this.changes,
				() => this.alive && this.isCurrentScope(),
				(status) => {
					if (!this.alive) return;
					this.statuses = [...this.statuses, status];
					this.cdr.markForCheck();
				},
			);
			if (this.alive && statuses.length < ids.length)
				this.errorMessage.setMessage(
					'bulk.scopeChanged',
					'The selected document scope changed; remaining documents were not saved.',
				);
			if (
				this.alive &&
				statuses.length === ids.length &&
				!this.failedIds.length &&
				!this.statuses.some((status) => status.state === 'unknown')
			) {
				this.completed = true;
				this.changes = Object.freeze([]);
			}
		} catch (error) {
			this.errorMessage.setError(
				error,
				'bulk.saveFailed',
				'Unable to save the selected documents.',
			);
		} finally {
			if (this.alive) {
				this.busy = false;
				this.cdr.markForCheck();
			}
		}
	}
	private contextFor(
		documents: readonly Readonly<Record<string, unknown>>[],
		changes: readonly BulkFieldChange[],
	): BulkLayoutContext {
		const epoch = ++this.contextEpoch;
		return Object.freeze({
			documents,
			changes: freezeClone(changes),
			commit: (next: readonly BulkFieldChange[]) => {
				if (
					!this.alive ||
					this.busy ||
					this.completed ||
					this.operationStarted ||
					epoch !== this.contextEpoch ||
					!this.isCurrentScope()
				)
					return;
				this.changes = freezeClone(next);
				this.layoutContext = this.contextFor(documents, this.changes);
				this.cdr.markForCheck();
			},
		});
	}
	async loadDirectories(): Promise<void> {
		const epoch = ++this.directoryEpoch;
		this.loadingDirectories = true;
		this.directoryError = '';
		try {
			const choices = await loadBulkDirectoryChoices(this.gateway, this.messages);
			if (!this.alive || epoch !== this.directoryEpoch) return;
			this.options = choices;
			this.loadingDirectories = false;
			this.cdr.markForCheck();
		} catch {
			if (!this.alive || epoch !== this.directoryEpoch) return;
			this.directoryMessage.setMessage(
				'bulk.choicesFailed',
				'Directory choices could not be loaded. Retry before changing a directory field.',
			);
			this.loadingDirectories = false;
			this.cdr.markForCheck();
		}
	}
}

function freezeClone<T>(value: T): T {
	const clone = structuredClone(value) as T;
	const freeze = (item: unknown): unknown => {
		if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
		for (const child of Object.values(item as Record<string, unknown>)) freeze(child);
		return Object.freeze(item);
	};
	return freeze(clone) as T;
}
