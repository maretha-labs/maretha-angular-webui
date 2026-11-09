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
import { CloudApplication } from '../../models/cloud-application';
import { AutofocusDirective } from '../../../../directives/autofocus.directive';
import { BsDatepickerInputDirective, BsDatepickerDirective } from 'ngx-bootstrap/datepicker';

@Component({
	selector: 'nx-cloud-application-editor',
	templateUrl: './cloud-application-editor.component.html',
	styleUrls: ['./cloud-application-editor.component.scss'],
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
export class CloudApplicationEditorComponent implements OnInit {
	@Input() cloudApplication?: CloudApplication;
	editorForm?: FormGroup;
	save$ = new Subject<CloudApplication>();

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
		const payload: CloudApplication = {
			...this.cloudApplication,
			...this.editorForm?.getRawValue(),
		};

		const result = this.cloudServicesService.updateApplication(payload);

		result.subscribe((_) => {
			this.save$.next(payload);
			this.close();
		});
	}

	// --------------------------------------------------------------------------------------------------
	setupForm() {
		this.editorForm = this.fb.group({
			nuxeoLogin: [
				{
					value: this.cloudApplication?.nuxeoLogin,
					disabled: true,
				},
				Validators.required,
			],
			serviceLogin: [this.cloudApplication?.serviceLogin, Validators.required],
			creationDate: [
				this.cloudApplication?.creationDate
					? new Date(this.cloudApplication?.creationDate)
					: undefined,
				Validators.required,
			],
		});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		this.setupForm();
	}
}
