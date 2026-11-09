import { localizedMessage } from 'app/helpers/localized-message';
import { WebUiMessagePipe, WebUiMessages } from '@maretha/webui-sdk';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { HttpClient, HttpHeaders } from '@angular/common/http';
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
import { forkJoin } from 'rxjs';
import { CloudAccount } from '../../modules/settings/models/cloud-account';
import { CloudServiceProvider } from '../../modules/settings/models/cloud-service-provider';

interface ApiEntries<T> {
	entries: T[];
}

@Component({
	selector: 'nx-user-cloud-services-page',
	imports: [WebUiDatePipe, WebUiIconComponent, WebUiMessagePipe],
	template: `<header>
			{{ 'userCloudServices.heading' | webuiMessage: 'Cloud Services Accounts' }}
		</header>
		<main>
			@if (loading()) {
				<p role="status">
					{{
						'app.components.user-cloud-services-page.loading-connected-accounts-04258f'
							| webuiMessage: 'Loading connected accounts…'
					}}
				</p>
			}
			@if (error()) {
				<p role="alert">{{ error() }}</p>
				<button type="button" (click)="refresh()">
					{{ 'app.components.user-cloud-services-page.retry-0e8815' | webuiMessage: 'Retry' }}
				</button>
			}
			@if (true) {
				<section class="card">
					<h2>
						{{ 'userCloudServices.connectedAccounts' | webuiMessage: 'Connected Accounts' }}
					</h2>
					<div class="accounts-table">
						<table>
							<thead>
								<tr>
									<th>{{ 'cloudTokens.serviceName' | webuiMessage: 'Service Name' }}</th>
									<th>{{ 'cloudTokens.nuxeoLogin' | webuiMessage: 'Nuxeo Login' }}</th>
									<th>{{ 'cloudTokens.serviceLogin' | webuiMessage: 'Service Login' }}</th>
									<th>{{ 'cloudTokens.creationDate' | webuiMessage: 'Creation Date' }}</th>
									<th>{{ 'cloudTokens.isShared' | webuiMessage: 'Shared' }}</th>
									<th [attr.aria-label]="'command.actions' | webuiMessage: 'Actions'"></th>
								</tr>
							</thead>
							<tbody>
								@for (account of accounts(); track account.serviceName + account.nuxeoLogin) {
									<tr>
										<td>{{ account.serviceName }}</td>
										<td>{{ account.nuxeoLogin }}</td>
										<td>{{ account.serviceLogin }}</td>
										<td>{{ account.creationDate | webuiDate: 'longDate' }}</td>
										<td>
											{{
												(account.isShared ? 'label.yes' : 'label.no')
													| webuiMessage: (account.isShared ? 'Yes' : 'No')
											}}
										</td>
										<td>
											<button
												type="button"
												class="icon-action"
												[disabled]="disconnectingKey() === account.serviceName + account.nuxeoLogin"
												(click)="disconnect(account)"
												[attr.aria-label]="'command.delete' | webuiMessage: 'Delete'"
											>
												<nx-webui-icon name="nuxeo:delete" />
											</button>
										</td>
									</tr>
								}
								@if (!accounts().length) {
									<tr>
										<td colspan="6" class="empty-state">
											{{ 'cloudTokens.emptyResult' | webuiMessage: 'No tokens defined.' }}
										</td>
									</tr>
								}
							</tbody>
						</table>
					</div>
				</section>
				@if (enabledProviders().length) {
					<section class="card">
						<h2>{{ 'userCloudServices.connectTo' | webuiMessage: 'Connect to' }}</h2>
						<div class="connect-actions">
							@for (provider of enabledProviders(); track provider.serviceName) {
								<button type="button" [disabled]="connecting()" (click)="connect(provider)">
									{{ provider.description || provider.serviceName }}
								</button>
							}
						</div>
					</section>
				}
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
			color: var(--nuxeo-text-default, #3a3a54);
		}
		header {
			height: 53px;
			flex-shrink: 0;
			padding: 16px 76px 16px 16px;
			background: var(--nuxeo-box);
			box-shadow: 0 2px 4px #0002;
			font-size: 13px;
		}
		main {
			flex: 1;
			min-height: 0;
			overflow: auto;
			padding: 17px 16px 16px;
		}
		.card {
			margin-bottom: 16px;
			padding: 16px;
			border: 0;
			border-radius: 0;
			background: var(--nuxeo-box, #fff);
			box-shadow: 0 3px 5px rgba(0, 0, 0, 0.04);
		}
		h2 {
			margin: 0 0 14px;
			padding: 0;
			font-size: 14px;
			font-weight: 700;
			line-height: 16.25px;
			letter-spacing: 0.24px;
		}
		.accounts-table {
			// Matches nuxeo-user-cloud-services and the stock table's minimum height.
			height: max(300px, calc(100vh - 368px));
			overflow: auto;
		}
		table {
			width: 100%;
			min-width: 900px;
			table-layout: fixed;
			border-collapse: collapse;
			font-size: 13px;
		}
		th,
		td {
			padding: 0 24px;
			border-bottom: 1px solid var(--nuxeo-border, #e3e3e3);
			text-align: start;
			vertical-align: middle;
		}
		th {
			height: 51px;
			background: var(--nuxeo-box, #fff);
			color: var(--nuxeo-text-secondary, #606978);
			font-size: 13px;
			font-weight: 600;
			text-transform: none;
			letter-spacing: 0.16px;
		}
		td {
			height: 52px;
		}
		td:last-child:not(.empty-state) {
			text-align: end;
		}
		td.empty-state {
			height: auto;
			padding: 1.5em 0.7em;
			border: 0;
			text-align: center;
			font-size: 1.1em;
			font-weight: 300;
			line-height: 20.02px;
			opacity: 0.8;
		}
		.icon-action {
			border: 0;
			background: transparent;
			color: inherit;
		}
		nx-webui-icon {
			display: inline-block;
			width: 20px;
			height: 20px;
		}
		.connect-actions {
			padding: 0;
		}
		.connect-actions button + button {
			margin-inline-start: 8px;
		}
		@media (max-width: 720px) {
			header {
				padding-inline-start: 56px;
			}
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserCloudServicesPageComponent {
	readonly context = input.required<PageContext>();
	private readonly messages = inject(WebUiMessages);
	private readonly http = inject(HttpClient);
	private readonly destroyRef = inject(DestroyRef);
	readonly loading = signal(true);
	private readonly errorMessage = localizedMessage();
	readonly error = this.errorMessage.text;
	readonly accounts = signal<readonly CloudAccount[]>([]);
	readonly enabledProviders = signal<readonly CloudServiceProvider[]>([]);
	readonly connecting = signal(false);
	readonly disconnectingKey = signal<string | null>(null);
	private popupTimer?: number;
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;

	constructor() {
		this.destroyRef.onDestroy(() => {
			if (this.popupTimer !== undefined) window.clearInterval(this.popupTimer);
		});
		this.refresh();
	}

	refresh(): void {
		this.loading.set(true);
		this.errorMessage.clear();
		const options = { headers: new HttpHeaders({ properties: '*' }) };
		forkJoin({
			providers: this.http.get<ApiEntries<CloudServiceProvider>>(
				`${this.apiUrl}/oauth2/provider/`,
				options,
			),
			accounts: this.http.get<ApiEntries<CloudAccount>>(
				`${this.apiUrl}/oauth2/token/provider`,
				options,
			),
		})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: ({ providers, accounts }) => {
					this.enabledProviders.set(providers.entries.filter((provider) => provider.isEnabled));
					this.accounts.set(accounts.entries);
					this.loading.set(false);
				},
				error: () => {
					this.errorMessage.set(
						'app.components.user-cloud-services-page.cloud-services-are-unavailable-or-you-do-not-have-permis',
						'Cloud services are unavailable, or you do not have permission to view them.',
					);
					this.loading.set(false);
				},
			});
	}

	connect(provider: CloudServiceProvider): void {
		if (!provider.authorizationURL || this.connecting()) return;
		this.connecting.set(true);
		const popup = window.open(
			provider.authorizationURL,
			'nuxeo-cloud-service',
			'height=650,width=1000',
		);
		this.popupTimer = window.setInterval(() => {
			if (popup && !popup.closed) return;
			window.clearInterval(this.popupTimer);
			this.popupTimer = undefined;
			this.connecting.set(false);
			this.refresh();
		}, 100);
	}

	disconnect(account: CloudAccount): void {
		const key = account.serviceName + account.nuxeoLogin;
		if (this.disconnectingKey()) return;
		if (
			!window.confirm(
				this.messages.format(
					'app.components.user-cloud-services-page.confirm',
					{ name: account.serviceName },
					'Disconnect {name}?',
				),
			)
		)
			return;
		this.disconnectingKey.set(key);
		this.http
			.delete(`${this.apiUrl}/oauth2/token/provider/${encodeURIComponent(account.serviceName)}`)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.disconnectingKey.set(null);
					this.refresh();
				},
				error: () => {
					this.disconnectingKey.set(null);
					this.errorMessage.set(
						'app.components.user-cloud-services-page.failed',
						'Could not disconnect {name}.',
						{ name: account.serviceName },
					);
				},
			});
	}
}
