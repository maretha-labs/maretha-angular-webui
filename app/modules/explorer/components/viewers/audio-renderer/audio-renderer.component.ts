import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { StreamMediaDirective } from '../../../../../directives/stream-media.directive';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
	selector: 'nx-audio-renderer',
	templateUrl: './audio-renderer.component.html',
	styleUrls: ['./audio-renderer.component.scss'],
	imports: [
		WebUiNumberPipe,
		StreamMediaDirective,
		TooltipDirective,
		FontAwesomeModule,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AudioRendererComponent {
	@Input() document: any;
	@Input() contentUrl = '';
	mediaError = '';
}
