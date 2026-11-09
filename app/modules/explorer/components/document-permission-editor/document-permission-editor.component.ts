import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, Inject, OnInit, Optional, ChangeDetectionStrategy } from '@angular/core';
import {
	AbstractControl,
	UntypedFormBuilder,
	UntypedFormGroup,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { DocumentPermissionsService } from '../../helpers/document-permissions.service';
import { NgSelectComponent, NgOptionTemplateDirective } from '@ng-select/ng-select';
import { AutofocusDirective } from '../../../../directives/autofocus.directive';
import { BsDatepickerInputDirective, BsDatepickerDirective } from 'ngx-bootstrap/datepicker';
import { AutosizeModule } from 'ngx-autosize';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
	selector: 'nx-permission-editor',
	templateUrl: './document-permission-editor.component.html',
	styleUrls: ['./document-permission-editor.component.scss'],
	imports: [
		LocalizedSelectDirective,
		FormsModule,
		ReactiveFormsModule,
		NgSelectComponent,
		AutofocusDirective,
		NgOptionTemplateDirective,
		BsDatepickerInputDirective,
		BsDatepickerDirective,
		AutosizeModule,
		FontAwesomeModule,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentPermissionEditorComponent implements OnInit {
	private readonly uiLabels = injectUiMessages(RuntimeUiMessages);
	private emailRegex = new RegExp('^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,4}$');

	editorForm?: UntypedFormGroup | undefined;

	// --------------------------------------------------------------------------------------------------
	constructor(
		@Inject('document') public document: any,
		@Optional() @Inject('permission') public permission: any | null,
		@Optional() @Inject('shared') public shared: boolean | null,
		private readonly documentPermissionsService: DocumentPermissionsService,
		private readonly fb: UntypedFormBuilder,
		private readonly translateService: TranslateService,
	) {}
	get userVisiblePermissions(): any[] {
		return this.documentPermissionsService.userVisiblePermissions.map((x) => {
			const _actions: any = {};

			switch (x.toLowerCase()) {
				case 'read':
					return {
						key: x,
						label: this.uiLabels.format(`rights.${x}`, { value: 1 }, x),
						actions: {
							workspaces: [
								this.uiLabels.text('app.labels.consult-content-b1dac7', 'Consult content'),
								this.uiLabels.text('app.labels.comment-documents-22011f', 'Comment documents'),
								this.uiLabels.text('app.labels.tag-documents-9a3dfd', 'Tag documents'),
								this.uiLabels.text('app.labels.collect-content-8507cf', 'Collect content'),
								this.uiLabels.text('app.labels.follow-content-897c1c', 'Follow content'),
							],
							sections: [
								this.uiLabels.text('app.labels.consult-content-b1dac7', 'Consult content'),
								this.uiLabels.text('app.labels.comment-documents-22011f', 'Comment documents'),
								this.uiLabels.text('app.labels.tag-documents-9a3dfd', 'Tag documents'),
								this.uiLabels.text('app.labels.follow-content-897c1c', 'Follow content'),
							],
						},
					};

				case 'readwrite':
					return {
						key: x,
						label: this.uiLabels.format(`rights.${x}`, { value: 1 }, x),
						actions: {
							workspaces: [
								this.uiLabels.text('app.labels.create-documents-5d5686', 'Create documents'),
								this.uiLabels.text('app.labels.edit-documents-c06bd9', 'Edit documents'),
								this.uiLabels.text(
									'app.labels.add-remove-relations-36d72f',
									'Add / remove relations',
								),
								this.uiLabels.text('app.labels.start-a-workflow-6c6b2d', 'Start a workflow'),
								this.uiLabels.text('app.labels.delete-documents-7e7d03', 'Delete documents'),
								this.uiLabels.text('app.labels.read-actions-0b2cef', '+ Read actions'),
							],
							sections: [
								this.uiLabels.text('app.labels.consult-content-b1dac7', 'Consult content'),
								this.uiLabels.text('app.labels.comment-documents-22011f', 'Comment documents'),
								this.uiLabels.text('app.labels.tag-documents-9a3dfd', 'Tag documents'),
								this.uiLabels.text('app.labels.follow-content-897c1c', 'Follow content'),
								this.uiLabels.text('app.labels.read-actions-0b2cef', '+ Read actions'),
							],
						},
					};

				case 'everything':
					return {
						key: x,
						label: this.uiLabels.format(`rights.${x}`, { value: 1 }, x),
						actions: {
							workspaces: [
								this.uiLabels.text('app.labels.manage-permissions-2630ba', 'Manage permissions'),
								this.uiLabels.text(
									'app.labels.set-alerts-to-other-users-729faa',
									'Set alerts to other users',
								),
								this.uiLabels.text(
									'app.labels.apply-a-preset-look-on-documents-75f209',
									'Apply a preset look on documents',
								),
								this.uiLabels.text(
									'app.labels.manage-deleted-documents-0b23a2',
									'Manage deleted documents',
								),
								this.uiLabels.text(
									'app.labels.define-publication-targets-63dcd6',
									'Define publication targets',
								),
								this.uiLabels.text('app.labels.edit-actions-a06a00', '+ Edit actions'),
							],
							sections: [
								this.uiLabels.text('app.labels.manage-permissions-2630ba', 'Manage permissions'),
								this.uiLabels.text(
									'app.labels.set-alerts-to-other-users-729faa',
									'Set alerts to other users',
								),
								this.uiLabels.text(
									'app.labels.apply-a-preset-look-on-documents-75f209',
									'Apply a preset look on documents',
								),
								this.uiLabels.text(
									'app.labels.manage-deleted-documents-0b23a2',
									'Manage deleted documents',
								),
								this.uiLabels.text('app.labels.edit-actions-a06a00', '+ Edit actions'),
							],
						},
					};

				default:
					return {
						key: x,
						label: this.uiLabels.format(`rights.${x}`, { value: 1 }, x),
						actions: {
							workspaces: [],
							sections: [],
						},
					};
			}
		});
	}

	// --------------------------------------------------------------------------------------------------
	saveChanges() {
		const permission = this.editorForm?.getRawValue();

		const email = this.permission?.username?.label;
		const message = permission.notification.message || undefined;
		const from = permission.timeframe.permanent ? undefined : permission.timeframe.from;
		const until = permission.timeframe.permanent ? undefined : permission.timeframe.until;

		if (this.permission)
			this.documentPermissionsService
				.updatePermission(
					this.document.uid,
					this.permission!.id,
					permission.permission,
					email,
					this.permission!.username.id,
					from,
					until,
					this.shared || permission.notification.sendNotification,
					message,
				)
				.subscribe();
		else
			this.documentPermissionsService
				.addPermission(
					this.document.uid,
					permission.permission,
					email,
					from,
					until,
					this.shared || permission.notification.sendNotification,
					message,
				)
				.subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	isControlInvalid(controlName: string | string[]): boolean {
		return (
			(this.editorForm!.get(controlName)?.touched && this.editorForm!.get(controlName)?.invalid) ||
			false
		);
	}

	// --------------------------------------------------------------------------------------------------
	private setupForm() {
		this.editorForm = this.fb.group({
			username: [
				{
					value: this.permission?.username?.label,
					disabled: this.permission,
				},
				[this.usernameValidator.bind(this)],
			],
			permission: [this.permission?.permission, Validators.required],
			timeframe: this.fb.group(
				{
					permanent: [this.shared || this.permission?.begin || this.permission?.end ? false : true],
					from: [this.permission?.begin ? new Date(this.permission?.begin) : null],
					until: [this.permission?.end ? new Date(this.permission?.end) : null],
				},
				{ validators: [this.effectivenessTimeframeValidator.bind(this)] },
			),
			notification: this.fb.group(
				{
					sendNotification: [this.permission?.notify],
					message: [this.permission?.comment],
				},
				{ validators: [this.notificationMessageValidator.bind(this)] },
			),
		});
	}

	// --------------------------------------------------------------------------------------------------
	private usernameValidator(control: AbstractControl): Record<string, boolean> | null {
		const username = control.value;

		return !username || (this.shared && !this.emailRegex.test(username))
			? { required: true }
			: null;
	}

	// --------------------------------------------------------------------------------------------------
	private notificationMessageValidator(group: AbstractControl): Record<string, boolean> | null {
		const sendNotification = group.get('sendNotification')!.value;
		const message = group.get('message')!.value;

		return sendNotification && !message ? { required: true } : null;
	}

	// --------------------------------------------------------------------------------------------------
	private effectivenessTimeframeValidator(group: AbstractControl): Record<string, boolean> | null {
		const permanent = group.get('permanent')?.value;
		const from = new Date(group.get('from')?.value || undefined);
		const until = new Date(group.get('until')?.value || undefined);

		if (permanent) return null;

		if (!this.isValidDate(from) && !this.isValidDate(until)) return { required: true };

		if (group.parent?.get('share')?.value && !this.isValidDate(until)) return { required: true };

		if (this.isValidDate(from) && this.isValidDate(until) && from.getTime() > until.getTime())
			return { invalidRange: true };

		return null;
	}

	// --------------------------------------------------------------------------------------------------
	private isValidDate = (date: any) =>
		date && Object.prototype.toString.call(date) === '[object Date]' && !isNaN(date);

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		this.setupForm();
	}
}
