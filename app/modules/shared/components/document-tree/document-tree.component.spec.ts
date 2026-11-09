import { WebUiLocale } from '@maretha/webui-sdk';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { SidebarService } from 'app/helpers/sidebar.service';
import { DocumentBrowserService } from 'app/modules/explorer/helpers/document-browser.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { DocumentClipboardService } from 'app/modules/explorer/helpers/document-clipboard.service';
import { DocumentTrashService } from 'app/modules/explorer/helpers/document-trash.service';
import { DocumentTreeComponent } from './document-tree.component';

const folder = (uid: string, path = '/' + uid) => ({
	uid,
	title: uid,
	path,
	facets: ['Folderish'],
	contextParameters: { hasFolderishChild: true },
});
const leaf = (uid: string, path = '/' + uid) => ({
	...folder(uid, path),
	contextParameters: { hasFolderishChild: false },
});
describe('Document tree', () => {
	const current = signal<any>(null);
	let browser: jasmine.SpyObj<DocumentBrowserService>;
	let close: jasmine.Spy;
	let copies: Subject<any>;
	let moves: Subject<any>;
	let pasted: Subject<any>;
	let updated: Subject<any[]>;
	let created: Subject<any>;
	let trashed: Subject<string[]>;
	let restored: Subject<string[]>;
	beforeEach(() => {
		current.set(null);
		copies = new Subject();
		moves = new Subject();
		pasted = new Subject();
		updated = new Subject();
		created = new Subject();
		trashed = new Subject();
		restored = new Subject();
		browser = jasmine.createSpyObj('browser', ['getTreeNode', 'getTreeChildren']);
		browser.getTreeNode.and.returnValue(of(folder('root', '/')));
		browser.getTreeChildren.and.returnValue(
			of({ entries: [folder('first')], isNextPageAvailable: false }),
		);
		close = jasmine.createSpy('close');
		TestBed.configureTestingModule({
			imports: [DocumentTreeComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: DocumentBrowserService, useValue: browser },
				{
					provide: DocumentsManagerService,
					useValue: {
						documentFetched: current,
						documentsUpdated$: updated,
						documentCreated$: created,
					},
				},
				{
					provide: DocumentClipboardService,
					useValue: {
						documentsCopied$: copies,
						documentsMoved$: moves,
						drawerActionPerformed$: pasted,
					},
				},
				{
					provide: DocumentTrashService,
					useValue: { documentsMovedToTrash$: trashed, documentsRestoredFromTrash$: restored },
				},
				{ provide: SidebarService, useValue: { closeDrawer: close } },
			],
		});
	});
	it('selects a creation destination without navigating or closing the drawer', async () => {
		const fixture = await render();
		const selected = jasmine.createSpy('selected');
		const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl');
		fixture.componentRef.setInput('selectDocument', selected);
		fixture.componentInstance.navigateTo(fixture.componentInstance.rootNodes[0]);
		expect(selected).toHaveBeenCalledWith(folder('first'));
		expect(navigate).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
	});
	it('labels the repository root without exposing its internal identifier', async () => {
		const fixture = await render();
		expect(fixture.componentInstance.labelFor({ path: '/', uid: 'internal-id', title: '' })).toBe(
			'Root',
		);
	});
	it('adopts the tree primitive hierarchy and supports keyboard selection and expansion', async () => {
		const fixture = await render();
		const selected = jasmine.createSpy('selected');
		fixture.componentRef.setInput('selectDocument', selected);
		fixture.detectChanges();
		const tree = fixture.nativeElement.querySelector('[role="tree"]') as HTMLElement;
		const item = fixture.nativeElement.querySelector('[role="treeitem"]') as HTMLElement;
		expect(tree).not.toBeNull();
		expect(item.getAttribute('aria-level')).toBe('1');
		expect(item.getAttribute('aria-selected')).toBe('false');
		item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(selected).toHaveBeenCalledWith(folder('first'));
		item.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		fixture.detectChanges();
		expect(item.getAttribute('aria-expanded')).toBe('true');
		expect(fixture.nativeElement.querySelector('[role="group"]')).not.toBeNull();
	});
	it('uses RTL expansion arrows and returns to LTR without losing the selected destination', async () => {
		const fixture = await render();
		TestBed.inject(WebUiLocale).setLocale('ar');
		const item = fixture.nativeElement.querySelector('[role="treeitem"]') as HTMLElement;
		item.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		await fixture.whenStable();
		fixture.detectChanges();
		expect(item.getAttribute('aria-expanded')).toBe('true');
		item.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		fixture.detectChanges();
		expect(item.getAttribute('aria-expanded')).toBe('false');
		TestBed.inject(WebUiLocale).setLocale('fr');
		item.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		fixture.detectChanges();
		expect(item.getAttribute('aria-expanded')).toBe('true');
		expect(fixture.componentInstance.rootNodes[0].document.uid).toBe('first');
	});
	it('owns lazy children under their parent and keeps selection separate from one roving tab stop', async () => {
		const children = new Subject<any>();
		browser.getTreeChildren.and.callFake((id) =>
			id === 'root'
				? of({ entries: [folder('first'), folder('last')], isNextPageAvailable: false })
				: children,
		);
		const fixture = await render();
		const selected = jasmine.createSpy('selected');
		fixture.componentRef.setInput('selectDocument', selected);
		fixture.detectChanges();
		const items = () =>
			Array.from(fixture.nativeElement.querySelectorAll('[role="treeitem"]')) as HTMLElement[];
		const press = (node: HTMLElement, key: string) =>
			node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
		const parent = items()[0];
		expect(items().map((item) => item.tabIndex)).toEqual([0, -1]);
		parent.focus();
		press(parent, 'ArrowRight');
		fixture.detectChanges();
		expect(parent.querySelector('[role="group"]')).not.toBeNull();
		expect(parent.querySelector('[role="status"]')?.textContent).toContain('Loading');
		expect(document.activeElement).toBe(parent);
		children.next({ entries: [folder('child', '/first/child')], isNextPageAvailable: false });
		children.complete();
		await fixture.whenStable();
		fixture.detectChanges();
		press(parent, 'ArrowRight');
		expect(document.activeElement).toBe(items()[1]);
		expect(items()[1].parentElement?.closest('[role="treeitem"]')).toBe(parent);
		press(items()[1], 'Enter');
		expect(selected).toHaveBeenCalledOnceWith(folder('child', '/first/child'));
		press(items()[1], 'ArrowLeft');
		expect(document.activeElement).toBe(parent);
		press(parent, 'End');
		expect(document.activeElement).toBe(items()[2]);
		expect(selected).toHaveBeenCalledTimes(1);
		items()[1].focus();
		fixture.componentInstance.toggleNode(fixture.componentInstance.rootNodes[0]);
		fixture.detectChanges();
		expect(document.activeElement).toBe(parent);
		expect(items().map((item) => item.tabIndex)).toEqual([0, -1]);
	});
	it('includes load-more in arrow navigation and recovers focus when the completed control disappears', async () => {
		browser.getTreeChildren.and.callFake((_id, page) =>
			of({ entries: [folder(page ? 'second' : 'first')], isNextPageAvailable: !page }),
		);
		const fixture = await render();
		const first = fixture.nativeElement.querySelector('[data-tree-node="first"]') as HTMLElement;
		first.focus();
		first.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
		);
		const more = fixture.nativeElement.querySelector('.tree-more') as HTMLButtonElement;
		expect(more.getAttribute('role')).toBe('treeitem');
		expect(document.activeElement).toBe(more);
		expect(more.tabIndex).toBe(0);
		more.click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.tree-more')).toBeNull();
		expect(document.activeElement).toBe(
			fixture.nativeElement.querySelector('[data-tree-node="second"]'),
		);
		expect(fixture.nativeElement.querySelectorAll('[role="treeitem"][tabindex="0"]').length).toBe(
			1,
		);
	});
	it('returns pointer focus to the tree row and leaves nested children with their own activation', async () => {
		const fixture = await render();
		const selected = jasmine.createSpy('selected');
		fixture.componentRef.setInput('selectDocument', selected);
		fixture.detectChanges();
		const row = fixture.nativeElement.querySelector('[role="treeitem"]') as HTMLElement;
		(row.querySelector('.tree-link') as HTMLElement).click();
		expect(document.activeElement).toBe(row);
		expect(selected).toHaveBeenCalledOnceWith(folder('first'));
	});

	async function render() {
		const fixture = TestBed.createComponent(DocumentTreeComponent);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		return fixture;
	}
	it('appends and renders root pages without duplicating entries', async () => {
		browser.getTreeChildren.and.callFake((_id, page) =>
			of({
				entries: page ? [folder('first'), folder('second')] : [folder('first')],
				isNextPageAvailable: !page,
			}),
		);
		const fixture = await render();
		const more = fixture.nativeElement.querySelector('.tree-more');
		expect(more.textContent).toContain('Load more');
		more.click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('.tree-link').length).toBe(2);
		expect(fixture.nativeElement.textContent).toContain('second');
		expect(fixture.nativeElement.querySelector('.tree-more')).toBeNull();
	});
	it('keeps failed pages retryable and does not skip a page', async () => {
		browser.getTreeChildren.and.returnValue(throwError(() => new Error('offline')));
		const fixture = await render();
		expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
		browser.getTreeChildren.and.returnValue(of({ entries: [folder('recovered')] }));
		fixture.nativeElement.querySelector('.tree-more').click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(browser.getTreeChildren.calls.mostRecent().args).toEqual(['root', 0, 'default']);
		expect(fixture.nativeElement.textContent).toContain('recovered');
	});
	it('cancels an obsolete root request when the root or repository changes', async () => {
		const old = new Subject<any>();
		browser.getTreeNode.and.returnValue(old);
		const fixture = TestBed.createComponent(DocumentTreeComponent);
		fixture.detectChanges();
		browser.getTreeNode.and.returnValue(of(folder('new-root', '/workspace')));
		fixture.componentRef.setInput('rootPath', '/workspace');
		fixture.componentRef.setInput('repository', 'other');
		fixture.componentRef.setInput('showRoot', true);
		fixture.detectChanges();
		old.next(folder('obsolete'));
		old.complete();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.componentInstance.root()?.document.uid).toBe('new-root');
		expect(browser.getTreeNode.calls.mostRecent().args).toEqual(['/workspace', 'other']);
		expect(browser.getTreeChildren.calls.mostRecent().args).toEqual(['new-root', 0, 'other']);
	});
	it('hides the toggle on folders without folderish children, as stock', async () => {
		browser.getTreeChildren.and.returnValue(
			of({ entries: [folder('parent'), leaf('empty')], isNextPageAvailable: false }),
		);
		const fixture = await render();
		const rows = Array.from(
			fixture.nativeElement.querySelectorAll('[role="treeitem"]'),
		) as HTMLElement[];
		expect(rows[0].querySelector('.tree-toggle')).not.toBeNull();
		expect(rows[0].getAttribute('aria-expanded')).toBe('false');
		expect(rows[1].querySelector('.tree-toggle')).toBeNull();
		expect(rows[1].getAttribute('aria-expanded')).toBeNull();
		rows[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		fixture.detectChanges();
		expect(browser.getTreeChildren).toHaveBeenCalledTimes(1);
	});
	it('anchors on the browsed folder with one children request and breadcrumb ancestors as links', async () => {
		current.set({
			...folder('mariana', '/default-domain/workspaces/mariana'),
			contextParameters: {
				breadcrumb: {
					entries: [
						{ ...folder('domain', '/default-domain'), facets: ['Folderish', 'HiddenInNavigation'] },
						folder('workspaces', '/default-domain/workspaces'),
						folder('mariana', '/default-domain/workspaces/mariana'),
					],
				},
			},
		});
		const fixture = TestBed.createComponent(DocumentTreeComponent);
		fixture.componentRef.setInput('anchor', 'current');
		fixture.componentRef.setInput('showRoot', true);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(browser.getTreeNode).not.toHaveBeenCalled();
		expect(browser.getTreeChildren.calls.allArgs()).toEqual([['mariana', 0, 'default']]);
		expect(fixture.componentInstance.root()?.document.uid).toBe('mariana');
		expect(fixture.componentInstance.root()?.isExpanded).toBeTrue();
		const parents = Array.from(
			fixture.nativeElement.querySelectorAll('.tree-parent'),
		) as HTMLElement[];
		expect(parents.map((p) => p.textContent?.trim())).toEqual(['Root', 'workspaces']);
		const navigate = jasmine.createSpy('navigate');
		fixture.componentRef.setInput('navigate', navigate);
		parents[1].click();
		expect(navigate).toHaveBeenCalledWith('/browse/default-domain/workspaces');
		parents[0].click();
		expect(navigate).toHaveBeenCalledWith('/browse');
	});
	it('anchors a file on its parent folder and does not reload when a sibling file opens', async () => {
		const parentDoc = folder('ws', '/default-domain/workspaces/ws');
		const file = (name: string) => ({
			uid: name,
			path: `/default-domain/workspaces/ws/${name}`,
			facets: ['Versionable'],
			contextParameters: { breadcrumb: { entries: [parentDoc, { uid: name }] } },
		});
		current.set(file('a'));
		const fixture = TestBed.createComponent(DocumentTreeComponent);
		fixture.componentRef.setInput('anchor', 'current');
		fixture.detectChanges();
		await fixture.whenStable();
		expect(fixture.componentInstance.root()?.document.uid).toBe('ws');
		current.set(file('b'));
		fixture.detectChanges();
		await fixture.whenStable();
		expect(browser.getTreeChildren).toHaveBeenCalledTimes(1);
		current.set(folder('other', '/default-domain/workspaces/other'));
		fixture.detectChanges();
		await fixture.whenStable();
		expect(browser.getTreeChildren.calls.mostRecent().args).toEqual(['other', 0, 'default']);
	});
	it('sends nothing while hidden and loads once when shown', async () => {
		const fixture = TestBed.createComponent(DocumentTreeComponent);
		fixture.componentRef.setInput('visible', false);
		fixture.detectChanges();
		await fixture.whenStable();
		expect(browser.getTreeNode).not.toHaveBeenCalled();
		expect(browser.getTreeChildren).not.toHaveBeenCalled();
		fixture.componentRef.setInput('visible', true);
		fixture.detectChanges();
		await fixture.whenStable();
		expect(browser.getTreeChildren).toHaveBeenCalledTimes(1);
		fixture.componentRef.setInput('visible', false);
		fixture.detectChanges();
		fixture.componentRef.setInput('visible', true);
		fixture.detectChanges();
		await fixture.whenStable();
		expect(browser.getTreeChildren).toHaveBeenCalledTimes(1);
	});
	it('falls back to the root path while no document is browsed', async () => {
		const fixture = TestBed.createComponent(DocumentTreeComponent);
		fixture.componentRef.setInput('anchor', 'current');
		fixture.detectChanges();
		await fixture.whenStable();
		expect(browser.getTreeNode).toHaveBeenCalledWith('/', 'default');
		expect(fixture.componentInstance.root()?.document.uid).toBe('root');
		expect(fixture.nativeElement.querySelector('.tree-parent')).toBeNull();
	});
	it('keeps the drawer open after navigation and supports contributed navigation', async () => {
		const fixture = await render();
		const router = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
		fixture.componentInstance.navigateTo(fixture.componentInstance.rootNodes[0]);
		await fixture.whenStable();
		expect(close).not.toHaveBeenCalled();
		const navigate = jasmine.createSpy('navigate');
		fixture.componentRef.setInput('navigate', navigate);
		fixture.componentInstance.navigateTo(fixture.componentInstance.rootNodes[0]);
		expect(navigate).toHaveBeenCalledWith('/browse/first');
		expect(router).toHaveBeenCalledTimes(1);
	});
	it('does not select a document from a different repository', async () => {
		current.set({ uid: 'first', path: '/first/file', repository: 'other' });
		const fixture = await render();
		expect(fixture.componentInstance.currentDocUid()).toBeNull();
		expect(fixture.componentInstance.root()?.children[0].isExpanded).toBeFalse();
		expect(browser.getTreeChildren).toHaveBeenCalledTimes(1);
	});
	it('batches mutation channels, preserves repository scope, and stops refreshing after destruction', async () => {
		const fixture = await render();
		copies.next({ documents: [{ ...folder('other'), repository: 'other' }] });
		pasted.next({ repository: 'other', documents: [] });
		await Promise.resolve();
		fixture.detectChanges();
		expect(browser.getTreeNode).toHaveBeenCalledTimes(1);
		browser.getTreeChildren.and.returnValue(
			of({ entries: [folder('created')], isNextPageAvailable: false }),
		);
		updated.next([{ ...folder('created'), parentRef: 'root' }]);
		copies.next({ documents: [folder('created')] });
		pasted.next({ repository: 'default', documents: [] });
		trashed.next(['first']);
		restored.next(['created']);
		await Promise.resolve();
		fixture.detectChanges();
		await fixture.whenStable();
		expect(browser.getTreeNode).toHaveBeenCalledTimes(2);
		expect(fixture.componentInstance.rootNodes.map((node) => node.document.uid)).toEqual([
			'created',
		]);
		fixture.destroy();
		moves.next({ documents: [folder('later')] });
		await Promise.resolve();
		expect(browser.getTreeNode).toHaveBeenCalledTimes(2);
	});
	it('cancels an obsolete page request when a mutation invalidates the cached tree', async () => {
		const fixture = await render();
		const stale = new Subject<any>();
		browser.getTreeChildren.and.returnValue(stale);
		fixture.componentInstance.more(fixture.componentInstance.root()!);
		expect(stale.observed).toBeTrue();
		browser.getTreeChildren.and.returnValue(of({ entries: [folder('fresh')] }));
		pasted.next({ repository: 'default', documents: [] });
		await Promise.resolve();
		fixture.detectChanges();
		await fixture.whenStable();
		expect(stale.observed).toBeFalse();
		expect(fixture.componentInstance.rootNodes.map((node) => node.document.uid)).toEqual(['fresh']);
	});
	it('refreshes an off-parent folder creation without navigation and ignores other repositories', async () => {
		const fixture = await render();
		created.next({ repository: 'other', document: folder('elsewhere') });
		await Promise.resolve();
		fixture.detectChanges();
		expect(browser.getTreeNode).toHaveBeenCalledTimes(1);
		browser.getTreeChildren.and.returnValue(of({ entries: [folder('created')] }));
		created.next({ repository: 'default', document: folder('created') });
		await Promise.resolve();
		fixture.detectChanges();
		await fixture.whenStable();
		expect(browser.getTreeNode).toHaveBeenCalledTimes(2);
		expect(fixture.componentInstance.rootNodes[0].document.uid).toBe('created');
		expect(current()).toBeNull();
	});
	it('does not reload a root-anchored tree when the browsed document changes', async () => {
		const fixture = await render();
		current.set(folder('created'));
		fixture.detectChanges();
		await fixture.whenStable();
		expect(browser.getTreeChildren).toHaveBeenCalledTimes(1);
		expect(fixture.componentInstance.root()?.children[0].document.uid).toBe('first');
	});
	it('refreshes on legacy window mutation events scoped to the active repository', async () => {
		const fixture = await render();
		window.dispatchEvent(
			new CustomEvent('document-created', { detail: { document: { repository: 'other' } } }),
		);
		window.dispatchEvent(new CustomEvent('refresh-display', { detail: { repository: 'other' } }));
		await Promise.resolve();
		fixture.detectChanges();
		expect(browser.getTreeNode).toHaveBeenCalledTimes(1);
		browser.getTreeChildren.and.returnValue(of({ entries: [folder('created')] }));
		window.dispatchEvent(
			new CustomEvent('document-created', { detail: { document: { repository: 'default' } } }),
		);
		window.dispatchEvent(new CustomEvent('nuxeo-documents-deleted'));
		await Promise.resolve();
		fixture.detectChanges();
		await fixture.whenStable();
		expect(browser.getTreeNode).toHaveBeenCalledTimes(2);
		expect(fixture.componentInstance.rootNodes.map((node) => node.document.uid)).toEqual([
			'created',
		]);
		fixture.destroy();
		window.dispatchEvent(new CustomEvent('refresh-display'));
		await Promise.resolve();
		expect(browser.getTreeNode).toHaveBeenCalledTimes(2);
	});
});
