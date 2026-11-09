import { NgComponentOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	Injector,
	input,
	viewChild,
} from '@angular/core';
import { PublishContext, GuardedView } from '@maretha/webui-sdk';
import {
	InternalPublicationComponent,
	STANDARD_PUBLISH_REPOSITORY,
} from '../publications/internal-publication/internal-publication.component';
import { SelectionPublicationPageComponent } from './selection-publication-page.component';
import { usesStandardPublishAction } from './document-actions-toolbar/standard-document-publish-policy';
@Component({
	selector: 'nx-publish-section-view',
	imports: [NgComponentOutlet, SelectionPublicationPageComponent],
	template:
		'@if (context().selectedDocuments) { <nx-selection-publication-page [context]="context()" /> } @else { <ng-container [ngComponentOutlet]="component" [ngComponentOutletInjector]="componentInjector()" /> }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublishSectionViewComponent implements GuardedView {
	readonly context = input.required<PublishContext>();
	readonly component = InternalPublicationComponent;
	private readonly injector = inject(Injector);
	private readonly outlet = viewChild(NgComponentOutlet);
	private readonly selection = viewChild(SelectionPublicationPageComponent);
	readonly componentInjector = computed(() =>
		Injector.create({
			parent: this.injector,
			providers: [
				{ provide: 'document', useValue: this.context().document },
				{
					provide: STANDARD_PUBLISH_REPOSITORY,
					useValue: usesStandardPublishAction(this.context())
						? String(this.context().document?.['repository'] ?? 'default')
						: null,
				},
			],
		}),
	);
	canDeactivate(): boolean {
		if (this.selection()) return this.selection()!.canDeactivate();
		return !(this.outlet()?.componentInstance as InternalPublicationComponent | undefined)?.working;
	}
}
