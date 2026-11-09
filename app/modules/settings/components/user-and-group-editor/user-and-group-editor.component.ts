import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { provideSuggestionScope, WebUiIconComponent, WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	Component,
	Input,
	Output,
	EventEmitter,
	Optional,
	OnInit,
	OnDestroy,
	ChangeDetectorRef,
	ChangeDetectionStrategy,
	inject,
} from '@angular/core';
import {
	FormGroup,
	FormBuilder,
	Validators,
	AbstractControl,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { User } from 'app/models/user';
import { UserGroup } from 'app/models/user-group';
import { UserInfo } from 'app/models/user-info';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Observable, Subject, takeUntil } from 'rxjs';
import { ManagedUserGroup, UsersAndGroupsService } from '../../helpers/users-and-groups.service';
import { AutofocusDirective } from '../../../../directives/autofocus.directive';
import { UsersAndGroupsPickerComponent } from '../../../shared/components/users-and-groups-picker/users-and-groups-picker.component';
import { UserInvitationService } from '../../helpers/user-invitation.service';
import { AuthService } from 'app/helpers/auth.service';
import { ToastrService } from 'ngx-toastr';

export type UserEditorResult = (User | UserGroup) & { invited?: boolean };

@Component({
	selector: 'nx-user-and-group-editor',
	host: { '[class.embedded]': 'embedded' },
	templateUrl: './user-and-group-editor.component.html',
	styleUrls: ['./user-and-group-editor.component.scss'],
	imports: [
		FormsModule,
		ReactiveFormsModule,
		AutofocusDirective,
		UsersAndGroupsPickerComponent,
		WebUiMessagePipe,
		WebUiIconComponent,
	],
	providers: [provideSuggestionScope('maretha.admin.users')],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAndGroupEditorComponent implements OnInit, OnDestroy {
	@Input() add = true;
	@Input() embedded = false;
	readonly userFields = [
		{ name: 'id', key: 'userManagement.username', label: 'Username', required: true },
		{ name: 'firstName', key: 'userManagement.firstName', label: 'First Name', required: false },
		{ name: 'lastName', key: 'userManagement.lastName', label: 'Last Name', required: false },
		{ name: 'company', key: 'userManagement.company', label: 'Company', required: false },
		{ name: 'email', key: 'userManagement.email', label: 'Email', required: true },
	];
	readonly groupFields = [
		{ name: 'id', key: 'userManagement.identifier', label: 'Identifier', required: true },
		{ name: 'name', key: 'userManagement.label', label: 'Label', required: false },
		{
			name: 'description',
			key: 'userManagement.description',
			label: 'Description',
			required: false,
		},
	];
	@Output() closed = new EventEmitter<void>();
	@Output() saved = new EventEmitter<UserEditorResult>();
	@Input() userOrGroup?: User | UserGroup;
	@Input() isUserGroup = false;
	editorForm?: FormGroup;
	save$ = new Subject<UserEditorResult>();
	saving = false;
	loading = false;
	private readonly errorMessageState = localizedText();
	get error(): string {
		return this.errorMessageState();
	}
	set error(value: string | MessageText) {
		this.errorMessageState.set(value);
	}
	private readonly statusMessageState = localizedText();
	get status(): string {
		return this.statusMessageState();
	}
	set status(value: string | MessageText) {
		this.statusMessageState.set(value);
	}
	private readonly invitations = inject(UserInvitationService);
	private readonly auth = inject(AuthService);
	private readonly toastr = inject(ToastrService);
	private savedAndClosing = false;
	private readonly destroy$ = new Subject<void>();

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly fb: FormBuilder,
		@Optional() private readonly bsModalRef: BsModalRef | null,
		private usersAndGroupServicesService: UsersAndGroupsService,
		private readonly cdr: ChangeDetectorRef,
	) {}

	// --------------------------------------------------------------------------------------------------
	close() {
		if (!this.saving) {
			if (this.embedded) this.closed.emit();
			else this.bsModalRef?.hide();
		}
	}
	get invitationMode(): boolean {
		return (
			this.add && !this.isUserGroup && !this.editorForm?.get(['password', 'changePassword'])?.value
		);
	}

	// --------------------------------------------------------------------------------------------------
	saveChanges(createAnother = false) {
		if (this.saving || this.savedAndClosing || !this.editorForm) return;
		this.editorForm.markAllAsTouched();
		if (this.editorForm.invalid) return;
		const formValues = this.editorForm.getRawValue();
		const accountId = this.add ? formValues.id : this.userOrGroup!.id;
		const inviting = this.invitationMode;
		const selectedIds = (values: any[] | null) => [
			...new Set(
				(values ?? [])
					.map((value) => (typeof value === 'string' ? value : value?.id))
					.filter((id): id is string => typeof id === 'string' && !!id),
			),
		];
		let observable: Observable<any>;
		const memberIds = selectedIds(this.isUserGroup ? formValues.users : formValues.groups);
		if (
			!this.isUserGroup &&
			memberIds.includes('administrators') &&
			!this.auth.userInfo()?.isAdministrator &&
			(this.add ||
				!(this.userOrGroup as User)?.groups?.some((group) => group.id === 'administrators'))
		) {
			this.error = messageText(
				'app.state.only-an-administrator-can-add-a-user-to-the-a-ee74ba',
				'Only an administrator can add a user to the administrators group.',
			);
			return;
		}
		if (this.isUserGroup) {
			const payload: ManagedUserGroup = {
				id: accountId,
				name: formValues.name || accountId,
				description: formValues.description,
				users: memberIds.map((id) => ({ id, name: id, groups: [] })),
				memberGroups: selectedIds(formValues.memberGroups),
			};
			observable = this.usersAndGroupServicesService[this.add ? 'addGroup' : 'updateGroup'](
				payload,
				true,
			);
		} else {
			const payload: UserInfo = {
				...(!this.add ? (this.userOrGroup as UserInfo) : {}),
				id: accountId,
				firstName: formValues.firstName,
				lastName: formValues.lastName,
				company: formValues.company,
				email: formValues.email,
				groups: memberIds.map((id) => ({ id, name: id, users: [] })),
			};
			observable = inviting
				? this.invitations.invite(payload)
				: this.usersAndGroupServicesService[this.add ? 'addUser' : 'updateUser'](
						payload,
						formValues.password.changePassword ? formValues.password.newPassword : undefined,
						true,
					);
		}
		this.saving = true;
		this.error = '';
		this.status = '';
		this.editorForm.disable({ emitEvent: false });
		this.cdr.markForCheck();
		observable.pipe(takeUntil(this.destroy$)).subscribe({
			next: (responseValue) => {
				const response = responseValue ?? {};
				const properties = response.properties ?? {};
				const entity: User | ManagedUserGroup = this.isUserGroup
					? {
							id: response.groupname || response.id || accountId,
							name: response.grouplabel || properties.grouplabel || formValues.name || accountId,
							description: properties.description ?? formValues.description,
							memberGroups: response.memberGroups ?? selectedIds(formValues.memberGroups),
							users: (response.memberUsers ?? memberIds).map((id: string) => ({
								id,
								name: id,
								groups: [],
							})),
						}
					: {
							id: response.id || accountId,
							isAdministrator: response.isAdministrator,
							isAnonymous: response.isAnonymous,
							firstName: properties.firstName ?? formValues.firstName,
							lastName: properties.lastName ?? formValues.lastName,
							name:
								[
									properties.firstName ?? formValues.firstName,
									properties.lastName ?? formValues.lastName,
								]
									.filter(Boolean)
									.join(' ') ||
								response.id ||
								accountId,
							email: properties.email ?? formValues.email,
							company: properties.company ?? formValues.company,
							groups: (properties.groups ?? memberIds).map((id: string) => ({
								id,
								name: response.extendedGroups?.find((group: any) => group.name === id)?.label || id,
								users: [],
							})),
						};
				if (this.add) {
					this.status = inviting
						? messageText(
								'app.state.invitation-queued-for-value-5bdcfd',
								'Invitation queued for {value0}.',
								{ value0: formValues.email },
							)
						: messageText(
								'app.settingsShared.kind-select-group-group-id-created-other-user-i-225abd',
								'{kind, select, group {Group {id} created.} other {User {id} created.}}',
								{ kind: this.isUserGroup ? 'group' : 'user', id: accountId },
							);
					this.toastr.success(this.status, undefined, { enableHtml: false });
				}
				if (this.add && createAnother) {
					this.userOrGroup = undefined;
					this.setupForm();
					this.cdr.markForCheck();
				} else this.savedAndClosing = true;
				this.saving = false;
				this.save$.next(inviting ? { ...entity, invited: true } : entity);
				this.saved.emit(inviting ? { ...entity, invited: true } : entity);
				if (this.savedAndClosing) this.close();
			},
			error: (error) => {
				this.saving = false;
				this.editorForm!.enable({ emitEvent: false });
				if (!this.add) this.editorForm!.get('id')!.disable({ emitEvent: false });
				let message = error?.error;
				if (typeof message === 'string') {
					try {
						message = JSON.parse(message);
					} catch {
						/* Keep the server's plain-text message. */
					}
				}
				this.error =
					(typeof message === 'string' ? message : message?.message) ||
					(inviting
						? messageText(
								'app.settingsShared.unable-to-send-the-invitation-check-the-values-a-3bf881',
								'Unable to send the invitation. Check the values and retry.',
							)
						: messageText(
								'app.settingsShared.kind-select-group-unable-to-save-the-group-chec-03378d',
								'{kind, select, group {Unable to save the group. Check the values and retry.} other {Unable to save the user. Check the values and retry.}}',
								{ kind: this.isUserGroup ? 'group' : 'user' },
							));
				this.cdr.markForCheck();
			},
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
		this.save$.complete();
	}

	// --------------------------------------------------------------------------------------------------
	private setupForm() {
		this.editorForm = this.fb.group({
			id: [
				{ value: this.userOrGroup?.id, disabled: !this.add },
				[Validators.required, Validators.pattern(/.*\S.*/)],
			],
		});

		if (this.isUserGroup) {
			const group = !this.add ? (this.userOrGroup as ManagedUserGroup) : undefined;

			this.editorForm.addControl('name', this.fb.control(group?.name));
			this.editorForm.addControl('description', this.fb.control(group?.description));
			this.editorForm.addControl('users', this.fb.control(group?.users.map((x) => x.id) ?? []));
			this.editorForm.addControl('memberGroups', this.fb.control(group?.memberGroups ?? []));
			this.editorForm.addValidators((form) =>
				(form.get('memberGroups')?.value ?? []).some(
					(member: any) =>
						(typeof member === 'string' ? member : member?.id) === form.get('id')?.value,
				)
					? { selfMembership: true }
					: null,
			);
		} else {
			const user = !this.add ? (this.userOrGroup as User) : undefined;

			this.editorForm.addControl('firstName', this.fb.control(user?.firstName));
			this.editorForm.addControl('lastName', this.fb.control(user?.lastName));
			this.editorForm.addControl('company', this.fb.control(user?.company));
			this.editorForm.addControl(
				'email',
				this.fb.control(user?.email, [Validators.required, Validators.email]),
			);
			this.editorForm.addControl(
				'password',
				this.fb.group(
					{
						changePassword: [false],
						newPassword: [],
						newPasswordConfirmation: [],
					},
					{ validators: [this.passwordValidator.bind(this)] },
				),
			);
			this.editorForm.addControl('groups', this.fb.control(user?.groups.map((x) => x.id) ?? []));
		}
	}

	// --------------------------------------------------------------------------------------------------
	private passwordValidator(group: AbstractControl): Record<string, boolean> | null {
		const changePassword = group.get('changePassword')?.value;
		const newPassword = group.get('newPassword')?.value;
		const newPasswordConfirmation = group.get('newPasswordConfirmation')?.value;

		return changePassword &&
			(!newPassword || !newPasswordConfirmation || newPassword !== newPasswordConfirmation)
			? { newPasswordConfirmation: true }
			: null;
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit() {
		if (!this.add && !this.userOrGroup)
			throw 'nx-user-and-group-editor: you must specify the user or group';

		this.loadEditor();
	}

	loadEditor() {
		if (this.loading || this.saving) return;
		this.error = '';
		if (this.add) {
			this.setupForm();
			return;
		}
		this.loading = true;
		// Direct membership must come from the entity, not inherited groups in directory search.
		const request: Observable<User | UserGroup> = this.isUserGroup
			? this.usersAndGroupServicesService.getGroup(this.userOrGroup!.id)
			: this.usersAndGroupServicesService.getUser(this.userOrGroup!.id);
		request.pipe(takeUntil(this.destroy$)).subscribe({
			next: (entity) => {
				this.userOrGroup = entity;
				this.setupForm();
				this.loading = false;
				this.cdr.markForCheck();
			},
			error: () => {
				this.loading = false;
				this.error = messageText(
					'app.state.unable-to-load-the-current-account-details-re-244ab4',
					'Unable to load the current account details. Retry to edit.',
				);
				this.cdr.markForCheck();
			},
		});
	}
}
