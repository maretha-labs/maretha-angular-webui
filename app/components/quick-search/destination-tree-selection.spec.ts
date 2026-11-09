import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
	DocumentViewsComponent,
	DocumentCreateContext,
	definePairedView,
	ExtensionRegistry,
	CREATE_POPUP_ITEMS_SLOT,
	CREATE_POPUP_PAGES_SLOT,
} from '@maretha/webui-sdk';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { of } from 'rxjs';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { CreationParentService } from 'app/modules/explorer/helpers/creation-parent.service';
import { DocumentBrowserService } from 'app/modules/explorer/helpers/document-browser.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { DocumentClipboardService } from 'app/modules/explorer/helpers/document-clipboard.service';
import { DocumentTrashService } from 'app/modules/explorer/helpers/document-trash.service';
import { DestinationCreateDialogComponent } from './destination-create-dialog.component';

const folder = (uid: string, path = `/${uid}`) => ({
	uid,
	path,
	title: uid,
	repository: 'default',
	facets: ['Folderish'],
});
@Component({ template: '<p>Creation draft</p>' })
class CreationPage {
	readonly context = input.required<DocumentCreateContext>();
}

describe('Accepted creation destination tree selection', () => {
	it('reflects only accepted destination changes and preserves the selection when a draft guard denies a new folder', async () => {
		const parents = jasmine.createSpyObj<CreationParentService>('parents', ['load']);
		parents.load.and.callFake((path) =>
			of({
				document: folder(path === '/' ? 'first' : path.slice(1)),
				types: [],
				allowed: true,
			} as any),
		);
		const current = signal(folder('opened-page'));
		TestBed.configureTestingModule({
			imports: [DestinationCreateDialogComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: CreationParentService, useValue: parents },
				{ provide: BsModalRef, useValue: { hide: jasmine.createSpy('hide') } },
				{ provide: BsModalService, useValue: {} },
				{ provide: DocumentsManagerService, useValue: { documentFetched: current } },
				{ provide: DocumentClipboardService, useValue: {} },
				{ provide: DocumentTrashService, useValue: {} },
				{
					provide: DocumentBrowserService,
					useValue: {
						getTreeNode: () => of(folder('root', '/')),
						getTreeChildren: (uid: string) =>
							of({
								entries: uid === 'root' ? [folder('first'), folder('second')] : [],
								isNextPageAvailable: false,
							}),
					},
				},
			],
		});
		TestBed.inject(ExtensionRegistry).register({
			id: 'test-create',
			contributions: definePairedView(
				{ items: CREATE_POPUP_ITEMS_SLOT, pages: CREATE_POPUP_PAGES_SLOT },
				{ id: 'test.create', viewId: 'create', label: 'Create', component: CreationPage },
			),
		});
		const fixture = TestBed.createComponent(DestinationCreateDialogComponent);
		const settle = async () => {
			fixture.detectChanges();
			await fixture.whenStable();
			fixture.detectChanges();
		};
		await settle();
		fixture.componentInstance.showTree.set(true);
		await settle();
		const row = (uid: string) =>
			fixture.nativeElement.querySelector(`[data-tree-node="${uid}"]`) as HTMLElement;
		expect(row('first').getAttribute('aria-selected')).toBe('true');
		const views = fixture.debugElement.query(By.directive(DocumentViewsComponent))
			.componentInstance as DocumentViewsComponent;
		const guard = spyOn(views, 'canDeactivate').and.resolveTo(false);
		row('second').focus();
		row('second').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await settle();
		expect(guard).toHaveBeenCalled();
		expect(row('first').getAttribute('aria-selected')).toBe('true');
		expect(row('second').getAttribute('aria-selected')).toBe('false');
		expect(parents.load).toHaveBeenCalledTimes(1);
		guard.and.resolveTo(true);
		row('second').focus();
		row('second').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await settle();
		expect(fixture.componentInstance.context()?.document?.['uid']).toBe('second');
		expect(current().uid).toBe('opened-page');
		expect(document.activeElement).toBe(
			fixture.nativeElement.querySelector('button[aria-expanded="false"]'),
		);
		fixture.componentInstance.showTree.set(true);
		await settle();
		expect(row('second').getAttribute('aria-selected')).toBe('true');
		expect(row('first').getAttribute('aria-selected')).toBe('false');
	});
});
