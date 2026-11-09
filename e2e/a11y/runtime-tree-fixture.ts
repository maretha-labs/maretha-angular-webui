import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { EMPTY, delay, of, throwError } from 'rxjs';
import { SidebarService } from 'app/helpers/sidebar.service';
import { DocumentBrowserService } from 'app/modules/explorer/helpers/document-browser.service';
import { DocumentClipboardService } from 'app/modules/explorer/helpers/document-clipboard.service';
import { DocumentTrashService } from 'app/modules/explorer/helpers/document-trash.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { DocumentTreeComponent } from 'app/modules/shared/components/document-tree/document-tree.component';

interface FixtureDocument {
	uid: string;
	title: string;
	path: string;
	repository: string;
	facets: string[];
	contextParameters: { hasFolderishChild: boolean };
}

const document = (uid: string, title: string, path: string, folder = false): FixtureDocument => ({
	uid,
	title,
	path,
	repository: 'default',
	facets: folder ? ['Folderish'] : [],
	contextParameters: { hasFolderishChild: folder },
});
const root = document('fixture-root', 'Customer {root}', '/fixture', true);
const branch = document('fixture-branch', 'Customer {folder}', '/fixture/folder', true);
const first = document('fixture-first', 'Customer {draft}', '/fixture/folder/draft');
const next = document('fixture-next', 'Customer {next page}', '/fixture/folder/next');
const last = document('fixture-last', 'Customer {archive}', '/fixture/archive');

@Injectable()
class RuntimeTreeState {
	readonly selected = signal<FixtureDocument | null>(null);
	readonly requests = signal<string[]>([]);
	readonly select = (value: FixtureDocument) => this.selected.set(value);

	getTreeNode(path: string, repository: string) {
		if (path !== '/fixture' || repository !== 'default')
			return throwError(() => new Error('Unexpected fixture tree root.'));
		return of(root).pipe(delay(20));
	}

	getTreeChildren(uid: string, page: number, repository: string) {
		this.requests.update((requests) => [...requests, `${uid}:${page}`]);
		if (repository !== 'default')
			return throwError(() => new Error('Unexpected fixture repository.'));
		if (uid === root.uid && page === 0)
			return of({ entries: [branch, last], isNextPageAvailable: false }).pipe(delay(20));
		if (uid === branch.uid && page === 0)
			return of({ entries: [first], isNextPageAvailable: true }).pipe(delay(20));
		if (uid === branch.uid && page === 1)
			return of({ entries: [next], isNextPageAvailable: false }).pipe(delay(20));
		return throwError(() => new Error('Unexpected fixture tree page.'));
	}
}

@Component({
	selector: 'nx-runtime-tree-fixture',
	imports: [DocumentTreeComponent],
	providers: [
		RuntimeTreeState,
		{ provide: DocumentBrowserService, useExisting: RuntimeTreeState },
		{
			provide: DocumentsManagerService,
			useFactory: () => ({ documentFetched: inject(RuntimeTreeState).selected }),
		},
		{
			provide: DocumentClipboardService,
			useValue: { documentsCopied$: EMPTY, documentsMoved$: EMPTY, drawerActionPerformed$: EMPTY },
		},
		{
			provide: DocumentTrashService,
			useValue: {
				documentsMovedToTrash$: EMPTY,
				documentsPurged$: EMPTY,
				documentsRestoredFromTrash$: EMPTY,
				trashEmptied$: EMPTY,
			},
		},
		{ provide: SidebarService, useValue: { closeDrawer: () => undefined } },
	],
	template: `
		<section data-runtime-tree-fixture [attr.data-tree-requests]="state.requests().join(',')">
			<button type="button" data-before-runtime-tree>
				{{ arabic ? 'قبل شجرة المجلدات' : 'Before folder tree' }}
			</button>
			<nx-document-tree
				rootPath="/fixture"
				repository="default"
				[showRoot]="true"
				[selectDocument]="state.select"
			/>
			<button type="button" data-after-runtime-tree>
				{{ arabic ? 'بعد شجرة المجلدات' : 'After folder tree' }}
			</button>
			<p data-runtime-tree-selection [attr.data-selected-uid]="state.selected()?.uid">
				{{ state.selected()?.title ?? (arabic ? 'لم يتم تحديد مستند.' : 'No document selected.') }}
			</p>
		</section>
	`,
	styles: `
		:host {
			display: block;
			min-width: 0;
		}
		section > button {
			padding: 8px;
			color: var(--nuxeo-text-default);
			background: var(--nuxeo-box);
			border: 1px solid var(--nuxeo-border);
		}
		nx-document-tree {
			display: block;
			margin-block: 1rem;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuntimeTreeFixture {
	readonly state = inject(RuntimeTreeState);
	readonly arabic = new URLSearchParams(location.search).get('locale') === 'ar';
}
