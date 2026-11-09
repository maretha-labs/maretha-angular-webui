import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { inject as injectI18n } from '@angular/core';
import { WebUiMessages } from '@maretha/webui-sdk';
import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, Input, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import {
	FormBuilder,
	FormGroup,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject, takeUntil } from 'rxjs';
import { RetentionService } from '../../helpers/retention.service';
import {
	RetentionRule,
	RetentionRuleApplicationPolicy,
	RetentionRuleStartPolicy,
} from '../../models/retention-rule';
import { AutofocusDirective } from '../../../../directives/autofocus.directive';
import { NgSelectComponent, NgMultiLabelTemplateDirective } from '@ng-select/ng-select';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { AsyncPipe, SlicePipe } from '@angular/common';

@Component({
	selector: 'nx-retention-rule-editor',
	templateUrl: './retention-rule-editor.component.html',
	styleUrls: ['./retention-rule-editor.component.scss'],
	imports: [
		WebUiNumberPipe,
		LocalizedSelectDirective,
		FormsModule,
		ReactiveFormsModule,
		AutofocusDirective,
		NgSelectComponent,
		TooltipDirective,
		NgMultiLabelTemplateDirective,
		AsyncPipe,
		SlicePipe,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RetentionRuleEditorComponent implements OnInit, OnDestroy {
	readonly i18n = injectI18n(WebUiMessages);
	private destroy$ = new Subject();

	add = true;
	@Input() retentionRule?: RetentionRule;
	readonly docTypes = this.retentionService.docTypes;
	readonly dateFields = this.retentionService.dateFields;
	get applicationPolicies() {
		return [
			{
				key: 'auto',
				label: this.i18n.format('app.settingsShared.automatic-d461a4', {}, 'Automatic'),
				disabled: true,
			},
			{
				key: 'manual',
				label: this.i18n.format('app.settingsShared.manual-b0b9fe', {}, 'Manual'),
			},
		];
	}
	get startingPointPolicies() {
		return [
			{
				key: 'immediate',
				label: this.i18n.format('app.settingsShared.immediate-ed6cb0', {}, 'Immediate'),
			},
			{
				key: 'event_based',
				label: this.i18n.format('app.settingsShared.based-on-events-b7ab69', {}, 'Based on events'),
			},
			{
				key: 'metadata_based',
				label: this.i18n.format(
					'app.settingsShared.based-on-a-document-s-field-6b32a5',
					{},
					"Based on a document's field",
				),
			},
		];
	}
	startingPointEvents$ = this.retentionService.getStartingPointEvents();
	endActions$ = this.retentionService.endActions();
	save$ = new Subject<RetentionRule>();
	editorForm?: FormGroup;
	options = {
		floor: 0,
		ceil: 100,
		step: 5,
	};

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly bsModalRef: BsModalRef,
		private readonly fb: FormBuilder,
		private retentionService: RetentionService,
	) {}

	// --------------------------------------------------------------------------------------------------
	close() {
		this.bsModalRef.hide();
	}

	// --------------------------------------------------------------------------------------------------
	saveChanges() {
		const payload = { ...this.retentionRule, ...this.editorForm?.getRawValue() };

		if (payload.durationMillis) payload.durationMillis *= 1000;

		const result = this.add
			? this.retentionService.addRetentionRule(payload)
			: this.retentionService.updateRetentionRule(payload);

		result.subscribe((x: any) => {
			payload.creationDate = x.properties['dc:created'];
			payload.createdBy = x.properties['dc:creator'];
			payload.modificationDate = x.properties['dc:modified'];
			payload.lastModifiedBy = x.properties['dc:lastContributor'];

			this.save$.next(payload);
			this.close();
		});
	}

	// --------------------------------------------------------------------------------------------------
	setupForm() {
		this.editorForm = this.fb.group({
			title: [this.retentionRule?.title, Validators.required],
			description: [this.retentionRule?.description],
			applicationPolicy: [this.retentionRule?.applicationPolicy, Validators.required],
			expression: [this.retentionRule?.expression],
			docTypes: [this.retentionRule?.docTypes],
			startingPointPolicy: [this.retentionRule?.startingPointPolicy],
			startingPointEvent: [this.retentionRule?.startingPointEvent],
			startingPointValue: [this.retentionRule?.startingPointValue],
			metadataXPath: [this.retentionRule?.metadataXPath],
			endActions: [this.retentionRule?.endActions],
			durationYears: [this.retentionRule?.durationYears || 0],
			durationMonths: [this.retentionRule?.durationMonths || 0],
			durationDays: [this.retentionRule?.durationDays || 0],
			durationMillis: [
				this.retentionRule?.durationMillis ? this.retentionRule.durationMillis / 1000 : 0,
			],
			enabled: [this.retentionRule?.enabled || true],
		});

		this.editorForm
			.get('applicationPolicy')
			?.valueChanges.pipe(takeUntil(this.destroy$))
			.subscribe((x) => {
				this.editorForm!.get('expression')?.clearValidators();

				this.editorForm!.get('docTypes')!.clearValidators();

				this.editorForm!.get('startingPointPolicy')!.clearValidators();
				this.editorForm!.get('startingPointPolicy')!.setValue(null);

				if (x === RetentionRuleApplicationPolicy.Auto)
					this.editorForm!.get('expression')!.addValidators(Validators.required);
				else {
					this.editorForm!.get('docTypes')!.addValidators([Validators.required]);
					this.editorForm!.get('startingPointPolicy')!.addValidators([Validators.required]);
				}
			});

		this.editorForm
			.get('startingPointPolicy')
			?.valueChanges.pipe(takeUntil(this.destroy$))
			.subscribe((x) => {
				this.editorForm!.get('startingPointEvent')?.clearValidators();
				this.editorForm!.get('startingPointEvent')!.setValue(null);

				this.editorForm!.get('startingPointValue')!.clearValidators();
				this.editorForm!.get('startingPointValue')!.setValue(null);

				this.editorForm!.get('metadataXPath')!.clearValidators();
				this.editorForm!.get('metadataXPath')!.setValue(null);

				if (x === RetentionRuleStartPolicy.EventBased) {
					this.editorForm!.get('startingPointEvent')!.addValidators(Validators.required);
					this.editorForm!.get('startingPointValue')!.addValidators(Validators.required);
				} else this.editorForm!.get('metadataXPath')!.addValidators([Validators.required]);
			});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		this.add = this.retentionRule == undefined;

		this.setupForm();
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy() {
		this.destroy$.next(null);
	}
}
