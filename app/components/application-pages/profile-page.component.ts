import { ChangeDetectionStrategy, Component, DestroyRef, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BsModalService } from 'ngx-bootstrap/modal';
import { PageContext, WebUiIconComponent, WebUiMessagePipe } from '@maretha/webui-sdk';
import { AuthService } from 'app/helpers/auth.service';
import { ProfilePermissionsComponent } from './profile-permissions.component';
import { PasswordDialogComponent } from './password-dialog.component';

@Component({
	selector: 'nx-profile-page',
	imports: [RouterLink, WebUiIconComponent, WebUiMessagePipe, ProfilePermissionsComponent],
	template: `<header>{{ 'app.user.profile' | webuiMessage: 'Profile' }}</header>
		<main>
			@if (auth.userInfo(); as user) {
				<section>
					<div class="identity">
						<nx-webui-icon name="nuxeo:user" />
						<div>
							<strong>{{ user.id }}</strong>
							<div>{{ user.firstName }} {{ user.lastName }}</div>
						</div>
						<button type="button" class="btn btn-link" (click)="changePassword($event)">
							<nx-webui-icon name="nuxeo:lock" />{{
								'userProfile.password.change' | webuiMessage: 'Change Password'
							}}
						</button>
					</div>
					<div class="details">
						<div>
							{{ 'userManagement.email' | webuiMessage: 'Email' }}
							<div>{{ user.email }}</div>
						</div>
						<div>
							{{ 'userManagement.company' | webuiMessage: 'Company' }}
							<div>{{ user.company }}</div>
						</div>
					</div>
				</section>
				<section>
					<h2>{{ 'userManagement.groups' | webuiMessage: 'Groups' }}</h2>
					<table>
						<thead>
							<tr>
								<th>{{ 'userManagement.name' | webuiMessage: 'Name' }}</th>
								<th>{{ 'userManagement.identifier' | webuiMessage: 'Identifier' }}</th>
							</tr>
						</thead>
						<tbody>
							@for (group of user.groups; track group.id) {
								<tr>
									<td>
										<a
											class="principal-tag"
											[routerLink]="['/page/group']"
											[queryParams]="{ id: group.id }"
											><nx-webui-icon name="nuxeo:group" />{{ group.name || group.id }}</a
										>
									</td>
									<td>{{ group.id }}</td>
								</tr>
							}
						</tbody>
					</table>
				</section>
				<nx-profile-permissions
					[entity]="user.id"
					[heading]="'userManagement.localPermissions.heading' | webuiMessage: 'Local Permissions'"
				/>
				@for (group of user.groups; track group.id) {
					<nx-profile-permissions
						[entity]="group.id"
						[heading]="
							'userManagement.entityPermissions' | webuiMessage: '{0} permissions' : group.id
						"
					/>
				}
			}
		</main>`,
	styles: `
		:host {
			display: block;
			color: var(--nuxeo-text-default);
			height: 100%;
			overflow: auto;
		}
		header {
			padding: 16px;
			background: var(--nuxeo-box);
			border-bottom: 1px solid var(--nuxeo-border);
		}
		main {
			padding: 16px;
		}
		section {
			background: var(--nuxeo-box);
			padding: 16px;
			margin-bottom: 16px;
		}
		h2 {
			font-size: 1rem;
			font-weight: 600;
			margin: 0 0 16px;
		}
		.identity {
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.identity button {
			margin-inline-start: auto;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.details {
			display: grid;
			grid-template-columns: 1fr 1fr;
			padding: 32px 24px 24px;
		}
		table {
			width: 100%;
			border: 1px solid var(--nuxeo-border);
			border-collapse: collapse;
		}
		th,
		td {
			text-align: start;
			padding: 14px;
			border-bottom: 1px solid var(--nuxeo-border);
		}
		th {
			font-weight: 400;
		}
		nx-webui-icon {
			display: inline-block;
			width: 20px;
			height: 20px;
			vertical-align: middle;
		}
		.principal-tag {
			display: inline-flex;
			gap: 4px;
			align-items: center;
			border-radius: 16px;
			padding: 2px 8px;
			background: var(--nuxeo-tag-background, rgba(0, 0, 0, 0.05));
			color: var(--nuxeo-tag-text, inherit);
			font-size: 0.8rem;
			text-decoration: none;
		}
		@media (max-width: 720px) {
			header {
				padding-inline-start: 56px;
			}
			.details {
				grid-template-columns: 1fr;
				gap: 16px;
			}
			.identity {
				flex-wrap: wrap;
			}
			.identity button {
				margin-inline-start: 0;
			}
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePageComponent {
	readonly context = input.required<PageContext>();
	readonly auth = inject(AuthService);
	private readonly modal = inject(BsModalService);
	private readonly destroyRef = inject(DestroyRef);
	changePassword(event: Event): void {
		const trigger = event.currentTarget as HTMLElement;
		const ref = this.modal.show(PasswordDialogComponent, {
			class: 'modal-md',
			keyboard: true,
			ignoreBackdropClick: false,
			ariaLabelledBy: 'password-dialog-title',
		});
		ref.onHidden?.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => trigger.focus());
	}
}
