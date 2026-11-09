import { localizedText, messageText, errorMessage } from 'app/helpers/localized-message';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	inject,
	input,
	signal,
	computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GuardedView, PublishContext } from '@maretha/webui-sdk';
import { SelectionPublicationService } from '../../helpers/selection-publication.service';

@Component({
	selector: 'nx-selection-publication-page',
	imports: [FormsModule, WebUiMessagePipe],
	template: `<!-- Keep quoted ICU braces intact: Prettier misreads them as Angular interpolation endings. -->
		<!-- prettier-ignore -->
		<p>
			{{ 'publication.confirm' | webuiMessage:'{count, plural, one {Publish # selected document.} other {Publish # selected documents.}}': {count: (documents().length)} }}
		</p>
		<form (ngSubmit)="findDestinations()">
			<label
				>{{
					'app.modules.selection-publication-page.find-a-section-0d9ef0'
						| webuiMessage: 'Find a section'
				}}
				<input name="search" [(ngModel)]="search" [disabled]="busy() || completed().length > 0"
			/></label>
			<button type="submit" [disabled]="loading() || busy() || completed().length > 0">
				{{ 'app.modules.selection-publication-page.find-ccf607' | webuiMessage: 'Find' }}
			</button>
		</form>
		<label
			>{{
				'app.modules.selection-publication-page.destination-5a3dc5' | webuiMessage: 'Destination'
			}}
			<select [(ngModel)]="target" [disabled]="busy() || completed().length > 0">
				<option value="">
					{{
						'app.modules.selection-publication-page.choose-a-section-b665a6'
							| webuiMessage: 'Choose a section'
					}}
				</option>
				@for (row of destinations(); track row.uid) {
					<option [value]="row.uid">{{ row.title }} — {{ row.path }}</option>
				}
			</select></label
		>
		<label
			>{{ 'publication.rendition' | webuiMessage: 'Rendition' }}
			<select [(ngModel)]="rendition" [disabled]="busy() || completed().length > 0">
				<option value="">
					{{ 'app.modules.selection-publication-page.original-fb0e10' | webuiMessage: 'Original' }}
				</option>
				<option value="default">
					{{ 'publication.internal.renditon.default' | webuiMessage: 'Default rendition' }}
				</option>
			</select></label
		>
		<label
			><input
				type="checkbox"
				[(ngModel)]="override"
				[disabled]="busy() || completed().length > 0"
			/>

			{{
				'app.modules.selection-publication-page.replace-existing-publications-3619e0'
					| webuiMessage: 'Replace existing publications'
			}}</label
		>
		<button
			type="button"
			(click)="publish()"
			[disabled]="busy() || !target || completed().length === documents().length"
		>
			{{
				completed().length === documents().length
					? ('app.modules.selection-publication-page.published-4249bd' | webuiMessage: 'Published')
					: completed().length
						? ('app.modules.selection-publication-page.retry-remaining-9b99c4'
							| webuiMessage: 'Retry remaining')
						: ('app.modules.selection-publish.publish-selection-cca260'
							| webuiMessage: 'Publish selection')
			}}
		</button>
		@if (busy()) {
			<button type="button" (click)="stopRequested = true">
				{{
					'app.modules.selection-publication-page.stop-after-current-document-522eaa'
						| webuiMessage: 'Stop after current document'
				}}
			</button>
		}
		@if (loading()) {
			<p role="status">
				{{
					'app.modules.selection-publication-page.loading-destinations-baf212'
						| webuiMessage: 'Loading destinations…'
				}}
			</p>
		}
		@if (started()) {
			<!-- Keep quoted ICU braces intact: Prettier misreads them as Angular interpolation endings. -->
			<!-- prettier-ignore -->
			<p role="status">
				{{ 'publication.completed' | webuiMessage:'{completed, number} of {total, number} published{busy, select, true {…} other {.}}': {completed: (completed().length), total: (documents().length), busy: (busy())} }}
			</p>
		}
		@if (error()) {
			<p role="alert">{{ error() }}</p>
		} `,
	styles:
		':host {display:block;} label {display:block;margin:12px 0;} input,select,button {margin:4px;padding:8px;} select {max-width:100%;} [role=alert] {color:var(--nuxeo-warn-text);}',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectionPublicationPageComponent implements GuardedView {
	readonly context = input.required<PublishContext>();
	readonly busy = signal(false);
	readonly loading = signal(false);
	private readonly errorState = localizedText('');
	private readonly failureDetail = localizedText('');
	readonly error = computed(() =>
		[this.failureDetail(), this.errorState()].filter(Boolean).join(' '),
	);
	readonly started = signal(false);
	readonly completed = signal<string[]>([]);
	readonly destinations = signal<{ uid: string; title: string; path: string }[]>([]);
	search = '';
	target = '';
	rendition = '';
	override = false;
	stopRequested = false;
	private readonly service = inject(SelectionPublicationService);
	private readonly destroy = inject(DestroyRef);
	documents() {
		return this.context().selectedDocuments ?? [];
	}
	private repository() {
		return String(this.documents()[0]?.['repository'] ?? 'default');
	}
	async findDestinations(): Promise<void> {
		if (this.loading() || this.busy() || this.completed().length) return;
		this.loading.set(true);
		this.errorState.set('');
		this.failureDetail.set('');
		try {
			const rows = await this.service.destinations(this.repository(), this.search);
			if (!this.destroy.destroyed) {
				this.destinations.set(rows);
				this.target = '';
			}
		} catch {
			if (!this.destroy.destroyed)
				this.errorState.set(
					messageText(
						'app.state.destinations-could-not-be-loaded-retry-the-se-50a24a',
						'Destinations could not be loaded. Retry the search.',
					),
				);
		} finally {
			if (!this.destroy.destroyed) this.loading.set(false);
		}
	}
	async publish(): Promise<void> {
		if (
			this.busy() ||
			this.context().noEdit ||
			!this.target ||
			!this.destinations().some((row) => row.uid === this.target)
		)
			return;
		const repository = this.repository();
		const documents = this.documents();
		if (
			!documents.length ||
			documents.some((doc) => String(doc['repository'] ?? 'default') !== repository)
		)
			return;
		const target = this.target,
			override = this.override,
			rendition = this.rendition || undefined;
		this.started.set(true);
		this.busy.set(true);
		this.errorState.set('');
		this.failureDetail.set('');
		this.stopRequested = false;
		try {
			for (const document of documents) {
				const uid = String(document['uid']);
				if (this.completed().includes(uid)) continue;
				if (this.stopRequested || this.destroy.destroyed) break;
				await this.service.publish(uid, repository, target, override, rendition);
				if (this.destroy.destroyed) break;
				this.completed.update((ids) => [...ids, uid]);
			}
		} catch (error) {
			if (!this.destroy.destroyed)
				this.failureDetail.set(error instanceof Error ? errorMessage(error) : '');
			if (!this.destroy.destroyed)
				this.errorState.set(
					messageText(
						'publication.failedRetry',
						'Publication failed. Completed documents will not be retried. If the connection was interrupted, check the destination before retrying the current document.',
					),
				);
		} finally {
			if (!this.destroy.destroyed) this.busy.set(false);
		}
	}
	canDeactivate(): boolean {
		return !this.busy();
	}
}
