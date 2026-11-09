import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { RelativeDatePipe } from 'app/pipes/relative-date.pipe';
import {
	DrawerContext,
	ResultsProjectionColumn,
	ResultsProjectionComponent,
	ResultsProjectionTemplateDirective,
	WebUiAppState,
	WebUiLocale,
	WebUiMessagePipe,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { REPOSITORY_SEARCH } from 'app/modules/search/helpers/repository-search-definitions';
import { SearchFormOutletComponent } from 'app/modules/search/components/search-form/search-form-outlet.component';
import { DocumentTreeComponent } from '../document-tree/document-tree.component';
import { DocumentIconAndTitleComponent } from '../document-icon-and-title/document-icon-and-title.component';
import { documentUrl } from 'app/helpers/document-route';
import { taskUrl } from 'app/helpers/task-route';
@Component({
	selector: 'nx-default-drawer-page',
	templateUrl: './default-drawer-page.component.html',
	styleUrls: ['./sidebar.component.scss', './default-drawer-page.component.scss'],
	imports: [
		WebUiMessagePipe,
		SearchFormOutletComponent,
		TranslateModule,
		FontAwesomeModule,
		RelativeDatePipe,
		DocumentTreeComponent,
		DocumentIconAndTitleComponent,
		ResultsProjectionComponent,
		ResultsProjectionTemplateDirective,
	],
	styles: ':host { display:flex; flex-direction:column; flex:1; min-height:0; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefaultDrawerPageComponent {
	readonly documentUrl = documentUrl;
	readonly taskUrl = taskUrl;
	readonly context = input.required<DrawerContext>();
	private readonly messages = inject(WebUiMessages);
	private readonly appState = inject(WebUiAppState);
	/** The UI language, for the stock relative due dates. */
	readonly locale = inject(WebUiLocale).locale;
	/** Stock nuxeo-tasks-list shows one flat list; the inbox groups tasks by workflow title. */
	readonly drawerTasks = computed(() => Object.values(this.context().tasks ?? {}).flat());
	/** Stock nuxeo-tasks-drawer `current-task`: the task open on the tasks page is selected. */
	readonly currentTaskId = computed(() => this.appState.currentTask()?.id ?? null);
	/** Stock `i18n(key)`: the message for a key, else the key itself. */
	label(value: unknown): string {
		return typeof value === 'string' && value ? this.messages.text(value, value) : '';
	}
	readonly searchDefinition = REPOSITORY_SEARCH.default;
	readonly drawerColumns: readonly ResultsProjectionColumn<any>[] = [
		{ id: 'title', label: 'Title', labelKey: 'app.columns.title', value: (row) => row.title },
	];
	readonly drawerDocumentDisabled = (document: any): boolean =>
		document?.uid === this.documentId && (document.repository ?? 'default') === this.repository;
	navigateRecent(document: any): void {
		if (document?.uid && !this.drawerDocumentDisabled(document))
			this.context().navigate(documentUrl(document));
	}
	get repository(): string {
		return String(this.context().document?.['repository'] ?? 'default');
	}
	get documentId(): string | null {
		const uid = this.context().document?.['uid'];
		return typeof uid === 'string' ? uid : null;
	}
	get userCollections() {
		return this.context().collections.filter((c) => c.type !== 'Favorites');
	}
	get favoritesCollections() {
		return this.context().collections.filter((c) => c.type === 'Favorites');
	}
}
