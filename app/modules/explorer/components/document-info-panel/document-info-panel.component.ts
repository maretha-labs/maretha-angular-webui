import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { LayoutService } from '../../helpers/layout.service';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
	selector: 'nx-document-info-panel',
	templateUrl: './document-info-panel.component.html',
	styleUrls: ['./document-info-panel.component.scss'],
	imports: [TooltipDirective, FontAwesomeModule, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentInfoPanelComponent {
	// --------------------------------------------------------------------------------------------------
	constructor(private readonly layoutService: LayoutService) {}

	// --------------------------------------------------------------------------------------------------
	closeInfoPanel() {
		this.layoutService.toggleInfoPanel();
	}
}
