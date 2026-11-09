import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, Input, ChangeDetectionStrategy, OnInit } from '@angular/core';
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
import { CloudClient } from '../../models/cloud-client';
import { AutofocusDirective } from '../../../../directives/autofocus.directive';
import { NgSelectComponent, NgMultiLabelTemplateDirective } from '@ng-select/ng-select';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { SlicePipe } from '@angular/common';

@Component({
	selector: 'nx-cloud-client-editor',
	templateUrl: './cloud-client-editor.component.html',
	styleUrls: ['./cloud-client-editor.component.scss'],
	imports: [
		LocalizedSelectDirective,
		FormsModule,
		ReactiveFormsModule,
		AutofocusDirective,
		NgSelectComponent,
		NgMultiLabelTemplateDirective,
		TooltipDirective,
		SlicePipe,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloudClientEditorComponent implements OnInit {
	@Input() add = true;
	@Input() cloudClient?: CloudClient;
	editorForm?: FormGroup;
	save$ = new Subject<CloudClient>();

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
		const payload: CloudClient = this.editorForm?.getRawValue();
		payload.redirectURIs = payload.redirectURIs?.map((x: any) =>
			Object.prototype.toString.call(x) === '[object String]' ? x : x.label,
		);

		const result = this.add
			? this.cloudServicesService.addClient(payload)
			: this.cloudServicesService.updateClient(payload);

		result.subscribe((_) => {
			this.save$.next(payload);
			this.close();
		});
	}

	// --------------------------------------------------------------------------------------------------
	setupForm() {
		this.editorForm = this.fb.group({
			id: [this.cloudClient?.id, Validators.required],
			name: [this.cloudClient?.name, Validators.required],
			secret: [this.cloudClient?.secret],
			redirectURIs: [
				this.cloudClient?.redirectURIs,
				[Validators.required, Validators.minLength(1)],
			],
			isAutoGrant: [!!this.cloudClient?.isAutoGrant],
			isEnabled: [!!this.cloudClient?.isEnabled],
		});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		this.add = this.cloudClient == undefined;

		this.setupForm();
	}
}
