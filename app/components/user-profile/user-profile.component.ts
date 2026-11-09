import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { ChangeDetectorRef, Component, ChangeDetectionStrategy } from '@angular/core';
import {
	FormArray,
	UntypedFormBuilder,
	UntypedFormGroup,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { AuthService } from 'app/helpers/auth.service';
import { UsersAndGroupsFinderService } from 'app/helpers/users-and-groups-finder.service';
import { UserInfo } from 'app/models/user-info';
import { animations } from 'app/shared.constants';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { combineLatest } from 'rxjs';
import { PasswordDialogComponent } from '../application-pages/password-dialog.component';

@Component({
	selector: 'nx-user-profile',
	templateUrl: './user-profile.component.html',
	styleUrls: ['./user-profile.component.scss'],
	animations: [animations.itemsAnimation, animations.listAnimation],
	imports: [FormsModule, ReactiveFormsModule, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserProfileComponent {
	groups: any[] = [];
	userInfo: UserInfo | null = null;
	editorForm?: UntypedFormGroup | undefined;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly bsModalRef: BsModalRef,
		private readonly modals: BsModalService,
		private readonly authService: AuthService,
		private readonly fb: UntypedFormBuilder,
		private readonly usersAndGroupsFinderService: UsersAndGroupsFinderService,
		private readonly cdr: ChangeDetectorRef,
	) {
		combineLatest({
			userInfo: this.authService.userInfoUpdated$,
			allGroups: usersAndGroupsFinderService.getGroups(),
		}).subscribe((x) => {
			this.groups = Object.values(x.allGroups).sort((a: any, b: any) =>
				a.name.localeCompare(b.name),
			);

			this.userInfo = x.userInfo;

			if (this.userInfo) this.setupForm();
			this.cdr.markForCheck();
		});
	}

	// --------------------------------------------------------------------------------------------------
	close() {
		this.bsModalRef.hide();
	}

	// --------------------------------------------------------------------------------------------------
	saveChanges() {
		const formValues = this.editorForm?.getRawValue();

		const userInfo = {
			userName: this.userInfo?.id,
			firstName: formValues.firstName,
			lastName: formValues.lastName,
			company: formValues.company,
			email: formValues.email,
			groups: formValues.groups
				.filter((x: any) => Object.values(x)[0])
				.map((x: any) => Object.keys(x)[0]),
		};

		this.authService.updateUserInfo(userInfo).subscribe(() => this.bsModalRef.hide());
	}

	// --------------------------------------------------------------------------------------------------
	get groupsFormArray() {
		return this.editorForm?.get('groups') as FormArray;
	}

	// --------------------------------------------------------------------------------------------------
	showGroupPermissions(group: any) {
		group.expanded = !group.expanded;

		if (!group.expanded || group.permissions?.length) return;

		this.usersAndGroupsFinderService.getPermissions(group.id).subscribe((x) => {
			group.permissions = x;
			this.cdr.markForCheck();
		});
	}

	// --------------------------------------------------------------------------------------------------
	private setupForm() {
		const groups = this.groups.map((x) => {
			const value = this.userInfo?.groups?.some((group) => group.id === x.id) ?? false;

			return this.fb.group({ [x.id]: [value] });
		});

		this.editorForm = this.fb.group({
			firstName: [this.userInfo?.firstName],
			lastName: [this.userInfo?.lastName],
			company: [this.userInfo?.company],
			email: [this.userInfo?.email, [Validators.required, Validators.email]],
			groups: this.fb.array(groups),
		});
	}
	changePassword(): void {
		this.modals.show(PasswordDialogComponent, {
			class: 'modal-md',
			keyboard: true,
			ariaLabelledBy: 'password-dialog-title',
		});
	}
}
