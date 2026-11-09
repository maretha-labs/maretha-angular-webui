import { ApplicationPageComponent } from 'app/components/application-pages/application-page.component';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { DragToSelectModule } from 'ngx-drag-to-select';

import { SharedModule } from 'app/modules/shared/shared.module';

import { MarkdownModule, MARKED_OPTIONS } from 'ngx-markdown';

import { DocumentTypeEditorComponent } from './components/editors/document-type-editor/document-type-editor.component';
import { DomainEditorComponent } from './components/editors/domain-editor/domain-editor.component';
import { GenericEditorComponent } from './components/editors/generic-editor/generic-editor.component';
import { DisplaySettingsComponent } from './components/display-settings/display-settings.component';
import { DocumentActionsToolbarComponent } from './components/viewers/document-actions-toolbar/document-actions-toolbar.component';
import { DocumentTypeViewerComponent } from './components/viewers/document-type-viewer/document-type-viewer.component';
import { GenericFolderishViewerComponent } from './components/viewers/generic-folderish-viewer/generic-folderish-viewer.component';
import { GenericNonFolderishViewerComponent } from './components/viewers/generic-non-folderish-viewer/generic-non-folderish-viewer.component';
import { GenericTypeViewerComponent } from './components/viewers/generic-type-viewer/generic-type-viewer.component';
import { CommentsComponent } from './components/comments/comments.component';
import { DocumentInfoComponent } from './components/document-info/document-info.component';
import { DocumentVersionsComponent } from './components/document-snapshots/document-snapshots.component';
import { DocumentPermissionEditorComponent } from './components/document-permission-editor/document-permission-editor.component';
import { ContributorsComponent } from './components/contributors/contributors.component';
import { DocumentNavigationBarComponent } from './components/document-navigation-bar/document-navigation-bar.component';
import { DocumentToolbarComponent } from './components/document-toolbar/document-toolbar.component';
import { HistoryComponent } from './components/history/history.component';
import { ClipboardComponent } from './components/clipboard/clipboard.component';
import { ExplorerComponent } from './explorer/explorer.component';
import { DocumentAttachmentsComponent } from './components/document-attachments/document-attachments.component';
import { DocumentPermissionsComponent } from './components/document-permissions/document-permissions.component';
import { DocumentActivityComponent } from './components/document-activity/document-activity.component';
import { BaseWorkflowEditorComponent } from './components/workflows/base-workflow-editor/base-workflow-editor.component';
import { WorkflowInfoComponent } from './components/workflows/workflow-info/workflow-info.component';
import { GenericTypeBulkCreateComponent } from './components/editors/generic-type-bulk-create/generic-type-bulk-create.component';
import { DocumentComparisonComponent } from './components/viewers/document-comparison/document-comparison.component';
import { CollectionsComponent } from './components/collections/collections.component';
import { AudioRendererComponent } from './components/viewers/audio-renderer/audio-renderer.component';
import { VideoRendererComponent } from './components/viewers/video-renderer/video-renderer.component';
import { PdfRendererComponent } from './components/viewers/pdf-renderer/pdf-renderer.component';
import { ImageRendererComponent } from './components/viewers/image-renderer/image-renderer.component';
import { NatureSubjectsCoverageExpirationComponent } from './components/editors/nature-subjects-coverage-expiration/nature-subjects-coverage-expiration.component';
import { VocabularyComponent } from './components/editors/vocabulary/vocabulary.component';
import { BaseEditorComponent } from './components/editors/base-editor/base-editor.component';
import { NoteEditorComponent } from './components/editors/note-editor/note-editor.component';
import { BinaryEditorComponent } from './components/editors/binary-editor/binary-editor.component';
import { NoteRendererComponent } from './components/viewers/note-renderer/note-renderer.component';
import { DocumentSnapshotComparisonComponent } from './components/viewers/document-snapshot-comparison/document-snapshot-comparison.component';
import { ParallelWfChooseParticipantsTaskComponent } from './components/workflows/parallel-document-review/parallel-wf-choose-participants-task/parallel-wf-choose-participants-task.component';
import { ParallelWfGiveOpinionTaskComponent } from './components/workflows/parallel-document-review/parallel-wf-give-opinion-task/parallel-wf-give-opinion-task.component';
import { SerialWfChooseParticipantsTaskComponent } from './components/workflows/serial-document-review/serial-wf-choose-participants-task/serial-wf-choose-participants-task.component';
import { SerialWfDocumentValidationTaskComponent } from './components/workflows/serial-document-review/serial-wf-document-validation-task/serial-wf-document-validation-task.component';
import { InternalPublicationComponent } from './components/publications/internal-publication/internal-publication.component';
import { ThreedRendererComponent } from './components/viewers/threed-renderer/threed-renderer.component';
import { NxLegacyModelViewerComponent } from './components/viewers/legacy-model-vewer/legacy-model-vewer.component';
import { DocumentInfoPanelComponent } from './components/document-info-panel/document-info-panel.component';
import { TagsComponent } from './components/editors/tags/tags.component';

