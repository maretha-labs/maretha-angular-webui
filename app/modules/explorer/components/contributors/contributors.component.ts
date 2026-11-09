import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, Inject, Input, OnInit, Optional, ChangeDetectionStrategy } from '@angular/core';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { TimeagoModule } from 'ngx-timeago';

@Component({
	selector: 'nx-contributors',
	templateUrl: './contributors.component.html',
	styleUrls: ['./contributors.component.scss'],
	imports: [TooltipDirective, FontAwesomeModule, WebUiDatePipe, TimeagoModule, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributorsComponent implements OnInit {
	@Input() document: any;
	@Input() compact = false;
	contributors: string[] = [];

	// --------------------------------------------------------------------------------------------------
	constructor(@Inject('document') @Optional() public doc: any) {
		this.document = doc;
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit() {
		if (!this.document) throw 'nx-contributors: You must specify the input document';

		this.contributors = this.document.properties['dc:contributors'].map((x: any) =>
			x.properties?.firstName || x.properties?.lastName
				? `${x.properties?.firstName} ${x.properties?.lastName}`
				: x.id || x,
		);
	}
}
