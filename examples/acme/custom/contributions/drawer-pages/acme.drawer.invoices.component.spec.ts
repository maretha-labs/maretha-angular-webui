import { TestBed } from '@angular/core/testing';
import type { DrawerContext } from '@maretha/webui-sdk';
import { AcmeDrawerInvoicesComponent } from './acme.drawer.invoices.component';

describe('AcmeDrawerInvoicesComponent', () => {
	it('lists recent invoices and marks the paid ones', () => {
		const fixture = TestBed.createComponent(AcmeDrawerInvoicesComponent);
		fixture.componentRef.setInput('context', {
			document: null,
			noEdit: false,
			user: null,
			locale: 'en-US',
			route: '/dashboard',
			activeKey: 'acme.drawer.invoices',
			opened: true,
			open: () => undefined,
			close: () => undefined,
			navigate: () => undefined,
			recentDocuments: [
				{ uid: 'i1', type: 'Invoice', title: 'INV-1', properties: { 'invoice:paid': true } },
				{ uid: 'i2', type: 'Invoice', title: 'INV-2', properties: { 'invoice:paid': false } },
			],
			collections: [],
			clipboard: [],
			tasks: {},
			taskCount: 0,
			clearHistory: () => undefined,
			clearClipboard: () => undefined,
		} as DrawerContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Invoices');
		expect(fixture.nativeElement.querySelectorAll('li').length).toBe(2);
		expect(fixture.nativeElement.querySelectorAll('.badge').length).toBe(1);
	});
});
