import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PageContext } from '@maretha/webui-sdk';
import { DashboardComponent } from '../dashboard/dashboard.component';
@Component({
	selector: 'nx-dashboard-page',
	imports: [DashboardComponent],
	template: '<nx-dashboard />',
	styles: ':host { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent {
	readonly context = input.required<PageContext>();
}
