import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PageContext } from '@maretha/webui-sdk';
import { SettingsComponent } from '../../modules/settings/settings.component';
@Component({
	selector: 'nx-administration-page',
	imports: [SettingsComponent],
	template: '<nx-settings />',
	styles: ':host { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdministrationPageComponent {
	readonly context = input.required<PageContext>();
}
