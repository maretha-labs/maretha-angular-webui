import { documentTypeIcon, documentTypeIconUrl } from 'app/helpers/document-type-presentation';
import { WebUiIconComponent } from '@maretha/webui-sdk';
import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, Injector, Input, ChangeDetectionStrategy } from '@angular/core';
import {
	DocumentManagerMode,
	DocumentsManagerService,
} from '../../../explorer/helpers/documents-manager.service';
import { RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { LazyLoadDirective } from '../../../../directives/lazy-load.directive';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { TranslateModule } from '@ngx-translate/core';
import { TimeagoModule } from 'ngx-timeago';
import { FileSizePipe } from 'app/pipes/file-size.pipe';
import { DocumentLinkPipe } from 'app/helpers/document-route';

@Component({
	selector: 'nx-document-icon-and-title',
	templateUrl: './document-icon-and-title.component.html',
	styleUrls: ['./document-icon-and-title.component.scss'],
	imports: [
		WebUiIconComponent,
		WebUiNumberPipe,
		RouterLink,
		NgTemplateOutlet,
		LazyLoadDirective,
		TooltipDirective,
		FontAwesomeModule,
		WebUiDatePipe,
		TranslateModule,
		TimeagoModule,
		FileSizePipe,
		DocumentLinkPipe,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentIconAndTitleComponent {
	readonly typeIcon = documentTypeIcon;
	readonly typeIconUrl = documentTypeIconUrl;
	@Input() document: any | undefined;
	@Input() disabled = false;
	@Input() compact = false;
	@Input() showIcon = true;
	documentManagerMode: DocumentManagerMode = DocumentManagerMode.Unknown;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly documentsManagerService: DocumentsManagerService,
		public injector: Injector,
	) {
		this.documentManagerMode = documentsManagerService.mode;
	}
}
