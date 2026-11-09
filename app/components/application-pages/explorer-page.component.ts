import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PageContext } from '@maretha/webui-sdk';
import { ExplorerComponent } from '../../modules/explorer/explorer/explorer.component';
@Component({
	selector: 'nx-explorer-page',
	imports: [ExplorerComponent],
	template: '<nx-explorer />',
	styles: ':host { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerPageComponent {
	readonly context = input.required<PageContext>();
}
