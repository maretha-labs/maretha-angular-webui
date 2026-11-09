import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import {
	FormGroup,
	FormBuilder,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { CloudServicesService } from '../../helpers/cloud-services.service';
import { CloudAccount } from '../../models/cloud-account';
import { AutofocusDirective } from '../../../../directives/autofocus.directive';
import { BsDatepickerInputDirective, BsDatepickerDirective } from 'ngx-bootstrap/datepicker';

@Component({
	selector: 'nx-cloud-account-editor',
	templateUrl: './cloud-account-editor.component.html',
	styleUrls: ['./cloud-account-editor.component.scss'],
	imports: [
		FormsModule,
		ReactiveFormsModule,
		AutofocusDirective,
		BsDatepickerInputDirective,
		BsDatepickerDirective,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloudAccountEditorComponent implements OnInit {
	@Input() cloudClient?: CloudAccount;
	editorForm?: FormGroup;
	save$ = new Subject<CloudAccount>();

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly fb: FormBuilder,
		private readonly bsModalRef: BsModalRef,
		private cloudServicesService: CloudServicesService,
	) {}

	// --------------------------------------------------------------------------------------------------
	close() {
		this.bsModalRef.hide();
	}

	// --------------------------------------------------------------------------------------------------
	saveChanges() {
		const payload: CloudAccount = { ...this.cloudClient, ...this.editorForm?.getRawValue() };

		const result = this.cloudServicesService.updateAccount(payload);

		result.subscribe((_) => {
			this.save$.next(payload);
			this.close();
		});
	}

	// --------------------------------------------------------------------------------------------------
	setupForm() {
		this.editorForm = this.fb.group({
			serviceName: [this.cloudClient?.serviceName, Validators.required],
			nuxeoLogin: [
				{
					value: this.cloudClient?.nuxeoLogin,
					disabled: true,
				},
				Validators.required,
			],
			serviceLogin: [this.cloudClient?.serviceLogin, Validators.required],
			creationDate: [
				this.cloudClient?.creationDate ? new Date(this.cloudClient?.creationDate) : undefined,
				Validators.required,
			],
		});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		this.setupForm();
	}
}
