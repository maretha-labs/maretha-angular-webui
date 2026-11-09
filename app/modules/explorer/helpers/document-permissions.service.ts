import { WebUiMessages } from '@maretha/webui-sdk';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { ToastrService } from 'ngx-toastr';
import { of, Subject, tap } from 'rxjs';

@Injectable({
	providedIn: 'root',
})
export class DocumentPermissionsService {
	private readonly messages = inject(WebUiMessages);
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;

	permissionsUpdated$ = new Subject();
	userVisiblePermissions: string[] = [];

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly httpClient: HttpClient,
		private readonly tostrService: ToastrService,
	) {}

	// --------------------------------------------------------------------------------------------------
	getDocumentPermissions(documentUid: string) {
		if (!documentUid) return of();

		const url = `${this.apiUrl}/id/${documentUid}?fetch-acls=username,creator,extended&depth=children&time=${new Date().getTime()}`;

		const headers = {
			headers: new HttpHeaders({
				'enrichers-document': 'acls,permissions,userVisiblePermissions',
				properties: '*',
			}),
		};

		return this.httpClient
			.get(url, headers)
			.pipe(
				tap((x: any) => (this.userVisiblePermissions = x.contextParameters.userVisiblePermissions)),
			);
	}

	// --------------------------------------------------------------------------------------------------
	blockInheritance(documentUid: string) {
		const url = `${this.apiUrl}/automation/Document.BlockPermissionInheritance`;

		const payload = {
			context: {},
			params: {},
			input: documentUid,
		};

		return this.httpClient.post(url, payload).pipe(tap(() => this.permissionsUpdated$.next(0)));
	}

	// --------------------------------------------------------------------------------------------------
	unblockInheritance(documentUid: string) {
		const url = `${this.apiUrl}/automation/Document.UnblockPermissionInheritance`;

		const payload = {
			context: {},
			params: {},
			input: documentUid,
		};

		return this.httpClient.post(url, payload).pipe(tap(() => this.permissionsUpdated$.next(0)));
	}

	// --------------------------------------------------------------------------------------------------
	addPermission(
		documentUid: string,
		permission: string,
		email: string,
		from?: Date | undefined,
		until?: Date | undefined,
		notify = false,
		comment?: string,
	) {
		const url = `${this.apiUrl}/automation/Document.AddPermission`;

		const payload = {
			context: {},
			params: {
				begin: from?.toISOString(),
				end: until?.toISOString(),
				email,
				permission,
				notify,
				comment,
				username: null,
			},
			input: documentUid,
		};

		return this.httpClient.post(url, payload).pipe(
			tap(() => {
				this.permissionsUpdated$.next(0);

				if (notify)
					this.tostrService.info(
						this.messages.format(
							'app.services.permissions.link-sent',
							{ email },
							'A link to this document has been sent to {email}.',
						),
						this.messages.text('app.services.permissions.sent-title', 'Notification sent'),
						{ enableHtml: false },
					);
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	updatePermission(
		documentUid: string,
		permissionId: string,
		permission: string,
		email: string,
		username: string,
		from?: Date | undefined,
		until?: Date | undefined,
		notify = false,
		comment?: string,
	) {
		const url = `${this.apiUrl}/automation/Document.ReplacePermission`;

		// Trick to HOPEFULY have the server update the comment because there's an issue in Nuxeo
		// where comments aren't saved unless the permission's right or its timeframe changes
		if (from) from.setSeconds(new Date().getSeconds());

		// Trick to HOPEFULY have the server update the comment because there's an issue in Nuxeo
		// where comments aren't saved unless the permission's right or its timeframe changes
		if (until) until.setSeconds(new Date().getSeconds());

		const payload = {
			context: {},
			params: {
				id: permissionId,
				username,
				begin: from?.toISOString(),
				end: until?.toISOString(),
				permission,
				notify,
				comment,
			},
			input: documentUid,
		};

		return this.httpClient.post(url, payload).pipe(
			tap(() => {
				this.permissionsUpdated$.next(0);

				if (notify)
					this.tostrService.info(
						this.messages.format(
							'app.services.permissions.link-sent',
							{ email },
							'A link to this document has been sent to {email}.',
						),
						this.messages.text('app.services.permissions.sent-title', 'Notification sent'),
						{ enableHtml: false },
					);
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	removePermission(documentUid: string, permissionId: string) {
		const url = `${this.apiUrl}/automation/Document.RemovePermission`;

		const payload = {
			context: {},
			params: {
				acl: 'local',
				id: permissionId,
			},
			input: documentUid,
		};

		return this.httpClient.post(url, payload).pipe(tap(() => this.permissionsUpdated$.next(0)));
	}

	// --------------------------------------------------------------------------------------------------
	sendNotificationEmailForPermission(documentUid: string, permissionId: string, email: string) {
		const url = `${this.apiUrl}/automation/Document.SendNotificationEmailForPermission`;

		const payload = {
			context: {},
			params: {
				id: permissionId,
			},
			input: documentUid,
		};

		return this.httpClient.post(url, payload).pipe(
			tap(() => {
				this.tostrService.info(
					this.messages.format(
						'app.services.permissions.link-sent',
						{ email },
						'A link to this document has been sent to {email}.',
					),
					this.messages.text('app.services.permissions.sent-title', 'Notification sent'),
					{ enableHtml: false },
				);
			}),
		);
	}
}
