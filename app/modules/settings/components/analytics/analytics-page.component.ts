import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AdministrationContext } from '@maretha/webui-sdk';
import { AnalyticsComponent } from './analytics.component';
@Component({
	selector: 'nx-analytics-page',
	imports: [AnalyticsComponent],
	template: '<nx-analytics [section]="section()" />',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsPageComponent {
	readonly context = input.required<AdministrationContext>();
	readonly section = input.required<'distribution' | 'repository' | 'search' | 'workflow'>();
}
