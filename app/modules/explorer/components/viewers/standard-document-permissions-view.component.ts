import { LocalizedUiError } from '@maretha/webui-sdk';
import { errorMessage } from 'app/helpers/localized-message';
import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { HttpClient, HttpParams } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	input,
	signal,
	untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import {
	DocumentViewContext,
	GuardedView,
	provideSuggestionScope,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { hasPermission } from 'app/helpers/document-permissions';
import { UsersAndGroupsPickerComponent } from 'app/modules/shared/components/users-and-groups-picker/users-and-groups-picker.component';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

export interface StandardPermissionAce extends Record<string, any> {
	id: string;
	aclName: string;
	permission: string;
	username: any;
	creator?: any;
	begin?: string;
	end?: string;
	externalUser?: boolean;
}

/** Keep the source ACL/status rules without altering the protected permissions view. */
export function standardPermissionAces(document: any): StandardPermissionAce[] {
	const aces: StandardPermissionAce[] = (document?.contextParameters?.acls ?? []).flatMap(
		(acl: any) =>
			(acl.aces ?? [])
				.filter((ace: any) => ace.granted && ['pending', 'effective'].includes(ace.status))
				.map((ace: any) => ({ ...ace, aclName: acl.name })),
	);
	return aces.sort((a, b) => {
		if (!a.begin && !b.begin) return 0;
		if (!a.begin) return -1;
		if (!b.begin) return 1;
		return new Date(a.begin).getTime() - new Date(b.begin).getTime();
	});
}

export function externalPermissionsFromBootstrap(source: string): boolean | null {
	// config.jsp emits this JSON assignment on one line. Parse its data, never execute it.
	const json = source.match(/Nuxeo\.UI\.config\s*=\s*(\{[^\r\n]*\})\s*;/)?.[1];
	if (!json) return null;
	try {
		return String(JSON.parse(json)?.permissions?.externalUsers ?? false).toLowerCase() === 'true';
	} catch {
		return null;
	}
}

@Component({
	selector: 'nx-standard-document-permissions-view',
	imports: [FormsModule, UsersAndGroupsPickerComponent, A11yModule, WebUiMessagePipe],
	providers: [provideSuggestionScope('maretha.document.standard-permissions')],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		@if (loading()) {
			<p role="status">
				{{
					'app.modules.standard-document-permissions-view.loading-permissions-cc511c'
						| webuiMessage: 'Loading permissions…'
				}}
			</p>
		}
		@if (error()) {
			<p role="alert">{{ error() }}</p>
		}
		@if (message()) {
			<p role="status">{{ message() }}</p>
		}
		@if (!loading() && !document()) {
			<button type="button" (click)="reload()">
				{{ 'app.modules.standard-document-permissions-view.retry-4b998d' | webuiMessage: 'Retry' }}
			</button>
		}
		@for (section of sections(); track section.id) {
			<section>
				<header>
					<h2>{{ section.title }}</h2>
					@if (canManage()) {
						@if (section.id === 'inherited') {
							<button
								type="button"
								[disabled]="busy()"
								(click)="toggleInheritance()"
								[attr.aria-label]="
									'permissions.inheritanceAction'
										| webuiMessage
											: '{action, select, unblock {Unblock permissions inherited from upper levels} other {Block permissions inherited from upper levels}}'
											: { action: inheritanceBlocked() ? 'unblock' : 'block' }
								"
							>
								{{
									inheritanceBlocked()
										? messages.text('documentPermissions.unblock', 'Unblock')
										: messages.text('documentPermissions.block', 'Block')
								}}
							</button>
						} @else {
							<button
								type="button"
								[disabled]="busy()"
								(click)="edit(null, section.id === 'external')"
							>
								{{ 'documentPermissions.new' | webuiMessage: 'New' }}
							</button>
						}
					}
				</header>
				@if (section.id === 'inherited' && section.rows.length) {
					<p class="explanation">
						{{
							messages.text(
								'documentPermissions.blockDescription',
								'Block permissions inherited from upper levels to control access on this document.'
							)
						}}
					</p>
				}
				@if (section.id === 'external') {
					<p class="explanation">
						{{
							messages.text(
								'documentPermissions.externalDescription',
								'Share this document with people outside your organization.'
							)
						}}
					</p>
				}
				@if (section.rows.length) {
					<div class="table-scroll">
						<table>
							<thead>
								<tr>
									<th>
										{{
											'app.modules.standard-document-permissions-view.user-group-2ba655'
												| webuiMessage: 'User / Group'
										}}
									</th>
									<th>
										{{ 'popupPermission.right' | webuiMessage: 'Right' }}
									</th>
									<th>
										{{
											'app.modules.standard-document-permissions-view.time-frame-060052'
												| webuiMessage: 'Time Frame'
										}}
									</th>
									<th>
										{{
											'app.modules.standard-document-permissions-view.granted-by-c4dd81'
												| webuiMessage: 'Granted by'
										}}
									</th>
									@if (canManage() && section.id !== 'inherited') {
										<th>
											<span class="visually-hidden">{{
												'app.modules.standard-document-permissions-view.actions-6f5083'
													| webuiMessage: 'Actions'
											}}</span>
										</th>
									}
								</tr>
							</thead>
							<tbody>
								@for (ace of section.rows; track ace.aclName + ':' + ace.id) {
									<tr>
										<td>{{ principalLabel(ace.username) }}</td>
										<td>{{ permissionLabel(ace.permission) }}</td>
										<td>{{ timeFrame(ace) }}</td>
										<td>{{ principalLabel(ace.creator) }}</td>
										@if (canManage() && section.id !== 'inherited') {
											<td>
												<button
													type="button"
													[disabled]="busy()"
													(click)="edit(ace, !!ace.externalUser)"
													[attr.aria-label]="
														'permissions.editFor'
															| webuiMessage
																: 'Edit permission for {name}'
																: { name: principalLabel(ace.username) }
													"
												>
													{{
														'app.modules.standard-document-permissions-view.edit-dfe788'
															| webuiMessage: 'Edit'
													}}
												</button>
												@if (ace.externalUser) {
													<button
														type="button"
														[disabled]="busy()"
														(click)="notifyExternal(ace)"
														[attr.aria-label]="
															'permissions.notifyNamed'
																| webuiMessage
																	: 'Notify {name}'
																	: { name: principalLabel(ace.username) }
														"
													>
														{{
															'app.modules.standard-document-permissions-view.notify-db0252'
																| webuiMessage: 'Notify'
														}}
													</button>
												}
												<button
													type="button"
													[disabled]="busy()"
													(click)="remove(ace)"
													[attr.aria-label]="
														'permissions.deleteFor'
															| webuiMessage
																: 'Delete permission for {name}'
																: { name: principalLabel(ace.username) }
													"
												>
													{{
														'app.modules.standard-document-permissions-view.delete-4f05e5'
															| webuiMessage: 'Delete'
													}}
												</button>
											</td>
										}
									</tr>
								}
							</tbody>
						</table>
					</div>
				} @else {
					<p>{{ section.empty }}</p>
				}
			</section>
		}
		@if (editorOpen()) {
			<div class="editor" role="dialog" aria-modal="true" aria-labelledby="permission-editor-title">
				<form
					(ngSubmit)="save()"
					cdkTrapFocus
					[cdkTrapFocusAutoCapture]="true"
					(keydown.escape)="closeEditor(); $event.stopPropagation()"
				>
					<h2 id="permission-editor-title">
						{{
							editing
								? messages.text('popupPermission.updatePermission', 'Update Permission')
								: external
									? messages.text(
											'popupPermission.shareWithExternalUser',
											'Share with an External User'
										)
									: messages.text('popupPermission.addPermission', 'Add a Permission')
						}}
					</h2>
					@if (editorError()) {
						<p role="alert">{{ editorError() }}</p>
					}
					@if (editing) {
						<p>{{ principalLabel(editing.username) }}</p>
					} @else if (external) {
						<label
							>{{
								'app.modules.standard-document-permissions-view.email-6432e4'
									| webuiMessage: 'Email'
							}}<input type="email" name="email" [(ngModel)]="email" required [disabled]="busy()"
						/></label>
					} @else {
						<nx-users-and-groups-picker
							name="users"
							[label]="messages.text('popupPermission.userGroup', 'User / Group')"
							bindValue="id"
							[multiple]="true"
							[required]="true"
							[(ngModel)]="users"
							[disabled]="busy()"
						/>
					}
					<label
						>{{ messages.text('popupPermission.right', 'Right')
						}}<select name="permission" [(ngModel)]="permission" required [disabled]="busy()">
							<option value="">
								{{
									'app.modules.standard-document-permissions-view.select-a-permission-367243'
										| webuiMessage: 'Select a permission'
								}}
							</option>
							@for (choice of visiblePermissions(); track choice.id) {
								<option [value]="choice.id">{{ choice.label }}</option>
							}
						</select></label
					>
					@if (!external) {
						<fieldset class="timeframe">
							<legend>{{ messages.text('popupPermission.timeFrame', 'Time Frame') }}</legend>
							<label class="check"
								><input
									type="radio"
									name="timeframe"
									[value]="true"
									[ngModel]="permanent"
									(ngModelChange)="setTimeFrame($event)"
									[disabled]="busy()"
								/>{{ messages.text('popupPermission.permanent', 'Permanent') }}</label
							>
							<label class="check"
								><input
									type="radio"
									name="timeframe"
									[value]="false"
									[ngModel]="permanent"
									(ngModelChange)="setTimeFrame($event)"
									[disabled]="busy()"
								/>{{ messages.text('popupPermission.dateBased', 'Date-based') }}</label
							>
						</fieldset>
					}
					<label
						>{{ messages.text('popupPermission.from', 'From')
						}}<input
							type="date"
							name="begin"
							[(ngModel)]="begin"
							[disabled]="busy() || (permanent && !external)"
					/></label>
					<label
						>{{ messages.text('popupPermission.to', 'To')
						}}<input
							type="date"
							name="end"
							[(ngModel)]="end"
							[required]="external"
							[disabled]="busy() || (permanent && !external)"
					/></label>
					@if (!external) {
						<label class="check"
							><input type="checkbox" name="notify" [(ngModel)]="notify" [disabled]="busy()" />{{
								messages.text('popupPermission.notify', 'Send an email to notify user')
							}}</label
						>
					}
					<label
						>{{ messages.text('popupPermission.notifyLabel', 'Notification email')
						}}<textarea
							name="comment"
							[placeholder]="
								messages.text(
									'popupPermission.notifyPlaceholder',
									'Hi! Could you comment on this document and...'
								)
							"
							[(ngModel)]="comment"
							[disabled]="busy() || !notify"
						></textarea>
					</label>
					<div class="buttons">
						<button type="button" [disabled]="busy()" (click)="closeEditor()">
							{{ messages.text('popupPermission.cancel', 'Cancel') }}
						</button>
						@if (!editing) {
							<button type="button" [disabled]="busy()" (click)="save(true)">
								{{ messages.text('popupPermission.createAndAdd', 'Create and Add Another') }}
							</button>
						}
						<button type="submit" [disabled]="busy()">
							{{
								busy()
									? ('sdk.layout.saving' | webuiMessage: 'Saving…')
									: editing
										? messages.text('popupPermission.update', 'Update')
										: messages.text('popupPermission.create', 'Create')
							}}
						</button>
					</div>
				</form>
			</div>
		}
	`,
	styles: `
		:host {
			display: block;
			padding: 24px;
			min-width: 0;
		}
		section {
			background: var(--nuxeo-box);
			padding: 16px;
			margin-bottom: 24px;
		}
		header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 16px;
		}
		h2 {
			font-size: 14px;
			font-weight: 700;
			margin: 0 0 16px;
		}
		.table-scroll {
			overflow: auto;
		}
		table {
			width: 100%;
			border-collapse: collapse;
		}
		th,
		td {
			text-align: start;
			padding: 12px 8px;
			border-bottom: 1px solid var(--nuxeo-border);
		}
		th {
			font-weight: 600;
		}
		button {
			color: var(--nuxeo-primary-color);
			border: 0;
			padding: 8px 12px;
			background: transparent;
		}
		button:disabled {
			opacity: 0.5;
		}
		button:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color);
		}
		.editor {
			position: fixed;
			inset: 0;
			z-index: 1100;
			background: #0005;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 24px;
		}
		form {
			background: var(--nuxeo-box);
			padding: 24px;
			width: min(500px, 100%);
			max-height: 90vh;
			overflow: auto;
			box-shadow: 0 4px 16px #0004;
		}
		label {
			display: flex;
			flex-direction: column;
			gap: 6px;
			margin: 12px 0;
		}
		.check {
			flex-direction: row;
			align-items: center;
		}
		input,
		select,
		textarea {
			padding: 8px;
			background: var(--nuxeo-box);
			color: inherit;
			border: 0;
			border-bottom: 1px solid var(--nuxeo-border);
			font: inherit;
		}
		section > p:not(.explanation) {
			text-align: center;
			padding: 20px 0;
		}
		.explanation {
			border-inline-start: 4px solid #e77762;
			padding: 8px;
			font-size: 13px;
		}
		.timeframe {
			display: flex;
			flex-wrap: wrap;
			gap: 24px;
		}
		legend {
			font-size: 13px;
			float: none;
			width: 100%;
			margin-bottom: 0;
		}
		input[type='date'] {
			max-width: 230px;
		}
		.buttons button[type='submit'] {
			background: var(--nuxeo-primary-color);
			color: #fff;
		}
		.buttons {
			display: flex;
			justify-content: flex-end;
			gap: 8px;
			margin-top: 16px;
		}
	`,
})
export class StandardDocumentPermissionsViewComponent implements GuardedView {
	private readonly uiStandardDocumentPermissionsViewComponentConfirmations =
		injectUiMessages(RuntimeUiMessages);

	readonly context = input.required<DocumentViewContext>();
	readonly messages = inject(WebUiMessages);
	readonly externalUsersEnabled = input<boolean>();
	private readonly confirmDialog = inject(ConfirmDialogService);
	private readonly browserDocument = inject(DOCUMENT);
	private readonly configuredExternalUsers = signal<boolean | null>(null);
	readonly showExternal = computed(() => {
		const override = this.externalUsersEnabled();
		if (override !== undefined) return override;
		const config = (this.browserDocument.defaultView as any)?.Nuxeo?.UI?.config;
		return config?.permissions?.externalUsers !== undefined
			? String(config.permissions.externalUsers).toLowerCase() === 'true'
			: (this.configuredExternalUsers() ?? false);
	});
	private readonly http = inject(HttpClient);
	private readonly destroy = inject(DestroyRef);
	private readonly api = `${environment.nuxeoUrl}/api/v1`;
	private generation = 0;
	private scope = '';
	private initialEditor = '';
	readonly document = signal<any>(null);
	readonly loading = signal(false);
	readonly busy = signal(false);
	readonly error = localizedText('');
	readonly message = localizedText('');
	readonly editorError = localizedText('');
	readonly editorOpen = signal(false);
	editing: StandardPermissionAce | null = null;
	external = false;
	users: string[] = [];
	email = '';
	permission = '';
	permanent = true;
	begin = '';
	end = '';
	notify = true;
	comment = '';
	readonly canManage = computed(() => this.mayManage(this.document()));
	readonly visiblePermissions = computed(() =>
		(this.document()?.contextParameters?.userVisiblePermissions ?? []).map((value: any) =>
			typeof value === 'string' ? { id: value, label: this.permissionLabel(value) } : value,
		),
	);
	readonly aces = computed(() => standardPermissionAces(this.document()));
	readonly inheritanceBlocked = computed(() => this.hasNoInheritedPermissions(this.document()));
	readonly sections = computed(() => [
		{
			id: 'local',
			title: this.messages.text(
				'documentPermissions.locallyDefined',
				'Permissions defined locally',
			),
			empty: this.messages.text(
				'documentPermissions.noLocalPermissions',
				'There are no local permissions.',
			),
			rows: this.aces().filter((ace) => ace.aclName !== 'inherited' && !ace.externalUser),
		},
		{
			id: 'inherited',
			title: this.messages.text(
				'documentPermissions.inherited',
				'Permissions inherited from upper levels',
			),
			empty: this.messages.text(
				'documentPermissions.noInheritedText',
				'No permissions are inherited.',
			),
			rows: this.aces().filter((ace) => ace.aclName === 'inherited'),
		},
		...(this.showExternal()
			? [
					{
						id: 'external',
						title: this.messages.text(
							'documentPermissions.external',
							'Permissions Assigned to External Users',
						),
						empty: this.messages.text(
							'documentPermissions.noExternalPermission',
							'No external permissions are defined on this document.',
						),
						rows: this.aces().filter((ace) => ace.aclName !== 'inherited' && ace.externalUser),
					},
				]
			: []),
	]);
	constructor() {
		this.http
			.get(`${environment.nuxeoUrl}/ui/config.jsp`, { responseType: 'text' })
			.pipe(takeUntilDestroyed())
			.subscribe({
				next: (source) =>
					this.configuredExternalUsers.set(externalPermissionsFromBootstrap(source)),
				error: () => undefined,
			});
		effect(() => {
			const scope = this.identity(this.context().document);
			if (scope === this.scope) return;
			this.scope = scope;
			this.editorOpen.set(false);
			this.busy.set(false);
			untracked(() => void this.load());
		});
		this.destroy.onDestroy(() => this.generation++);
	}
	private identity(document: any): string {
		return JSON.stringify([document?.repository ?? 'default', document?.uid ?? null]);
	}
	private headers(document = this.context().document): Record<string, string> {
		return {
			'X-NXRepository': String(document?.['repository'] ?? 'default'),
			'enrichers-document': 'acls,permissions,userVisiblePermissions',
			properties: '*',
		};
	}
	private read(document = this.context().document) {
		return this.http.get<any>(
			`${this.api}/repo/${encodeURIComponent(String(document?.['repository'] ?? 'default'))}/id/${encodeURIComponent(String(document?.['uid']))}`,
			{
				headers: this.headers(document),
				params: new HttpParams()
					.set('fetch-acls', 'username,creator,extended')
					.set('depth', 'children')
					.set('time', Date.now()),
			},
		);
	}
	private async load(): Promise<void> {
		const generation = ++this.generation;
		const requestedDocument = this.context().document;
		const scope = this.identity(requestedDocument);
		const current = () =>
			generation === this.generation &&
			scope === this.identity(this.context().document) &&
			!this.destroy.destroyed;
		this.loading.set(true);
		this.error.set('');
		this.document.set(null);
		try {
			if (!requestedDocument?.['uid']) return;
			const document = await firstValueFrom(this.read(requestedDocument));
			if (current() && this.identity(document) === scope) this.document.set(document);
		} catch {
			if (current())
				this.error.set(
					messageText(
						'app.state.permissions-could-not-be-loaded-de0c27',
						'Permissions could not be loaded.',
					),
				);
		} finally {
			if (current()) this.loading.set(false);
		}
	}
	reload(): void {
		if (!this.busy()) void this.load();
	}
	private mayManage(document: any): boolean {
		return (
			!this.context().noEdit && !document?.isVersion && hasPermission(document, 'WriteSecurity')
		);
	}
	edit(ace: StandardPermissionAce | null, external: boolean): void {
		if (
			!this.canManage() ||
			this.busy() ||
			ace?.aclName === 'inherited' ||
			(external && !this.showExternal())
		)
			return;
		this.editing = ace;
		this.external = external;
		this.users = [];
		this.email = '';
		this.permission =
			ace?.permission ??
			(this.visiblePermissions().some((choice: any) => choice.id === 'Read')
				? 'Read'
				: (this.visiblePermissions()[0]?.id ?? ''));
		this.begin = this.localDate(ace?.begin);
		this.end = this.localDate(ace?.end);
		this.permanent = !external && !this.begin && !this.end;
		this.notify = ace ? !!ace['notify'] : true;
		this.comment = ace?.['comment'] ?? '';
		this.initialEditor = this.editorState();
		this.editorError.set('');
		this.editorOpen.set(true);
	}
	setTimeFrame(permanent: boolean): void {
		if (this.busy() || this.external) return;
		this.permanent = permanent;
		if (permanent) this.begin = this.end = '';
	}
	private localDate(value?: string): string {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return [
			date.getFullYear(),
			String(date.getMonth() + 1).padStart(2, '0'),
			String(date.getDate()).padStart(2, '0'),
		].join('-');
	}
	private validExternalEmail(): boolean {
		const input = this.browserDocument.createElement('input');
		input.type = 'email';
		input.required = true;
		input.value = this.email.trim();
		return input.checkValidity();
	}
	private editorState(): string {
		return JSON.stringify([
			this.users,
			this.email,
			this.permission,
			this.permanent,
			this.begin,
			this.end,
			this.notify,
			this.comment,
		]);
	}
	closeEditor(): void {
		if (this.busy()) return;
		if (
			this.editorState() !== this.initialEditor &&
			!window.confirm(
				this.uiStandardDocumentPermissionsViewComponentConfirmations.text(
					'app.notices.discard-this-permission-change-2d35fc',
					'Discard this permission change?',
				),
			)
		)
			return;
		this.editorOpen.set(false);
	}
	async save(addAnother = false): Promise<void> {
		if (!this.editorOpen() || !this.canManage() || this.busy()) return;
		this.editorError.set('');
		const users = [
			...new Set(this.users.filter((user) => typeof user === 'string' && !!user.trim())),
		];
		if (!this.editing && (!this.external ? !users.length : !this.validExternalEmail())) {
			this.editorError.set(
				messageText(
					'app.state.select-a-user-or-group-or-enter-a-valid-exter-87778b',
					'Select a user or group, or enter a valid external email.',
				),
			);
			return;
		}
		if (!this.visiblePermissions().some((choice: any) => choice.id === this.permission)) {
			this.editorError.set(
				messageText('app.state.select-a-permission-d82270', 'Select a permission.'),
			);
			return;
		}
		const begin = !this.permanent || this.external ? this.date(this.begin, false) : null;
		const end = !this.permanent || this.external ? this.date(this.end, true) : null;
		if (
			((!this.permanent || this.external) && ((!!this.begin && !begin) || (!!this.end && !end))) ||
			(this.external && !end) ||
			(begin && end && begin > end)
		) {
			this.editorError.set(
				messageText(
					'app.state.enter-a-valid-permission-time-frame-b2ebc5',
					'Enter a valid permission time frame.',
				),
			);
			return;
		}
		const params = {
			acl: this.editing?.aclName ?? 'local',
			id: this.editing?.id,
			users: this.editing || this.external ? undefined : users,
			username: this.editing ? this.principalId(this.editing.username) : null,
			email: this.external && !this.editing ? this.email.trim() : null,
			permission: this.permission,
			begin,
			end,
			notify: this.notify,
			comment: this.comment,
		};
		const saved = await this.mutate(
			this.editing ? 'Document.ReplacePermission' : 'Document.AddPermission',
			params,
			true,
		);
		if (saved) {
			this.initialEditor = this.editorState();
			if (addAnother && this.canManage()) this.edit(null, this.external);
			else this.editorOpen.set(false);
		}
	}
	private date(value: string, end: boolean): string | null {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
		const date = new Date(value + (end ? 'T23:59:59.999' : 'T00:00:00.000'));
		return Number.isNaN(date.getTime()) || this.localDate(date.toISOString()) !== value
			? null
			: date.toISOString();
	}
	async remove(ace: StandardPermissionAce): Promise<void> {
		if (!this.canManage() || this.busy() || ace.aclName === 'inherited') return;
		const confirmed = await this.confirmDialog.confirm({
			titleKey: 'permissions.delete.title',
			title: 'Delete permission',
			messageKey: 'app.notices.delete-the-value-permission-for-value-ca37da',
			message: 'Delete the {value0} permission for {value1}?',
			messageValues: {
				value0: this.permissionLabel(ace.permission),
				value1: this.principalLabel(ace.username),
			},
			confirmKey: 'action.delete',
			confirm: 'Delete',
			destructive: true,
		});
		if (!confirmed || !this.canManage() || this.busy()) return;
		await this.mutate('Document.RemovePermission', { id: ace.id, acl: ace.aclName });
	}
	async toggleInheritance(): Promise<void> {
		if (!this.canManage() || this.busy()) return;
		await this.mutate(
			this.inheritanceBlocked()
				? 'Document.UnblockPermissionInheritance'
				: 'Document.BlockPermissionInheritance',
			{},
		);
	}
	private hasNoInheritedPermissions(document: any): boolean {
		return !standardPermissionAces(document).some((ace) => ace.aclName === 'inherited');
	}
	async notifyExternal(ace: StandardPermissionAce): Promise<void> {
		if (
			!this.canManage() ||
			this.busy() ||
			ace.aclName === 'inherited' ||
			!ace.externalUser ||
			!this.showExternal()
		)
			return;
		await this.mutate('Document.SendNotificationEmailForPermission', {
			id: ace.id,
			acl: ace.aclName,
		});
	}
	private async mutate(
		operation: string,
		params: Record<string, unknown>,
		editor = false,
	): Promise<boolean> {
		const generation = this.generation;
		const scope = this.scope;
		const requestedDocument = this.context().document;
		if (scope !== this.identity(requestedDocument) || scope !== this.identity(this.document()))
			return false;
		const headers = this.headers(requestedDocument);
		const current = () =>
			generation === this.generation &&
			scope === this.identity(this.context().document) &&
			!this.destroy.destroyed;
		this.busy.set(true);
		this.error.set('');
		this.message.set('');
		try {
			const fresh = await firstValueFrom(this.read(requestedDocument));
			if (!current()) return false;
			if (scope !== this.identity(fresh))
				throw new LocalizedUiError(
					'app.errors.the-document-has-changed-refresh-and-try-955ef4',
					'The document has changed. Refresh and try again.',
				);
			if (!this.mayManage(fresh))
				throw new LocalizedUiError(
					'app.errors.permission-to-manage-access-has-changed--8759b9',
					'Permission to manage access has changed.',
				);
			if (
				(operation === 'Document.BlockPermissionInheritance' &&
					this.hasNoInheritedPermissions(fresh)) ||
				(operation === 'Document.UnblockPermissionInheritance' &&
					!this.hasNoInheritedPermissions(fresh))
			) {
				this.document.set(fresh);
				return true;
			}
			if (
				params['permission'] &&
				!(fresh.contextParameters?.userVisiblePermissions ?? []).some(
					(value: any) => (typeof value === 'string' ? value : value.id) === params['permission'],
				)
			)
				throw new LocalizedUiError(
					'app.errors.the-selected-permission-is-no-longer-ava-ba220e',
					'The selected permission is no longer available.',
				);
			if (
				params['id'] &&
				!standardPermissionAces(fresh).some(
					(ace) => ace.id === params['id'] && ace.aclName === params['acl'],
				)
			)
				throw new LocalizedUiError(
					'app.errors.this-permission-has-changed-refresh-and--167160',
					'This permission has changed. Refresh and try again.',
				);
			await firstValueFrom(
				this.http.post(
					`${this.api}/automation/${operation}`,
					{ input: fresh.uid, params, context: {} },
					{ headers },
				),
			);
			if (!current()) return false;
			await this.load();
			if (
				scope !== this.scope ||
				scope !== this.identity(this.context().document) ||
				this.destroy.destroyed
			)
				return false;
			this.context().refreshDocument?.();
			this.message.set(
				operation === 'Document.SendNotificationEmailForPermission'
					? messageText('documentPermissions.permissionNotificationSent', 'Notification sent.')
					: messageText('app.state.permissions-updated-2674b9', 'Permissions updated.'),
			);
			return true;
		} catch (error) {
			if (
				scope === this.scope &&
				scope === this.identity(this.context().document) &&
				!this.destroy.destroyed
			)
				(editor ? this.editorError : this.error).set(
					error instanceof Error
						? errorMessage(error)
						: messageText(
								'permission.changeFailed',
								'The permission change failed. Check the selected user and your access.',
							),
				);
			return false;
		} finally {
			if (
				scope === this.scope &&
				scope === this.identity(this.context().document) &&
				!this.destroy.destroyed
			)
				this.busy.set(false);
		}
	}
	principalId(principal: any): string {
		if (principal?.['entity-type'] === 'group')
			return String(principal.groupname ?? principal.id ?? '');
		return typeof principal === 'string'
			? principal
			: String(principal?.id ?? principal?.groupname ?? '');
	}
	/** Stock nuxeo-document-acl-table `entityDisplay`: group label, else first/last name, else username. */
	principalLabel(principal: any): string {
		if (principal?.grouplabel) return String(principal.grouplabel);
		const first = String(principal?.properties?.firstName ?? '').trim();
		const last = String(principal?.properties?.lastName ?? '').trim();
		if (first || last) return [first, last].filter(Boolean).join(' ');
		return principal?.properties?.username || this.principalId(principal);
	}
	/** Stock `formatPermission`: `label.security.permission.<lowerCamel>`. */
	permissionLabel(permission: string): string {
		if (!permission) return '';
		const key = permission.charAt(0).toLowerCase() + permission.slice(1);
		return this.messages.text(
			`label.security.permission.${key}`,
			(
				{ Read: 'Read', ReadWrite: 'Edit', Everything: 'Manage everything' } as Record<
					string,
					string
				>
			)[permission] ?? permission,
		);
	}
	/** Stock `formatTimeFrame`: Since/From <D MMM YYYY> until <D MMM YYYY>, else Permanent. */
	timeFrame(ace: { begin?: string | null; end?: string | null }): string {
		const text = (key: string, fallback: string) =>
			this.messages.text(`documentAclTable.${key}`, fallback);
		const format = (value: string) => {
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return value;
			return `${date.getDate()} ${date.toLocaleString(this.messages.locale(), { month: 'short' })} ${date.getFullYear()}`;
		};
		const begin = ace.begin || null;
		const end = ace.end || null;
		const since = begin && new Date(begin).getTime() <= Date.now();
		if (begin && !end)
			return `${text(since ? 'since' : 'from', since ? 'Since' : 'From')} ${format(begin)}`;
		if (!begin && end) return `${text('until', 'Until')} ${format(end)}`;
		if (begin && end)
			return `${text(since ? 'since' : 'from', since ? 'Since' : 'From')} ${format(begin)} ${text('untilMiddle', 'until')} ${format(end)}`;
		return text('permanent', 'Permanent');
	}
	canDeactivate(): boolean {
		return (
			!this.busy() &&
			(!this.editorOpen() ||
				this.editorState() === this.initialEditor ||
				window.confirm(
					this.uiStandardDocumentPermissionsViewComponentConfirmations.text(
						'app.notices.discard-this-permission-change-2d35fc',
						'Discard this permission change?',
					),
				))
		);
	}
}
