import { WebUiMessages } from './webui-messages';
import { WebUiLocale } from './i18n/webui-locale';
import { Component, DestroyRef, inject, input, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { defineContribution } from './contribution';
import {
	defineDocumentView,
	DOCUMENT_VIEWS_ITEMS_SLOT,
	DOCUMENT_VIEWS_PAGES_SLOT,
	DocumentViewContext,
	resolveDocumentViews,
} from './document-view';
import { DocumentViewsComponent } from './document-views.component';
import { ExtensionRegistry } from './extension-registry.service';

let created = 0;
let destroyed = 0;
@Component({ standalone: true, template: '<p>Content {{context().document?.["uid"]}}</p>' })
class ContentPage {
	readonly context = input.required<DocumentViewContext>();
	constructor() {
		created++;
		inject(DestroyRef).onDestroy(() => {
			destroyed++;
		});
	}
}
@Component({ standalone: true, template: '<p>Contract {{context().document?.["uid"]}}</p>' })
class ContractPage {
	readonly context = input.required<DocumentViewContext>();
}
@Component({
	selector: 'nx-viewport-test-page',
	standalone: true,
	template: '<div class="viewport-content">{{context().document?.["uid"]}}</div>',
	styles: `
		:host {
			display: block;
			position: relative;
			min-height: 120px;
		}
		.viewport-content {
			position: absolute;
			inset: 0;
		}
	`,
})
class ViewportPage {
	readonly context = input.required<DocumentViewContext>();
}

describe('Paired document views', () => {
	let registry: ExtensionRegistry;
	let fixture: ComponentFixture<DocumentViewsComponent>;
	const context: DocumentViewContext = {
		document: { uid: 'contract-1', type: 'Contract' },
		noEdit: false,
	};
	const view = (id = 'content', order = 10) =>
		defineDocumentView({
			id: `client.${id}`,
			viewId: id,
			label: id,
			order,
			component: ContentPage,
		});
	async function settle(target = fixture): Promise<void> {
		target.detectChanges();
		await target.whenStable();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		target.detectChanges();
	}
	function tabs(): HTMLButtonElement[] {
		return [...fixture.nativeElement.querySelectorAll('[role="tab"]')];
	}
	beforeEach(() => {
		created = 0;
		destroyed = 0;
		TestBed.configureTestingModule({ imports: [DocumentViewsComponent] });
		registry = TestBed.inject(ExtensionRegistry);
		registry.register({ id: 'defaults', contributions: view() });
		fixture = TestBed.createComponent(DocumentViewsComponent);
		fixture.componentRef.setInput('context', context);
	});

	it('can delegate navigation to a shell drawer without changing the default document tabs', async () => {
		fixture.componentRef.setInput('navigationVisible', false);
		await settle();
		expect(tabs().length).toBe(0);
		const panel = fixture.nativeElement.querySelector('[role="tabpanel"]');
		expect(panel.getAttribute('aria-label')).toBe('content');
		expect(panel.hasAttribute('aria-labelledby')).toBeFalse();
		fixture.componentRef.setInput('navigationVisible', true);
		await settle();
		expect(tabs().length).toBe(1);
		expect(created).toBe(1);
	});
	it('localizes the delegated panel name using its explicit key without remounting its content', async () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', { fr: { 'client.details': 'Détails' } });
		registry.register({
			id: 'keyed',
			contributions: defineDocumentView({
				id: 'client.details',
				viewId: 'details',
				label: 'Details',
				labelKey: 'client.details',
				component: ContentPage,
			}),
		});
		fixture.componentRef.setInput('selectedView', 'details');
		fixture.componentRef.setInput('navigationVisible', false);
		await settle();
		const panel = fixture.nativeElement.querySelector('[role="tabpanel"]');
		const instanceCount = created;
		messages.locale.set('fr');
		await settle();
		expect(panel.getAttribute('aria-label')).toBe('Détails');
		expect(created).toBe(instanceCount);
		fixture.componentRef.setInput('selectedView', 'content');
		await settle();
		expect(
			fixture.nativeElement.querySelector('[role="tabpanel"]').getAttribute('aria-label'),
		).toBe('content');
	});

	it('mounts the paired item and only the selected page, with matching ARIA references', async () => {
		registry.register({ id: 'client', contributions: view('details', 20) });
		await settle();
		expect(tabs().length).toBe(2);
		expect(created).toBe(1);
		const panel = fixture.nativeElement.querySelector('[role="tabpanel"]') as HTMLElement;
		expect(tabs()[0].getAttribute('aria-controls')).toBe(panel.id);
		expect(panel.getAttribute('aria-labelledby')).toBe(tabs()[0].id);
		expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
		for (const tab of tabs()) {
			const target = document.getElementById(tab.getAttribute('aria-controls')!);
			expect(target?.getAttribute('role')).toBe('tabpanel');
			if (tab.getAttribute('aria-selected') !== 'true') {
				expect(target?.hidden).toBeTrue();
				expect(target?.querySelector('nx-contribution-outlet')).toBeNull();
			}
		}
	});

	it('gives pages with only positioned content the available panel width', async () => {
		registry.register({
			id: 'client',
			contributions: defineDocumentView({
				id: 'client.viewport',
				viewId: 'viewport',
				label: 'Viewport',
				component: ViewportPage,
			}),
		});
		fixture.nativeElement.style.width = '480px';
		fixture.nativeElement.style.height = '240px';
		fixture.componentRef.setInput('selectedView', 'viewport');
		await settle();

		const panel = fixture.nativeElement.querySelector('[role="tabpanel"]') as HTMLElement;
		const page = panel.querySelector('nx-viewport-test-page') as HTMLElement;
		expect(panel.getBoundingClientRect().width).toBeCloseTo(480, 0);
		expect(page.getBoundingClientRect().width).toBeCloseTo(panel.getBoundingClientRect().width, 0);
	});

	it('uses deep-link selection before rendering the first page', async () => {
		registry.register({
			id: 'client',
			contributions: defineDocumentView({
				id: 'client.contract',
				viewId: 'contract',
				label: 'Contract',
				component: ContractPage,
			}),
		});
		fixture.componentRef.setInput('selectedView', 'contract');
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Contract contract-1');
		expect(created).toBe(0);
	});

	it('emits history navigation for user selection and disposes the previous page', async () => {
		registry.register({ id: 'client', contributions: view('details', 20) });
		const changes = jasmine.createSpy('viewChange');
		fixture.componentInstance.viewChange.subscribe(changes);
		await settle();
		changes.calls.reset();
		tabs()[1].click();
		await settle();
		expect(changes).toHaveBeenCalledOnceWith({ viewId: 'details', replaceUrl: false });
		expect(destroyed).toBe(1);
		expect(created).toBe(2);
	});

	it('falls back and requests URL replacement when an active view is removed', async () => {
		const dispose = registry.register({ id: 'client', contributions: view('details', 20) });
		fixture.componentRef.setInput('selectedView', 'details');
		await settle();
		const changes = jasmine.createSpy('viewChange');
		fixture.componentInstance.viewChange.subscribe(changes);
		tabs()[1].focus();
		dispose();
		await settle();
		expect(fixture.componentInstance.selectedView()).toBe('content');
		expect(changes).toHaveBeenCalledWith({ viewId: 'content', replaceUrl: true });
		expect(document.activeElement).toBe(tabs()[0]);
	});
	it('recovers focus when an unselected tab disappears without remounting the active page', async () => {
		const dispose = registry.register({ id: 'client', contributions: view('details', 20) });
		await settle();
		tabs()[0].focus();
		tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		await settle();
		expect(document.activeElement).toBe(tabs()[1]);
		dispose();
		await settle();
		expect(document.activeElement).toBe(tabs()[0]);
		expect(tabs()[0].tabIndex).toBe(0);
		expect(created).toBe(1);
		expect(destroyed).toBe(0);
	});
	it('moves focus to the empty state when the final available view disappears', async () => {
		await settle();
		tabs()[0].focus();
		registry.register({
			id: 'hidden',
			overrides: [{ slot: 'DOCUMENT_VIEWS_ITEMS', id: 'client.content', disabled: true }],
		});
		await settle();
		expect(tabs().length).toBe(0);
		expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.view-empty'));
	});
	it('tracks direct tab focus and recovers it after conditional removal without changing selection', async () => {
		const dispose = registry.register({ id: 'client', contributions: view('details', 20) });
		await settle();
		tabs()[1].focus();
		await settle();
		expect(tabs().map((tab) => tab.tabIndex)).toEqual([-1, 0]);
		expect(fixture.componentInstance.selectedView()).toBe('content');
		dispose();
		await settle();
		expect(document.activeElement).toBe(tabs()[0]);
		expect(tabs()[0].tabIndex).toBe(0);
	});

	it('applies the same eligibility to direct navigation and visible items', async () => {
		registry.register({
			id: 'client',
			contributions: defineDocumentView({
				id: 'client.restricted',
				viewId: 'restricted',
				label: 'Restricted',
				component: ContractPage,
				when: (ctx) => ctx.document?.['type'] === 'Invoice',
			}),
		});
		fixture.componentRef.setInput('selectedView', 'restricted');
		await settle();
		expect(tabs().length).toBe(1);
		expect(fixture.componentInstance.selectedView()).toBe('content');
		expect(fixture.nativeElement.textContent).not.toContain('Contract contract-1');
	});

	it('allows a client to replace a page independently of the tab item', async () => {
		const dispose = registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_VIEWS_PAGES_SLOT, {
					id: 'client.content',
					pairKey: 'content',
					component: ContractPage,
				}),
			],
		});
		await settle();
		expect(tabs()[0].textContent?.trim()).toBe('content');
		expect(fixture.nativeElement.textContent).toContain('Contract contract-1');
		dispose();
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Content contract-1');
	});

	it('excludes missing and ambiguous pairs with actionable diagnostics', () => {
		registry.register({
			id: 'client',
			overrides: [{ slot: 'DOCUMENT_VIEWS_PAGES', id: 'client.content', disabled: true }],
		});
		expect(resolveDocumentViews(registry, context).views).toEqual([]);
		expect(resolveDocumentViews(registry, context).diagnostics[0].code).toBe('invalid-pair');
		registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_VIEWS_ITEMS_SLOT, {
					id: 'duplicate',
					pairKey: 'content',
					component: ContentPage,
				}),
			],
		});
		expect(resolveDocumentViews(registry, context).views).toEqual([]);
	});

	it('keeps page state on reordering and same-document refresh, but isolates another document', async () => {
		await settle();
		registry.register({
			id: 'client',
			overrides: [{ slot: 'DOCUMENT_VIEWS_ITEMS', id: 'client.content', order: -20 }],
		});
		fixture.componentRef.setInput('context', {
			...context,
			document: { uid: 'contract-1', title: 'Updated' },
		});
		await settle();
		expect(created).toBe(1);
		expect(destroyed).toBe(0);
		fixture.componentRef.setInput('context', { ...context, document: { uid: 'contract-2' } });
		await settle();
		expect(created).toBe(2);
		expect(destroyed).toBe(1);
		expect(fixture.nativeElement.textContent).toContain('Content contract-2');
	});

	it('supports arrow/Home/End focus with manual tab activation', async () => {
		registry.register({ id: 'client', contributions: view('details', 20) });
		await settle();
		tabs()[0].focus();
		tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		await settle();
		expect(document.activeElement).toBe(tabs()[1]);
		expect(fixture.componentInstance.selectedView()).toBe('content');
		expect(tabs()[1].tabIndex).toBe(0);
		tabs()[1].click();
		await settle();
		expect(fixture.componentInstance.selectedView()).toBe('details');
	});

	it('mirrors horizontal arrows after switching locale while retaining manual activation and vertical keys', async () => {
		registry.register({
			id: 'client',
			contributions: [...view('details', 20), ...view('history', 30)],
		});
		await settle();
		TestBed.inject(WebUiLocale).setLocale('ar');
		tabs()[0].focus();
		tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		await settle();
		expect(document.activeElement).toBe(tabs()[1]);
		expect(fixture.componentInstance.selectedView()).toBe('content');
		tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		await settle();
		expect(document.activeElement).toBe(tabs()[0]);
		fixture.componentRef.setInput('orientation', 'vertical');
		await settle();
		tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		await settle();
		expect(document.activeElement).toBe(tabs()[1]);
		fixture.componentRef.setInput('orientation', 'horizontal');
		TestBed.inject(WebUiLocale).setLocale('fr');
		await settle();
		tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		await settle();
		expect(document.activeElement).toBe(tabs()[2]);
	});

	it('uses vertical semantics and Up/Down navigation when requested', async () => {
		registry.register({ id: 'client', contributions: view('details', 20) });
		fixture.componentRef.setInput('orientation', 'vertical');
		await settle();
		const tabList = fixture.nativeElement.querySelector('[role="tablist"]') as HTMLElement;
		expect(tabList.getAttribute('aria-orientation')).toBe('vertical');
		tabs()[0].focus();
		tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		await settle();
		expect(document.activeElement).toBe(tabs()[1]);
		expect(fixture.componentInstance.selectedView()).toBe('content');
	});

	it('does not mount a lazy page after another view has been selected', async () => {
		let complete!: (value: Type<unknown>) => void;
		const pending = new Promise<Type<unknown>>((resolve) => {
			complete = resolve;
		});
		registry.register({
			id: 'client',
			contributions: defineDocumentView({
				id: 'client.lazy',
				viewId: 'lazy',
				label: 'Lazy',
				order: 20,
				loadComponent: () => pending,
			}),
		});
		fixture.componentRef.setInput('selectedView', 'lazy');
		fixture.detectChanges();
		tabs()[0].click();
		await settle();
		complete(ContractPage);
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Content contract-1');
		expect(fixture.nativeElement.textContent).not.toContain('Contract contract-1');
	});

	it('has independent selection and unique IDs across simultaneous hosts', async () => {
		registry.register({ id: 'client', contributions: view('details', 20) });
		const other = TestBed.createComponent(DocumentViewsComponent);
		other.componentRef.setInput('context', context);
		other.componentRef.setInput('selectedView', 'details');
		await settle();
		await settle(other);
		expect(fixture.componentInstance.selectedView()).toBe('content');
		expect(other.componentInstance.selectedView()).toBe('details');
		expect(tabs()[0].id).not.toBe(other.nativeElement.querySelector('[role="tab"]').id);
		other.destroy();
	});

	it('shows an empty state after both members are disabled', async () => {
		registry.register({
			id: 'client',
			overrides: ['DOCUMENT_VIEWS_ITEMS', 'DOCUMENT_VIEWS_PAGES'].map((slot) => ({
				slot,
				id: 'client.content',
				disabled: true,
			})),
		});
		await settle();
		expect(tabs().length).toBe(0);
		expect(fixture.nativeElement.textContent).toContain('No views are available');
		expect(created).toBe(0);
	});
});
