import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { FormsModule } from '@angular/forms';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import type { RepositorySearchComponent } from '../repository-search/repository-search.component';

/** Query editor presentation stays beside the search that supplies it. */
@Component({
	selector: 'nx-nxql-search-form',
	imports: [FormsModule, CdkTextareaAutosize, WebUiMessagePipe],
	templateUrl: './nxql-search-form.component.html',
	styleUrl: './nxql-search-form.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxqlSearchFormComponent {
	readonly search = input.required<RepositorySearchComponent>();
}
