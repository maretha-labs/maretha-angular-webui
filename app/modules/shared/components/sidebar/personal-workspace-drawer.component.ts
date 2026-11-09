import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DrawerContext, WebUiMessagePipe } from '@maretha/webui-sdk';
import { PersonalWorkspaceService } from 'app/helpers/personal-workspace.service';
import { DocumentTreeComponent } from '../document-tree/document-tree.component';

@Component({
	selector: 'nx-personal-workspace-drawer',
	imports: [DocumentTreeComponent, WebUiMessagePipe],
	template: `
		<h2>{{ 'app.personalSpace' | webuiMessage: 'Personal Workspace' }}</h2>
		@if (loading()) {
			<p role="status">
				{{
					'app.modules.personal-workspace-drawer.loading-workspace-67d517'
						| webuiMessage: 'Loading workspace…'
				}}
			</p>
		}
		@if (error()) {
			<p role="alert">{{ error() }}</p>
			<button type="button" (click)="retry()">
				{{ 'app.modules.personal-workspace-drawer.retry-2c78f7' | webuiMessage: 'Retry' }}
			</button>
		}
		@if (workspace(); as workspace) {
			<nx-document-tree
				[rootPath]="workspace.path"
				[repository]="repository()"
				[showRoot]="true"
				[visible]="context().opened"
				[navigate]="context().navigate"
			/>
		}
	`,
	styles:
		':host { display:block; padding:16px; } h2 { font-size:16px; font-weight:500; margin-bottom:20px; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonalWorkspaceDrawerComponent {
	readonly context = input.required<DrawerContext>();
	private readonly workspaces = inject(PersonalWorkspaceService);
	readonly repository = this.workspaces.repository;
	readonly workspace = this.workspaces.workspace;
	readonly loading = this.workspaces.loading;
	readonly error = this.workspaces.error;
	retry(): void {
		this.workspaces.retry();
	}
}
