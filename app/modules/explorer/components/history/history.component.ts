import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, computed, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { DocumentHistoryService } from '../../helpers/document-history.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { animations } from 'app/shared.constants';
import { DocumentIconAndTitleComponent } from '../../../shared/components/document-icon-and-title/document-icon-and-title.component';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
	ResultsProjectionComponent,
	ResultsProjectionColumn,
	ResultsProjectionTemplateDirective,
} from '@maretha/webui-sdk';

@Component({
	selector: 'nx-history',
	templateUrl: './history.component.html',
	styleUrls: ['./history.component.scss'],
	animations: [animations.itemsAnimation, animations.listAnimation],
	imports: [
		DocumentIconAndTitleComponent,
		FontAwesomeModule,
		ResultsProjectionComponent,
		ResultsProjectionTemplateDirective,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryComponent {
	readonly documentHistory = this.documentHistoryService.documentHistory;
	readonly uid = computed(() => this.documentsManagerService.documentFetched()?.uid ?? null);
	readonly columns: readonly ResultsProjectionColumn<any>[] = [
		{ id: 'title', label: 'Title', labelKey: 'app.columns.title', value: (row) => row.title },
	];

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly router: Router,
		private readonly documentHistoryService: DocumentHistoryService,
		private readonly documentsManagerService: DocumentsManagerService,
	) {}

	// --------------------------------------------------------------------------------------------------
	openDocument(documentUid: string) {
		this.router.navigate(['./', documentUid]);
	}

	// --------------------------------------------------------------------------------------------------
	clearHistory() {
		this.documentHistoryService.clear();
	}
}
