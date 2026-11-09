import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	Component,
	OnInit,
	OnChanges,
	Input,
	inject,
	ChangeDetectionStrategy,
} from '@angular/core';
import { StreamMediaDirective } from '../../../../../directives/stream-media.directive';
import { DocumentAttachmentsService } from '../../../helpers/document-attachments.service';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FileSizePipe } from 'app/pipes/file-size.pipe';
import { DurationPipe } from 'app/pipes/duration.pipe';

@Component({
	selector: 'nx-video-renderer',
	templateUrl: './video-renderer.component.html',
	styleUrls: ['./video-renderer.component.scss'],
	imports: [
		WebUiNumberPipe,
		StreamMediaDirective,
		TooltipDirective,
		FontAwesomeModule,
		FileSizePipe,
		DurationPipe,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoRendererComponent implements OnInit, OnChanges {
	private mobileBreakpoint = 480;

	@Input() document: any;
	@Input() contentUrl = '';
	@Input() thumbnailUrl = '';
	itemsPerSlide = 4;
	mediaError = '';
	private selectedBlob: any;
	private readonly attachments = inject(DocumentAttachmentsService);
	get mediaBlob(): any {
		return (
			this.selectedBlob ??
			this.document?.properties?.['file:content'] ??
			this.document?.ng?.attachment
		);
	}
	ngOnChanges(): void {
		this.selectedBlob = undefined;
		this.mediaError = '';
	}
	selectSource(blob: any): void {
		this.selectedBlob = blob;
		this.contentUrl = blob?.data ?? '';
	}
	download(event: Event, blob: any): void {
		event.preventDefault();
		this.attachments.downloadDocumentBlob(this.document, blob).subscribe();
	}

	constructor() {}

	ngOnInit(): void {
		if (window.innerWidth < this.mobileBreakpoint) this.itemsPerSlide = 2;
		else this.itemsPerSlide = 4;
	}
}
