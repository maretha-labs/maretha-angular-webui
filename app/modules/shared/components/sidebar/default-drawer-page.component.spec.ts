import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { POLYMER_MESSAGES, WebUiAppState, WebUiMessages } from '@maretha/webui-sdk';
import { fixtureDocument, legacyTestProviders } from 'app/testing/legacy-test-providers';
import { DefaultDrawerPageComponent } from './default-drawer-page.component';

describe('Default drawer navigation', () => {
	for (const allowed of [true, false]) {
		it(`keeps Recently Viewed open when a title link navigation is ${allowed ? 'accepted' : 'cancelled'}`, async () => {
			TestBed.configureTestingModule({
				imports: [DefaultDrawerPageComponent],
				providers: legacyTestProviders(),
			});
			const fixture = TestBed.createComponent(DefaultDrawerPageComponent);
			fixture.nativeElement.style.cssText = 'width: 400px; height: 600px';
			document.body.append(fixture.nativeElement);
			const close = jasmine.createSpy('close drawer');
			const navigate = jasmine.createSpy('row navigation');
			const route = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(allowed);
			const current = { ...fixtureDocument(), uid: 'current', title: 'Current document' };
			const recent = {
				...fixtureDocument(),
				path: undefined,
				uid: 'recent',
				title: 'Recent document',
			};
			fixture.componentRef.setInput('context', {
				activeKey: 'recents',
				opened: true,
				document: current,
				recentDocuments: [recent, current],
				navigate,
				close,
			});
			fixture.detectChanges();
			await fixture.whenStable();
			await new Promise((resolve) => setTimeout(resolve));
			fixture.detectChanges();
			const entries = fixture.nativeElement.querySelectorAll('nx-document-icon-and-title');
			const link: HTMLAnchorElement = entries[0].querySelector('a');
			expect(link.textContent).toContain('Recent document');
			expect(link.getAttribute('href')).toBe('/browse/documents/recent');
			link.click();
			await fixture.whenStable();
			expect(route).toHaveBeenCalledTimes(1);
			expect(navigate).not.toHaveBeenCalled();
			expect(close).not.toHaveBeenCalled();
			// Clicking the current document's disabled title must also leave the drawer open.
			expect(entries[1].querySelector('a')).toBeNull();
			entries[1].querySelector('h6').click();
			await fixture.whenStable();
			expect(route).toHaveBeenCalledTimes(1);
			expect(close).not.toHaveBeenCalled();
		});
	}

	it('lists open tasks as stock: one flat list, translated labels, due date, current task selected', () => {
		const currentTask = signal<any>({
			id: 't2',
			name: 'wf.serialDocumentReview.DocumentValidation',
		});
		TestBed.configureTestingModule({
			imports: [DefaultDrawerPageComponent],
			providers: [...legacyTestProviders(), { provide: WebUiAppState, useValue: { currentTask } }],
		});
		TestBed.inject(WebUiMessages).register('polymer', POLYMER_MESSAGES);
		const dueDate = new Date(Date.now() + 5 * 86_400_000 + 60_000).toISOString();
		const task = (id: string, name: string, workflowModelName: string) => ({
			id,
			name,
			workflowModelName,
			workflowTitle: `wf.${workflowModelName}`,
			dueDate,
			targetDocumentIds: [{ uid: 'doc', title: 'FILE' }],
		});
		const navigate = jasmine.createSpy('navigate');
		const fixture = TestBed.createComponent(DefaultDrawerPageComponent);
		fixture.componentRef.setInput('context', {
			activeKey: 'tasks',
			opened: true,
			navigate,
			tasks: {
				'wf.SerialDocumentReview': [
					task('t1', 'wf.serialDocumentReview.chooseParticipants', 'SerialDocumentReview'),
					task('t2', 'wf.serialDocumentReview.DocumentValidation', 'SerialDocumentReview'),
				],
				'wf.ParallelDocumentReview': [
					task('t3', 'wf.parallelDocumentReview.give_opinion.title', 'ParallelDocumentReview'),
				],
			},
		});
		fixture.detectChanges();
		const drawer: HTMLElement = fixture.nativeElement;
		const items = [...drawer.querySelectorAll<HTMLButtonElement>('.nx-drawer__task-item')];
		expect(drawer.querySelector('.nx-drawer__header h6')!.textContent!.trim()).toBe('Tasks');
		expect(items.map((item) => [...item.children].map((part) => part.textContent!.trim()))).toEqual(
			[
				['Choose Participants', 'FILE', 'Duein 5 days', 'Serial Document Review'],
				['Validate the Document', 'FILE', 'Duein 5 days', 'Serial Document Review'],
				['Give your Opinion', 'FILE', 'Duein 5 days', 'Parallel document review'],
			],
		);
		expect(drawer.querySelector('.nx-drawer__task-date')!.textContent!.trim()).toBe('in 5 days');
		expect(drawer.textContent).not.toContain('wf.');
		expect(drawer.querySelector('fa-icon')).toBeNull();
		expect(items.map((item) => item.classList.contains('selected'))).toEqual([false, true, false]);
		expect(items[1].getAttribute('aria-current')).toBe('page');
		items[0].click();
		expect(navigate).toHaveBeenCalledWith('/tasks/t1');
		const dashboard = drawer.querySelector<HTMLButtonElement>('.drawer-footer__link')!;
		expect(dashboard.textContent!.trim()).toBe('View Tasks Dashboard');
		expect(dashboard.classList).not.toContain('btn');
		dashboard.click();
		expect(navigate).toHaveBeenCalledWith('/tasks');
		currentTask.set(null);
		fixture.detectChanges();
		expect(drawer.querySelector('.nx-drawer__task-item.selected')).toBeNull();
	});

	it('opens a recent row through contributed navigation and distinguishes repositories', () => {
		TestBed.configureTestingModule({ imports: [DefaultDrawerPageComponent] });
		TestBed.overrideComponent(DefaultDrawerPageComponent, { set: { imports: [], template: '' } });
		const fixture = TestBed.createComponent(DefaultDrawerPageComponent);
		const navigate = jasmine.createSpy('navigate');
		fixture.componentRef.setInput('context', {
			document: { uid: 'same', repository: 'default' },
			navigate,
		});
		fixture.componentInstance.navigateRecent({ uid: 'same', repository: 'default' });
		expect(navigate).not.toHaveBeenCalled();
		fixture.componentInstance.navigateRecent({ uid: 'same', repository: 'other' });
		expect(navigate).toHaveBeenCalledOnceWith('/browse/documents/same?repository=other');
	});
});
