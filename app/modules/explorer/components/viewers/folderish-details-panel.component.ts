import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';

import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	Input,
	OnChanges,
	inject,
	signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { WebUiMessages } from '@maretha/webui-sdk';
import { Subscription } from 'rxjs';
import { environment } from 'environments/environment';
import { MetadataPolicyService } from '../../helpers/metadata-policy.service';
import { DocumentCollectionsPanelComponent } from './document-collections-panel.component';
import { DocumentTagsPanelComponent } from './document-tags-panel.component';

/** Collapsible document-page details, used only by the unprotected folderish layouts. */
@Component({
	selector: 'nx-folderish-details-panel',
	standalone: true,
	imports: [
		WebUiDatePipe,
		RouterLink,
		DocumentCollectionsPanelComponent,
		DocumentTagsPanelComponent,
		WebUiMessagePipe,
	],
	template: `
		<details class="folderish-details">
			<summary>
				{{ 'app.modules.folderish-details-panel.details-00db34' | webuiMessage: 'Details' }}
			</summary>
			<div class="sections">
				<section
					[attr.aria-label]="
						'app.modules.folderish-details-panel.document-information-b3e56c'
							| webuiMessage: 'Document information'
					"
				>
					<h3>{{ 'documentPage.info' | webuiMessage: 'Info' }}</h3>
					<dl>
						@if (document?.contextParameters?.runningWorkflows?.length) {
							<dt>{{ 'documentInfo.process' | webuiMessage: 'Process' }}</dt>
							<dd>
								<span class="state">{{
									'documentInfo.process.running' | webuiMessage: 'Running'
								}}</span>
							</dd>
						}
						<dt>
							{{ 'app.modules.folderish-details-panel.state-5a36fe' | webuiMessage: 'State' }}
						</dt>
						<dd>
							<span class="state">{{ stateLabel }}</span>
						</dd>
						@if (canRead('dc:modified') && value('dc:modified')) {
							<dt>
								{{
									'app.modules.folderish-details-panel.last-modified-ee2ffc'
										| webuiMessage: 'Last Modified'
								}}
							</dt>
							<dd>{{ value('dc:modified') | webuiDate: 'longDate' }}</dd>
						}
						@if (canRead('dc:created') && value('dc:created')) {
							<dt>
								{{ 'app.modules.folderish-details-panel.created-a2d2ce' | webuiMessage: 'Created' }}
							</dt>
							<dd>{{ value('dc:created') | webuiDate: 'longDate' }}</dd>
						}
						@if (canRead('dc:creator') && value('dc:creator'); as creator) {
							<dt>{{ 'documentInfo.by' | webuiMessage: 'By' }}</dt>
							<dd>
								<a
									class="person"
									[routerLink]="['/page/user']"
									[queryParams]="{ id: userId(creator) }"
									>{{ userLabel(creator) }}</a
								>
							</dd>
						}
						@if (canRead('dc:contributors') && value('dc:contributors')?.length) {
							<dt>
								{{
									'app.modules.folderish-details-panel.contributors-d9470f'
										| webuiMessage: 'Contributors'
								}}
							</dt>
							<dd class="people">
								@for (person of value('dc:contributors'); track userId(person)) {
									<a
										class="person"
										[routerLink]="['/page/user']"
										[queryParams]="{ id: userId(person) }"
										>{{ userLabel(person) }}</a
									>
								}
							</dd>
						}
					</dl>
				</section>
				<section
					[attr.aria-label]="
						'app.modules.folderish-details-panel.document-properties-70da59'
							| webuiMessage: 'Document properties'
					"
				>
					<h3>{{ 'documentPage.metadata' | webuiMessage: 'Properties' }}</h3>
					@for (field of fields; track field.property) {
						@if (canRead(field.property) && (field.always || present(value(field.property)))) {
							<div class="property">
								<div class="property-label">{{ field.label }}</div>
								<div class="value">
									@if (field.property === 'dc:expired') {
										{{ value(field.property) | webuiDate: 'longDate' }}
									} @else {
										{{ display(value(field.property)) }}
									}
								</div>
							</div>
						}
					}
				</section>
				@if (
					canRead('collectionMember:collectionIds') &&
					document?.contextParameters?.collections?.length
				) {
					<section>
						<nx-document-collections-panel
							[document]="document"
							[noEdit]="noEdit || !canWrite('collectionMember:collectionIds')"
						/>
					</section>
				}
				@if (canRead('nxtag:tags') && document?.facets?.includes('NXTag')) {
					<section>
						<nx-document-tags-panel
							[document]="document"
							[noEdit]="noEdit || !canWrite('nxtag:tags')"
						/>
					</section>
				}
				<section
					[attr.aria-label]="
						'app.modules.folderish-details-panel.document-activity-39f931'
							| webuiMessage: 'Document activity'
					"
				>
					<h3>{{ 'documentPage.activity' | webuiMessage: 'Activity' }}</h3>
					@if (activityError()) {
						<p role="alert">
							{{
								'app.modules.folderish-details-panel.activity-could-not-be-loaded-027a60'
									| webuiMessage: 'Activity could not be loaded.'
							}}
							<button type="button" (click)="loadActivity()">
								{{ 'app.modules.folderish-details-panel.retry-eca88a' | webuiMessage: 'Retry' }}
							</button>
						</p>
					}
					@for (event of activities(); track $index) {
						<p class="event">
							<a
								class="person"
								[routerLink]="['/page/user']"
								[queryParams]="{ id: event.principalName }"
								>{{ event.principalName }}</a
							>
							{{ activityLabel(event) }} <time>{{ event.eventDate | webuiDate: 'medium' }}</time>
						</p>
					}
				</section>
			</div>
		</details>
	`,
	// Stock nuxeo-card (collapsible Details): 16px inside the page, 16px 16px 1px padding, the 14px
	// bold heading with its 14px gap, so the closed card is 51px.
	styles: [
		`
			:host {
				display: block;
				min-width: 0;
				margin: 16px 16px 16px;
			}
			.folderish-details {
				background: var(--nuxeo-box, #fff);
				color: var(--nuxeo-text-default, #334);
				padding: 16px 16px 1px;
				box-shadow: 0 3px 5px rgb(0 0 0 / 4%);
			}
			summary {
				cursor: pointer;
				font-weight: 700;
				font-size: 14px;
				line-height: 20px;
				margin-bottom: 14px;
				list-style: none;
				width: fit-content;
			}
			summary::-webkit-details-marker {
				display: none;
			}
			summary::after {
				content: '⌄';
				display: inline-block;
				margin-inline-start: 0.4rem;
			}
			details[open] > summary::after {
				transform: rotate(180deg);
			}
			summary:focus-visible {
				outline: 2px solid var(--nuxeo-primary-color, #3458db);
				outline-offset: 4px;
			}
			.sections {
				display: flex;
				flex-wrap: wrap;
				justify-content: space-between;
				gap: 2rem;
				padding: 2rem 1rem 1rem;
			}
			.sections > section {
				flex: 1 1 230px;
				min-width: 0;
				max-width: 320px;
				overflow-wrap: anywhere;
			}
			h3 {
				font-size: 14px;
				font-weight: 600;
				margin: 0 0 1.5rem;
			}
			dl {
				display: grid;
				grid-template-columns: max-content minmax(0, 1fr);
				gap: 0.7rem 0.8rem;
				margin: 0;
				font-size: 12px;
			}
			dt {
				font-weight: 400;
			}
			dd {
				margin: 0;
			}
			.person,
			.state {
				display: inline-block;
				border-radius: 1rem;
				padding: 0.1rem 0.5rem;
				background: var(--nuxeo-background, #f4f4f6);
				color: inherit;
				text-decoration: none;
			}
			.person:hover {
				text-decoration: underline;
			}
			.people {
				display: flex;
				flex-wrap: wrap;
				gap: 0.3rem;
			}
			.property {
				margin-bottom: 1rem;
				font-size: 13px;
			}
			.property-label {
				display: block;
				margin-bottom: 0.25rem;
			}
			.value {
				white-space: pre-wrap;
			}
			.event {
				font-size: 12px;
			}
			time {
				opacity: 0.7;
			}
			@media (max-width: 600px) {
				.sections {
					padding: 1.5rem 0 0.5rem;
					gap: 1.5rem;
				}
				.sections > section {
					max-width: none;
					flex-basis: 100%;
				}
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderishDetailsPanelComponent implements OnChanges {
	private readonly uiLabels = injectUiMessages(RuntimeUiMessages);
	@Input() document: any;
	@Input() noEdit = false;
	private readonly policy = inject(MetadataPolicyService);
	private readonly http = inject(HttpClient);
	private readonly destroyRef = inject(DestroyRef);
	private readonly messages = inject(WebUiMessages);
	private activityRequest?: Subscription;
	readonly activities = signal<readonly any[]>([]);
	readonly activityError = signal(false);
	get fields() {
		const basic = [
			{
				property: 'dc:title',
				label: this.uiLabels.text('app.labels.title-7e8cd2', 'Title'),
				always: true,
			},
			{
				property: 'dc:description',
				label: this.uiLabels.text('app.labels.description-526e00', 'Description'),
				always: this.document?.type === 'PictureBook',
			},
		];
		return this.document?.type === 'PictureBook'
			? basic
			: [
					...basic,
					{
						property: 'dc:nature',
						label: this.uiLabels.text('app.labels.nature-c71ce8', 'Nature'),
						always: false,
					},
					{
						property: 'dc:subjects',
						label: this.uiLabels.text('app.labels.subjects-1a7529', 'Subjects'),
						always: false,
					},
					{
						property: 'dc:coverage',
						label: this.uiLabels.text('app.labels.coverage-523487', 'Coverage'),
						always: false,
					},
					{
						property: 'dc:expired',
						label: this.uiLabels.text('app.labels.expiration-date-8ccc3f', 'Expiration date'),
						always: false,
					},
				];
	}
	get stateLabel(): string {
		const state = this.document?.state ?? '';
		return ['project', 'approved', 'obsolete', 'deleted'].includes(state)
			? this.label(`lifecycle.${state}`, state)
			: state;
	}
	ngOnChanges(): void {
		this.loadActivity();
	}
	canRead(property: string): boolean {
		return this.policy.canRead(this.document, property);
	}
	canWrite(property: string): boolean {
		return this.policy.canWrite(this.document, property);
	}
	value(property: string): any {
		return this.document?.properties?.[property];
	}
	present(value: any): boolean {
		return Array.isArray(value)
			? value.length > 0
			: value !== null && value !== undefined && value !== '';
	}
	userId(user: any): string {
		return typeof user === 'string' ? user : (user?.id ?? user?.properties?.username ?? '');
	}
	userLabel(user: any): string {
		return typeof user === 'string'
			? user
			: [user?.properties?.firstName, user?.properties?.lastName].filter(Boolean).join(' ') ||
					user?.properties?.email ||
					this.userId(user);
	}
	display(value: any): string {
		if (Array.isArray(value)) return value.map((item) => this.display(item)).join(', ');
		if (value && typeof value === 'object')
			return String(value.properties?.label ?? value.label ?? value.id ?? '');
		if (typeof value === 'number')
			return new Intl.NumberFormat(this.messages.locale()).format(value);
		if (typeof value === 'boolean')
			return this.messages.text(value ? 'common.yes' : 'common.no', value ? 'Yes' : 'No');
		return String(value ?? '');
	}
	activityLabel(event: any): string {
		const name = event.extended?.clientReason || event.eventId;
		return this.label(`activity.${name}`, name);
	}
	private label(key: string, fallback: string): string {
		return this.messages.text(key, fallback);
	}
	loadActivity(): void {
		this.activityRequest?.unsubscribe();
		this.activities.set([]);
		this.activityError.set(false);
		if (!this.document?.uid) return;
		if (Array.isArray(this.document.contextParameters?.audit)) {
			this.setActivities(this.document.contextParameters.audit);
			return;
		}
		this.activityRequest = this.http
			.get<any>(
				`${environment.nuxeoUrl}/api/v1/repo/${encodeURIComponent(this.document.repository ?? 'default')}/id/${encodeURIComponent(this.document.uid)}`,
				{ headers: new HttpHeaders({ 'enrichers-document': 'audit', properties: 'dublincore' }) },
			)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (result) => this.setActivities(result.contextParameters?.audit ?? []),
				error: () => this.activityError.set(true),
			});
	}
	private setActivities(events: readonly any[]): void {
		const result: any[] = [];
		for (const event of events) {
			const reason = event.extended?.clientReason || event.eventId;
			if (
				['view', 'download'].includes(reason) &&
				result.some(
					(previous) =>
						(previous.extended?.clientReason || previous.eventId) === reason &&
						previous.principalName === event.principalName &&
						Math.abs(Date.parse(previous.eventDate) - Date.parse(event.eventDate)) < 86_400_000,
				)
			)
				continue;
			result.push(event);
		}
		this.activities.set(result);
	}
}
