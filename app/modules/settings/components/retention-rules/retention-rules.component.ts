import { WebUiMessagePipe, WebUiLocale } from '@maretha/webui-sdk';
import { ChangeDetectorRef, Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RetentionRuleLogComponent } from 'app/modules/settings/components/retention-rule-log/retention-rule-log.component';
import { BsModalService, ModalOptions } from 'ngx-bootstrap/modal';
import { first } from 'rxjs';
import { RetentionService } from '../../helpers/retention.service';
import {
	RetentionRule,
	RetentionRuleApplicationPolicy,
	RetentionRuleStartPolicy,
} from '../../models/retention-rule';
import { RetentionRuleEditorComponent } from '../retention-rule-editor/retention-rule-editor.component';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { TimeagoModule } from 'ngx-timeago';

@Component({
	selector: 'nx-retention-rules',
	templateUrl: './retention-rules.component.html',
	styleUrls: ['./retention-rules.component.scss'],
	imports: [TooltipDirective, FormsModule, FontAwesomeModule, TimeagoModule, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RetentionRulesComponent {
	private readonly locale = inject(WebUiLocale);
	retentionRules: RetentionRule[] = [];
	readonly retentionRuleApplicationPolicyEnum = RetentionRuleApplicationPolicy;
	readonly retentionRuleStartPolicyEnum = RetentionRuleStartPolicy;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly retentionService: RetentionService,
		private readonly modalService: BsModalService,
		private readonly cdr: ChangeDetectorRef,
	) {
		retentionService.loadMore().subscribe((x) => {
			x.forEach((y) => this.computeDuration(y));

			this.retentionRules = x;
			this.cdr.markForCheck();
		});
	}

	// --------------------------------------------------------------------------------------------------
	duration(rule: RetentionRule): string {
		const locale = this.locale.locale();
		const parts = (
			[
				['year', rule.durationYears],
				['month', rule.durationMonths],
				['day', rule.durationDays],
			] as const
		)
			.filter(([, value]) => !!value)
			.map(([unit, value]) =>
				new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(value),
			);
		if (!parts.length)
			parts.push(
				new Intl.NumberFormat(locale, {
					style: 'unit',
					unit: 'second',
					unitDisplay: 'long',
				}).format((rule.durationMillis || 0) / 1000),
			);
		return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(parts);
	}
	private computeDuration(rule: RetentionRule): void {
		rule.duration = this.duration(rule);
	}

	// --------------------------------------------------------------------------------------------------
	toggleRetentionRule(retentionRule: RetentionRule) {
		this.retentionService.toggleRetentionRule(retentionRule.uid, retentionRule.enabled).subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	showEditor(retentionRule?: RetentionRule) {
		const initialState: ModalOptions = {
			initialState: {
				retentionRule,
			},
			class: 'modal-lg',
		};

		const bsModalRef = this.modalService.show(RetentionRuleEditorComponent, initialState);
		bsModalRef.content?.save$.pipe(first()).subscribe((x) => {
			this.computeDuration(x);

			if (retentionRule) {
				const index = this.retentionRules.findIndex((y) => y.uid === retentionRule.uid);

				if (~index) this.retentionRules.splice(index, 1, x);
			} else this.retentionRules.push(x);
			this.cdr.markForCheck();
		});
	}

	// --------------------------------------------------------------------------------------------------
	showLog(retentionRule: RetentionRule) {
		const initialState: ModalOptions = {
			initialState: {
				retentionRule,
			},
		};

		const _bsModalRef = this.modalService.show(RetentionRuleLogComponent, initialState);
	}
}
