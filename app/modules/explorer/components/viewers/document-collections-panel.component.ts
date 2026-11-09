import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	Input,
	OnDestroy,
	inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, switchMap } from 'rxjs';
import { DocumentCollectionsService } from '../../helpers/document-collections.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { DocumentLinkPipe } from 'app/helpers/document-route';

@Component({
	selector: 'nx-document-collections-panel',
	standalone: true,
	imports: [RouterLink, DocumentLinkPipe, WebUiMessagePipe],
	template: `@if (memberships.length) {
		<section>
			<h5>
				{{
					'app.modules.document-collections-panel.collections-f8e852' | webuiMessage: 'Collections'
				}}
			</h5>
			@for (collection of memberships; track collection.uid) {
				<span class="badge bg-light border me-1"
					><a [routerLink]="collection | documentLink">{{ collection.title || collection.uid }}</a>
					@if (editable) {
						<button
							type="button"
							class="btn-close btn-close-sm ms-1"
							[disabled]="busy"
							[attr.aria-label]="
								'collection.removeNamed'
									| webuiMessage
										: 'Remove from {name}'
										: { name: collection.title || collection.uid }
							"
							(click)="remove(collection.uid)"
						></button>
					}
				</span>
			}
			@if (error) {
				<p class="text-danger small mb-0">{{ error }}</p>
			}
		</section>
	}`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentCollectionsPanelComponent implements OnDestroy {
	private current: any;
	private request?: Subscription;
	private readonly membershipUpdates: Subscription;
	private epoch = 0;
	@Input() noEdit = false;
	@Input() set document(value: any) {
		this.current = value;
		this.epoch++;
		this.request?.unsubscribe();
		this.busy = false;
		this.error = null;
	}
	busy = false;
	private readonly errorMessageState = localizedText(null);
	get error(): string | null {
		return this.errorMessageState();
	}
	set error(value: string | null | MessageText) {
		this.errorMessageState.set(value);
	}
	private readonly collections = inject(DocumentCollectionsService);
	private readonly documents = inject(DocumentsManagerService);
	private readonly cdr = inject(ChangeDetectorRef);
	constructor() {
		this.membershipUpdates = this.collections.documentsAddedToCollection$.subscribe((change) => {
			const uid = this.current?.uid;
			if (!uid || !change.documentUids.includes(uid)) return;
			if (
				change.repository !== undefined &&
				change.repository !== (this.current?.repository ?? 'default')
			)
				return;
			const epoch = this.epoch;
			const reload =
				change.repository === undefined
					? this.documents.reloadDocument(uid)
					: this.documents.reloadDocument(uid, change.repository);
			reload.subscribe({
				next: () => {
					if (epoch === this.epoch) this.cdr.markForCheck();
				},
			});
		});
	}
	get memberships(): any[] {
		return Array.isArray(this.current?.contextParameters?.collections)
			? this.current.contextParameters.collections
			: [];
	}
	get editable(): boolean {
		const permissions =
			this.current?.contextParameters?.permissions ?? this.current?.permissions ?? [];
		return (
			!this.noEdit &&
			Array.isArray(permissions) &&
			permissions.some((permission) =>
				['WriteProperties', 'Write', 'ReadWrite'].includes(permission),
			) &&
			!this.current?.isTrashed &&
			!this.current?.isUnderRetentionOrLegalHold &&
			!this.current?.isRecord &&
			!this.current?.retainUntil
		);
	}
	remove(collectionUid: string): void {
		if (!collectionUid || !this.editable || this.busy) return;
		const uid = this.current.uid,
			epoch = this.epoch;
		this.busy = true;
		this.error = null;
		this.request = this.collections
			.removeDocumentMembership(uid, collectionUid)
			.pipe(switchMap(() => this.documents.reloadDocument(uid)))
			.subscribe({
				error: () => {
					if (epoch === this.epoch) {
						this.busy = false;
						this.error = messageText(
							'app.state.collection-membership-could-not-be-updated-b86ce5',
							'Collection membership could not be updated.',
						);
						this.cdr.markForCheck();
					}
				},
				complete: () => {
					if (epoch === this.epoch) {
						this.busy = false;
						this.cdr.markForCheck();
					}
				},
			});
	}
	ngOnDestroy(): void {
		this.epoch++;
		this.request?.unsubscribe();
		this.membershipUpdates.unsubscribe();
	}
}
