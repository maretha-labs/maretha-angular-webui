import { localizedMessage } from 'app/helpers/localized-message';
import { WebUiMessagePipe, WebUiMessages } from '@maretha/webui-sdk';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	inject,
	input,
	signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageContext, WebUiIconComponent } from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { catchError, forkJoin, of, throwError } from 'rxjs';

interface ApiEntries<T> {
	entries: T[];
}
interface AuthorizedClient {
	id: string;
	name: string;
}
interface ClientToken {
	clientId: string;
	creationDate: string;
	nuxeoLogin: string;
}
interface AuthorizedApplication {
	client: AuthorizedClient;
	token: ClientToken;
}

@Component({
	selector: 'nx-user-authorized-apps-page',
	imports: [WebUiDatePipe, WebUiIconComponent, WebUiMessagePipe],
	template: `<header>
			{{ 'authorizedApps.heading' | webuiMessage: 'Authorized Applications' }}
		</header>
		<main>
			@if (loading()) {
				<p role="status">
					{{
						'app.components.user-authorized-apps-page.loading-authorized-applications-fa1f3b'
							| webuiMessage: 'Loading authorized applications…'
					}}
				</p>
			}
			@if (error()) {
				<p role="alert">{{ error() }}</p>
				<button type="button" (click)="refresh()">
					{{ 'app.components.user-authorized-apps-page.retry-2c6120' | webuiMessage: 'Retry' }}
				</button>
			}
			@if (!loading() && !error()) {
				<section class="authorized-apps-card">
					<div class="table-space">
						<table>
							<colgroup>
								<col />
								<col />
								<col class="actions-column" />
							</colgroup>
							<thead>
								<tr>
									<th scope="col">
										<span class="column-label">{{
											'authorizedApps.name' | webuiMessage: 'Name'
										}}</span>
									</th>
									<th scope="col">
										<span class="column-label">
											{{ 'authorizedApps.authorizationDate' | webuiMessage: 'Authorization Date' }}
										</span>
									</th>
									<th
										scope="col"
										[attr.aria-label]="
											'app.components.user-authorized-apps-page.actions-880bd6'
												| webuiMessage: 'Actions'
										"
									></th>
								</tr>
							</thead>
							<tbody>
								@for (application of applications(); track application.client.id) {
									<tr>
										<td>{{ application.client.name }}</td>
										<td>{{ application.token.creationDate | webuiDate: 'longDate' }}</td>
										<td>
											<button
												type="button"
												class="icon-action"
												[disabled]="revokingId() === application.client.id"
												(click)="revoke(application)"
												[attr.aria-label]="'authorizedApps.revoke' | webuiMessage: 'Revoke'"
												[attr.title]="'authorizedApps.revoke' | webuiMessage: 'Revoke'"
											>
												<nx-webui-icon name="nuxeo:delete" />
											</button>
										</td>
									</tr>
								} @empty {
									<tr class="empty-row">
										<td colspan="3">
											{{
												'authorizedApps.emptyResult'
													| webuiMessage
														: 'You have not granted any application access to your Nuxeo account yet.'
											}}
										</td>
									</tr>
								}
							</tbody>
						</table>
					</div>
					@if (applications().length) {
						<p class="grant-notice">
							{{
								'authorizedApps.grantNotice'
									| webuiMessage: "You've granted these applications access to your Nuxeo account."
							}}
						</p>
					}
				</section>
			}
		</main>`,
	styles: `
		:host {
			display: flex;
			flex: 1;
			min-height: 0;
			flex-direction: column;
			font-size: 13px;
			line-height: 1.54;
			color: var(--nuxeo-text-default);
		}
		header {
			height: 53px;
			flex-shrink: 0;
			display: flex;
			align-items: center;
			padding-inline: 16px 64px;
			background: var(--nuxeo-box);
			box-shadow: 0 2px 4px #0002;
			font-size: inherit;
		}
		main {
			flex: 1;
			min-height: 0;
			overflow: auto;
			padding: 16px;
			/* Stock leaves a one-pixel gap for its empty tabs strip. */
			margin-block-start: 1px;
		}
		.authorized-apps-card {
			padding: 16px;
			margin-bottom: 16px;
			background: var(--nuxeo-box);
			box-shadow: 0 3px 5px rgba(0, 0, 0, 0.04);
		}
		.table-space {
			container-type: inline-size;
			height: max(300px, calc(100dvh - 222px));
			padding-inline: 2px;
			overflow: auto;
		}
		table {
			width: 100%;
			min-width: 450px;
			table-layout: fixed;
			border-collapse: separate;
			border-spacing: 0;
			font-size: inherit;
		}
		.actions-column {
			/* Stock uses 150px bases with flex-grow 100, 100, 1. */
			width: calc(150px + (100cqw - 450px) / 201);
		}
		th,
		td {
			height: 52px;
			padding: 0 24px;
			border-bottom: 1px solid var(--nuxeo-border, #ddd);
			text-align: start;
			vertical-align: middle;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		th {
			height: 51px;
			padding-block-end: 2px;
			font-size: 13px;
			font-weight: 600;
			letter-spacing: 0.16px;
			text-transform: none;
			color: var(--nuxeo-table-header-color, #606978);
			background: var(--nuxeo-table-header-background, var(--nuxeo-box));
		}
		.column-label {
			display: block;
			max-width: 120px;
			white-space: normal;
		}
		.grant-notice {
			margin: 0;
		}
		.empty-row td {
			padding: 1.5em 0.7em;
			border: 0;
			text-align: center;
			white-space: normal;
			font-size: 1.1em;
			font-weight: 300;
			line-height: 20.02px;
			opacity: 0.8;
		}
		.icon-action {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 40px;
			height: 40px;
			padding: 8px;
			border: 0;
			background: transparent;
			color: inherit;
		}
		.icon-action:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color);
			outline-offset: -2px;
		}
		.icon-action:disabled {
			opacity: 0.4;
		}
		nx-webui-icon {
			--webui-icon-size: 24px;
		}
		@media (max-width: 720px) {
			header {
				padding-inline-start: 48px;
			}
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAuthorizedAppsPageComponent {
	readonly context = input.required<PageContext>();
	private readonly messages = inject(WebUiMessages);
	private readonly http = inject(HttpClient);
	private readonly destroyRef = inject(DestroyRef);
	readonly loading = signal(true);
	private readonly errorMessage = localizedMessage();
	readonly error = this.errorMessage.text;
	readonly applications = signal<readonly AuthorizedApplication[]>([]);
	readonly revokingId = signal<string | null>(null);
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;

	constructor() {
		this.refresh();
	}

	refresh(): void {
		this.loading.set(true);
		this.errorMessage.clear();
		const options = { headers: new HttpHeaders({ properties: '*' }) };
		forkJoin({
			// Non-administrators cannot read the client registry (403); stock then shows the empty table.
			clients: this.http
				.get<ApiEntries<AuthorizedClient>>(`${this.apiUrl}/oauth2/client`, options)
				.pipe(
					catchError((error: unknown) =>
						error instanceof HttpErrorResponse && error.status === 403
							? of({ entries: [] } as ApiEntries<AuthorizedClient>)
							: throwError(() => error),
					),
				),
			tokens: this.http.get<ApiEntries<ClientToken>>(`${this.apiUrl}/oauth2/token/client`, options),
		})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: ({ clients, tokens }) => {
					const tokenByClient = new Map(tokens.entries.map((token) => [token.clientId, token]));
					this.applications.set(
						clients.entries.flatMap((client) => {
							const token = tokenByClient.get(client.id);
							return token ? [{ client, token }] : [];
						}),
					);
					this.loading.set(false);
				},
				error: () => {
					this.errorMessage.set(
						'app.components.user-authorized-apps-page.authorized-applications-are-unavailable-or-you-do-not-ha',
						'Authorized applications are unavailable, or you do not have permission to view them.',
					);
					this.loading.set(false);
				},
			});
	}

	revoke(application: AuthorizedApplication): void {
		if (this.revokingId()) return;
		if (
			!window.confirm(
				this.messages.format(
					'app.components.user-authorized-apps-page.confirm',
					{ name: application.client.name },
					'Revoke access for {name}?',
				),
			)
		)
			return;
		this.revokingId.set(application.client.id);
		this.http
			.delete(
				`${this.apiUrl}/oauth2/token/client/${encodeURIComponent(application.client.id)}/user/${encodeURIComponent(application.token.nuxeoLogin)}`,
			)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.revokingId.set(null);
					this.refresh();
				},
				error: () => {
					this.revokingId.set(null);
					this.errorMessage.set(
						'app.components.user-authorized-apps-page.failed',
						'Could not revoke {name}.',
						{ name: application.client.name },
					);
				},
			});
	}
}
