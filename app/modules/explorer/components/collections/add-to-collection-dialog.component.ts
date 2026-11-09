import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	Input,
	inject,
	signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgSelectComponent } from '@ng-select/ng-select';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject, catchError, distinctUntilChanged, firstValueFrom, of, switchMap } from 'rxjs';
import {
	provideSuggestionScope,
	suggestionLimits,
	suggestionTerms,
	WebUiMessagePipe,
} from '@maretha/webui-sdk';
import { SuggestionLimitsDirective } from 'app/directives/suggestion-limits.directive';
import { environment } from 'environments/environment';
import { localizedText, messageText } from 'app/helpers/localized-message';
import { DocumentCollectionsService } from '../../helpers/document-collections.service';

/** Selection is a draft: membership changes only after the explicit Add action. */
@Component({
	host: { '(keydown.escape)': 'escape($event)' },
	selector: 'nx-add-to-collection-dialog',
	imports: [FormsModule, NgSelectComponent, WebUiMessagePipe, SuggestionLimitsDirective],
	// Stock nuxeo-add-to-collection-(documents-)button: nuxeo-selectivity min-chars="0".
	providers: [provideSuggestionScope('maretha.dialog.add-to-collection')],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<div class="modal-header">
			<h2 class="h5">
				{{ 'addToCollectionDocumentsButton.dialog.heading' | webuiMessage: 'Add to Collection' }}
			</h2>
		</div>
		<form (ngSubmit)="add()">
			<div class="modal-body">
				<label for="collection-choice">{{
					'addToCollectionDocumentsButton.collection' | webuiMessage: 'Collections *'
				}}</label>
				<ng-select
					labelForId="collection-choice"
					name="collection"
					[items]="suggestions()"
					bindLabel="title"
					[(ngModel)]="selected"
					[typeahead]="search"
					[nxSuggestionLimits]="limits()"
					[addTag]="newCollection"
					[multiple]="false"
					[disabled]="busy()"
					[loading]="loading()"
					[required]="true"
					[placeholder]="'documentCollections.search' | webuiMessage: 'Search collections'"
				/>
				@if (selected?.newCollection) {
					<label for="collection-description">{{
						'label.dublincore.description' | webuiMessage: 'Description'
					}}</label
					><textarea
						id="collection-description"
						name="description"
						[(ngModel)]="description"
						[disabled]="busy()"
					></textarea>
				}
				@if (error()) {
					<p role="alert">{{ error() }}</p>
				}
			</div>
			<div class="modal-footer">
				<button type="button" class="btn btn-link" [disabled]="busy()" (click)="close()">
					{{ 'command.cancel' | webuiMessage: 'Cancel' }}</button
				><button type="submit" class="btn btn-primary" [disabled]="busy() || !selected?.title">
					{{ 'command.add' | webuiMessage: 'Add' }}
				</button>
			</div>
		</form>`,
	styles: `
		label {
			display: block;
			margin-block: 12px 6px;
		}
		textarea {
			width: 100%;
			border: 0;
			border-bottom: 1px solid var(--nuxeo-border);
			background: transparent;
			color: inherit;
		}
		:host ::ng-deep .ng-select-container {
			border: 0;
			border-radius: 0;
			border-bottom: 1px solid var(--nuxeo-border);
		}
	`,
})
export class AddToCollectionDialogComponent {
	@Input() documents: any[] = [];
	readonly suggestions = signal<any[]>([]);
	readonly busy = signal(false);
	readonly loading = signal(false);
	readonly error = localizedText('');
	readonly search = new Subject<string>();
	selected: any = null;
	description = '';
	readonly newCollection = (title: string) => ({ title: title.trim(), newCollection: true });
	private readonly http = inject(HttpClient);
	private readonly collections = inject(DocumentCollectionsService);
	private readonly modal = inject(BsModalRef);
	readonly limits = suggestionLimits('document');
	constructor() {
		this.search
			.pipe(
				suggestionTerms(this.limits),
				distinctUntilChanged(),
				switchMap((term) => {
					if (term === null) return of({ entries: [] });
					this.loading.set(true);
					return this.http
						.get<{ entries: any[] }>(
							`${environment.nuxeoUrl}/api/v1/search/pp/user_collections/execute`,
							{
								params: new HttpParams()
									.set('user', '$currentUser')
									.set('searchTerm', term ? `%${term}%` : '%')
									.set('pageSize', 100),
								headers: {
									properties: 'dublincore',
									'X-NXRepository': this.documents[0]?.repository ?? 'default',
								},
							},
						)
						.pipe(
							catchError(() => {
								this.error.set(
									messageText('documentCollections.loadError', 'Collections could not be loaded.'),
								);
								return of({ entries: [] });
							}),
						);
				}),
				takeUntilDestroyed(),
			)
			.subscribe((result) => {
				this.suggestions.set(result.entries);
				this.loading.set(false);
			});
		inject(DestroyRef).onDestroy(() => this.search.complete());
		queueMicrotask(() => this.search.next(''));
	}
	escape(event: Event): void {
		event.preventDefault();
		event.stopPropagation();
		this.close();
	}
	close(): void {
		if (!this.busy()) this.modal.hide();
	}
	async add(): Promise<void> {
		if (this.busy() || !this.selected?.title || !this.documents.length) return;
		this.busy.set(true);
		this.error.set('');
		try {
			const collection = this.selected.newCollection
				? await firstValueFrom(
						this.collections.createCollection(this.selected.title, this.description),
					)
				: this.selected;
			await firstValueFrom(
				this.collections.addToCollection(
					this.documents.map((doc) => doc.uid),
					collection.uid,
				),
			);
			this.modal.hide();
		} catch {
			this.error.set(
				messageText(
					'documentCollections.addError',
					'The documents could not be added to the collection. Check permissions and retry.',
				),
			);
		} finally {
			this.busy.set(false);
		}
	}
}