// export const GuidRegex = /^[0-9a-zA-Z]{8}(-[0-9a-zA-Z]{4}){3}-[0-9a-zA-Z]{12}$/;

@NgModule({
	imports: [
		SharedModule,
		RouterModule.forChild([
			{
				path: '',
				pathMatch: 'full',
				component: ApplicationPageComponent,
				data: { pageId: 'explorer' },
			},
			{
				path: 'documents',
				component: ApplicationPageComponent,
				data: { pageId: 'explorer' },
			},
			{
				path: 'documents/:id',
				component: ApplicationPageComponent,
				data: { pageId: 'explorer' },
			},
			{
				path: 'collections',
				pathMatch: 'full',
				component: ApplicationPageComponent,
				data: { pageId: 'explorer' },
			},
			{
				path: 'collections/:id',
				component: ApplicationPageComponent,
				data: { pageId: 'explorer' },
			},
			{
				path: '**',
				component: ApplicationPageComponent,
				data: { pageId: 'explorer' },
			},
		]),
		DragToSelectModule.forRoot(),
		MarkdownModule.forRoot({
			markedOptions: {
				provide: MARKED_OPTIONS,
				useValue: {
					gfm: true,
					breaks: false,
					pedantic: false,
				},
			},
		}),
		DocumentActionsToolbarComponent,
		GenericEditorComponent,
		DocumentTypeEditorComponent,
		DomainEditorComponent,
		GenericFolderishViewerComponent,
		GenericNonFolderishViewerComponent,
		DisplaySettingsComponent,
		DocumentTypeViewerComponent,
		GenericTypeViewerComponent,
		DocumentInfoComponent,
		CommentsComponent,
		DocumentPermissionEditorComponent,
		DocumentVersionsComponent,
		DocumentNavigationBarComponent,
		DocumentToolbarComponent,
		HistoryComponent,
		ContributorsComponent,
		ClipboardComponent,
		ExplorerComponent,
		DocumentAttachmentsComponent,
		DocumentPermissionsComponent,
		DocumentActivityComponent,
		BaseWorkflowEditorComponent,
		WorkflowInfoComponent,
		GenericTypeBulkCreateComponent,
		DocumentComparisonComponent,
		CollectionsComponent,
		AudioRendererComponent,
		VideoRendererComponent,
		PdfRendererComponent,
		ImageRendererComponent,
		NatureSubjectsCoverageExpirationComponent,
		VocabularyComponent,
		BaseEditorComponent,
		NoteEditorComponent,
		BinaryEditorComponent,
		NoteRendererComponent,
		DocumentSnapshotComparisonComponent,
		ParallelWfChooseParticipantsTaskComponent,
		ParallelWfGiveOpinionTaskComponent,
		SerialWfChooseParticipantsTaskComponent,
		SerialWfDocumentValidationTaskComponent,
		InternalPublicationComponent,
		ThreedRendererComponent,
		NxLegacyModelViewerComponent,
		DocumentInfoPanelComponent,
		TagsComponent,
	],
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ExplorerModule {}
