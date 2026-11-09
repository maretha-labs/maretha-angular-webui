import { TestBed } from '@angular/core/testing';
import type { DrawerContext } from '@maretha/webui-sdk';
import { AcmeDrawerContractsComponent } from './acme.drawer.contracts.component';

describe('AcmeDrawerContractsComponent', () => {
	const render = (recentDocuments: readonly Record<string, unknown>[]) => {
		const navigate = jasmine.createSpy('navigate');
		const fixture = TestBed.createComponent(AcmeDrawerContractsComponent);
		fixture.componentRef.setInput('context', {
			document: null,
			noEdit: false,
			user: null,
			locale: 'en-US',
			route: '/dashboard',
			activeKey: 'acme.drawer.contracts',
			opened: true,
			open: () => undefined,
			close: () => undefined,
			navigate,
			recentDocuments,
			collections: [],
			clipboard: [],
			tasks: {},
			taskCount: 0,
			clearHistory: () => undefined,
			clearClipboard: () => undefined,
		} as DrawerContext);
		fixture.detectChanges();
		return { fixture, navigate };
	};

	it('lists the recent contracts only and opens one by its uid route', () => {
		const { fixture, navigate } = render([
			{ uid: 'c1', type: 'Contract', title: 'Office lease' },
			{ uid: 'f1', type: 'File', title: 'Minutes' },
		]);
		const items = fixture.nativeElement.querySelectorAll('li');
		expect(items.length).toBe(1);
		expect(items[0].textContent).toContain('Office lease');
		items[0].querySelector('button').click();
		expect(navigate).toHaveBeenCalledOnceWith('/browse/documents/c1');
	});

	it('says when nothing was opened recently', () => {
		expect(render([]).fixture.nativeElement.textContent).toContain('No contract opened recently.');
	});
});
