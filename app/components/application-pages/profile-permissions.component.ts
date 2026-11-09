import { HttpClient } from '@angular/common/http';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	DestroyRef,
	effect,
	inject,
	input,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { WebUiDatePipe, WebUiMessagePipe } from '@maretha/webui-sdk';
import { DocumentLinkPipe } from 'app/helpers/document-route';
import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import { environment } from 'environments/environment';

@Component({
	selector: 'nx-profile-permissions',
	imports: [RouterLink, DocumentLinkPipe, WebUiDatePipe, WebUiMessagePipe, UserTagComponent],
	template: `<section>
		<h2>{{ heading() }}</h2>
		<table>
			<thead>
				<tr>
					<th>{{ 'userGroupPermissions.on' | webuiMessage: 'On' }}</th>
					<th>{{ 'userGroupPermissions.right' | webuiMessage: 'Right' }}</th>
					<th>{{ 'userGroupPermissions.timeFrame' | webuiMessage: 'Time Frame' }}</th>
					<th>{{ 'userGroupPermissions.grantedBy' | webuiMessage: 'Granted by' }}</th>
				</tr>
			</thead>
			<tbody>
				@for (row of rows; track $index) {
					<tr>
						<td>
							<a [routerLink]="row | documentLink"
								>{{ row.title }}<small>{{ row.path }}</small></a
							>
						</td>
						<td>
							{{ 'label.security.permission.' + row.permission | webuiMessage: row.permission }}
						</td>
						<td>
							@if (!row.begin && !row.end) {
								{{ 'userGroupPermissions.permanent' | webuiMessage: 'Permanent' }}
							} @else {
								{{ row.begin | webuiDate }} – {{ row.end | webuiDate }}
							}
						</td>
						<td>
							@if (row.creator) {
								<nx-user-tag [user]="row.creator" />
							}
						</td>
					</tr>
				}
				@if (!rows.length && !loading && !error) {
					<tr>
						<td colspan="4">
							{{ 'userGroupPermissions.empty' | webuiMessage: 'No permissions.' }}
						</td>
					</tr>
				}
			</tbody>
		</table>
		@if (loading) {
			<p role="status">{{ 'command.loading' | webuiMessage: 'Loading…' }}</p>
		}
		@if (error) {
			<p role="alert">
				{{ 'permissions.loadError' | webuiMessage: 'Could not load permissions.' }}
				<button type="button" (click)="load(page)">
					{{ 'command.retry' | webuiMessage: 'Retry' }}
				</button>
			</p>
		}
		<nav [attr.aria-label]="heading()">
			<button type="button" [disabled]="loading || page === 0" (click)="load(0)">«</button
			><button type="button" [disabled]="loading || page === 0" (click)="load(page - 1)">‹</button
			><span>{{ page + 1 }} / {{ pages || 1 }}</span
			><button type="button" [disabled]="loading || page + 1 >= pages" (click)="load(page + 1)">
				›</button
			><button type="button" [disabled]="loading || page + 1 >= pages" (click)="load(pages - 1)">
				»
			</button>
		</nav>
	</section>`,
	styles: `
		:host {
			display: block;
		}
		section {
			padding: 16px;
			margin-bottom: 16px;
			background: var(--nuxeo-box);
			color: var(--nuxeo-text-default);
			overflow: auto;
		}
		h2 {
			font-size: 1rem;
			font-weight: 600;
			margin-bottom: 16px;
		}
		table {
			width: 100%;
			border: 1px solid var(--nuxeo-border);
			border-collapse: collapse;
		}
		th,
		td {
			padding: 12px;
			text-align: start;
			border-bottom: 1px solid var(--nuxeo-border);
		}
		th {
			font-weight: 400;
		}
		small {
			display: block;
		}
		a {
			color: inherit;
			text-decoration: none;
		}
		a small {
			color: var(--nuxeo-primary-color);
		}
		nav {
			display: flex;
			align-items: center;
			gap: 16px;
			padding-top: 8px;
		}
		button {
			color: inherit;
			background: transparent;
			border: 0;
			padding: 6px 12px;
		}
		button:disabled {
			opacity: 0.35;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePermissionsComponent {
	readonly entity = input.required<string>();
	readonly heading = input.required<string>();
	private readonly http = inject(HttpClient);
	private readonly cdr = inject(ChangeDetectorRef);
	private readonly destroyRef = inject(DestroyRef);
	rows: any[] = [];
	page = 0;
	pages = 1;
	loading = false;
	error = false;
	private request = 0;
	constructor() {
		effect(() => {
			this.entity();
			this.load(0);
		});
	}
	load(page: number): void {
		const request = ++this.request;
		this.page = page;
		this.loading = true;
		this.error = false;
		const entity = this.entity().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
		this.http
			.post<any>(
				`${environment.nuxeoUrl}/api/v1/automation/Repository.Query`,
				{
					params: {
						query: `SELECT * FROM Document WHERE ecm:mixinType != "HiddenInNavigation" AND ecm:isProxy = 0 AND ecm:isVersion = 0 AND ecm:isTrashed = 0 AND ecm:acl/*1/principal = "${entity}"`,
						page,
						pageSize: 25,
					},
				},
				{ headers: { 'enrichers-document': 'acls', 'X-NXContext-Category': 'acls' } },
			)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (response) => {
					if (request !== this.request) return;
					this.pages = response.numberOfPages || 1;
					this.rows = (response.entries ?? []).flatMap((doc: any) =>
						(doc.contextParameters?.acls ?? [])
							.filter((acl: any) => !acl.name.startsWith('inherited'))
							.flatMap((acl: any) =>
								(acl.aces ?? acl.ace ?? [])
									.filter((ace: any) => ace.username === this.entity())
									.map((ace: any) => ({ ...ace, uid: doc.uid, title: doc.title, path: doc.path })),
							),
					);
					this.loading = false;
					this.cdr.markForCheck();
				},
				error: () => {
					if (request !== this.request) return;
					this.loading = false;
					this.error = true;
					this.rows = [];
					this.cdr.markForCheck();
				},
			});
	}
}
