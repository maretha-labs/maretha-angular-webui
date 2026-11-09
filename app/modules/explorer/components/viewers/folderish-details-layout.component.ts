import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DocumentLayoutContext } from '@maretha/webui-sdk';
import { GenericFolderishViewerComponent } from './generic-folderish-viewer/generic-folderish-viewer.component';
import { FolderishDetailsPanelComponent } from './folderish-details-panel.component';
import { PictureBookContentLayoutComponent } from './picturebook-content-layout.component';
import { isStandardFolder } from '../../helpers/standard-document-surfaces';

/** Source document-content body with the document-page details side panel. */
@Component({
	selector: 'nx-folderish-details-layout',
	standalone: true,
	host: { '[class.scoped-content]': 'usesScopedContent' },
	imports: [
		GenericFolderishViewerComponent,
		FolderishDetailsPanelComponent,
		PictureBookContentLayoutComponent,
	],
	template: `
		<div class="folderish-layout">
			@if (usesScopedContent) {
				<nx-picturebook-content-layout
					[document]="document"
					[noEdit]="noEdit"
					[layoutContext]="layoutContext"
					[contentLabel]="document.type"
				/>
			} @else {
				<nx-folderish-details-panel
					[document]="document"
					[noEdit]="noEdit || layoutContext?.noEdit === true"
				/>
				<nx-generic-folderish-viewer [document]="document" />
			}
		</div>
	`,
	styles: [
		`
			:host(.scoped-content),
			:host(.scoped-content) .folderish-layout {
				display: flex;
				flex: 1;
				flex-direction: column;
				min-height: 0;
				min-width: 0;
			}
			.folderish-layout {
				min-width: 0;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderishDetailsLayoutComponent {
	@Input() document: any;
	@Input() noEdit = false;
	@Input() layoutContext?: DocumentLayoutContext;
	get usesScopedContent(): boolean {
		return isStandardFolder(this.document);
	}
}
