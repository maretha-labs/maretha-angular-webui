import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
	imports: [WebUiMessagePipe],
	selector: 'nx-content-management',
	templateUrl: './content-management.component.html',
	styleUrls: ['./content-management.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentManagementComponent {}
