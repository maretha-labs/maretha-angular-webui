import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import {
	FormBuilder,
	FormGroup,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { CloudServicesService } from '../../helpers/cloud-services.service';
import { CloudServiceProvider } from '../../models/cloud-service-provider';
import { AutofocusDirective } from '../../../../directives/autofocus.directive';
import { NgSelectComponent, NgMultiLabelTemplateDirective } from '@ng-select/ng-select';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { SlicePipe } from '@angular/common';

@Component({
	selector: 'nx-cloud-service-provider-editor',
	templateUrl: './cloud-service-provider-editor.component.html',
	styleUrls: ['./cloud-service-provider-editor.component.scss'],
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
export class CloudServiceProviderEditorComponent implements OnInit {
	add = true;
	@Input() cloudServiceProvider?: CloudServiceProvider;
	editorForm?: FormGroup;
	save$ = new Subject<CloudServiceProvider>();

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
		const payload: CloudServiceProvider = this.editorForm?.getRawValue();
		payload.scopes = payload.scopes?.map((x: any) =>
			Object.prototype.toString.call(x) === '[object String]' ? x : x.label,
		);

		const result = this.add
			? this.cloudServicesService.addProvider(payload)
			: this.cloudServicesService.updateProvider(this.cloudServiceProvider!.serviceName, payload);

		result.subscribe((_) => {
			this.save$.next(payload);
			this.close();
		});
	}

	// --------------------------------------------------------------------------------------------------
	setupForm() {
		this.editorForm = this.fb.group({
			serviceName: [this.cloudServiceProvider?.serviceName, Validators.required],
			description: [this.cloudServiceProvider?.description],
			clientId: [this.cloudServiceProvider?.clientId],
			clientSecret: [this.cloudServiceProvider?.clientSecret],
			authorizationServerURL: [this.cloudServiceProvider?.authorizationServerURL],
			tokenServerURL: [this.cloudServiceProvider?.tokenServerURL],
			userAuthorizationURL: [this.cloudServiceProvider?.userAuthorizationURL],
			scopes: [this.cloudServiceProvider?.scopes],
			isEnabled: [!!this.cloudServiceProvider?.isEnabled],
		});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		this.add = this.cloudServiceProvider == undefined;

		this.setupForm();
	}
}
