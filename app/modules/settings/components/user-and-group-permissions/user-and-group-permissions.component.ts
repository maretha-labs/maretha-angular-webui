import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectorRef,
	Component,
	Input,
	OnInit,
	ChangeDetectionStrategy,
} from '@angular/core';
import { FormGroup, FormBuilder } from '@angular/forms';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { forkJoin, Subject } from 'rxjs';
import { UsersAndGroupsService } from '../../helpers/users-and-groups.service';
import { NgClass, KeyValuePipe } from '@angular/common';
import { PressAndHoldButtonComponent } from '../../../shared/components/press-and-hold-button/press-and-hold-button.component';
import { PlaceholderTemplateDirective } from '../../../../directives/placeholder-template.directive';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
	selector: 'nx-user-and-group-permissions',
	templateUrl: './user-and-group-permissions.component.html',
	styleUrls: ['./user-and-group-permissions.component.scss'],
	imports: [
		NgClass,
		PressAndHoldButtonComponent,
		PlaceholderTemplateDirective,
		TooltipDirective,
		FontAwesomeModule,
		WebUiDatePipe,
		KeyValuePipe,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAndGroupPermissionsComponent implements OnInit {
	@Input() userOrGroup: any;
	@Input() isUserGroup = false;
	editorForm?: FormGroup;
	save$ = new Subject();
	acls: Record<string, any[]> = {};

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly fb: FormBuilder,
		private readonly bsModalRef: BsModalRef,
		private readonly usersAndGroupsService: UsersAndGroupsService,
		private readonly cdr: ChangeDetectorRef,
	) {}

	// --------------------------------------------------------------------------------------------------
	close() {
		this.bsModalRef.hide();
	}

	// --------------------------------------------------------------------------------------------------
	removePermission(aclKey: string, permission: any) {
		this.usersAndGroupsService.removePermission(permission.id, permission.uid).subscribe(() => {
			const index = this.acls[aclKey].findIndex((x) => x.uid === permission.uid);
			if (index >= 0) {
				this.acls[aclKey].splice(index, 1);
				this.cdr.markForCheck();
			}
		});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit() {
		if (!this.userOrGroup) throw 'nx-user-and-group-editor: you must specify the user or group';

		if (this.isUserGroup)
			this.usersAndGroupsService.getPermissions(this.userOrGroup.id).subscribe((x: any) => {
				this.acls = { $: x };
				this.cdr.markForCheck();
			});
		else {
			const observables: any = {
				$: this.usersAndGroupsService.getPermissions(this.userOrGroup.id),
			};

			for (const group of this.userOrGroup.groups)
				observables[group.id] = this.usersAndGroupsService.getPermissions(group.id);

			forkJoin(observables).subscribe((x: any) => {
				this.acls = x;
				this.cdr.markForCheck();
			});
		}
	}
}
