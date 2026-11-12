import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { definePairedView, DocumentViewContext } from './document-view';
import { DocumentViewsComponent } from './document-views.component';
import { ExtensionRegistry } from './extension-registry.service';
import { PUBLISH_ITEMS_SLOT, PUBLISH_PAGES_SLOT } from './publishing';

@Component({ changeDetection: ChangeDetectionStrategy.Eager, template: 'Publish draft' })
class PublishPage {
	readonly context = input.required<DocumentViewContext>();
	readonly canDeactivate = jasmine.createSpy().and.resolveTo(false);
}
describe('Paired contribution surfaces', () => {
	it('lets an administration page own its heading while preserving the panel accessible name', async () => {
		TestBed.configureTestingModule({ imports: [DocumentViewsComponent] });
		TestBed.inject(ExtensionRegistry).register({
			id: 'client.publish',
			contributions: ['host', 'component'].flatMap((pageHeading, order) =>
				definePairedView(
					{ items: PUBLISH_ITEMS_SLOT, pages: PUBLISH_PAGES_SLOT },
					{
						id: pageHeading,
						viewId: pageHeading,
						label: `${pageHeading} heading`,
						component: PublishPage,
						pageHeading: pageHeading as 'host' | 'component',
						order,
					},
				),
			),
		});
		const fixture = TestBed.createComponent(DocumentViewsComponent);
		fixture.componentRef.setInput('context', { document: null, noEdit: false });
		fixture.componentRef.setInput('itemSlot', 'PUBLISH_ITEMS');
		fixture.componentRef.setInput('pageSlot', 'PUBLISH_PAGES');
		fixture.componentRef.setInput('presentation', 'administration');
		fixture.componentRef.setInput('navigationVisible', false);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.view-page__header h1')?.textContent).toBe(
			'host heading',
		);
		// This fixture page blocks tab departures, so permit the explicit switch here.
		fixture.debugElement
			.query(By.directive(PublishPage))
			.componentInstance.canDeactivate.and.resolveTo(true);
		await fixture.componentInstance.select('component');
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.view-page__header')).toBeNull();
		expect(
			fixture.nativeElement
				.querySelector('[role="tabpanel"]:not([hidden])')
				.getAttribute('aria-label'),
		).toBe('component heading');
	});
	it('uses its own slots, forwards departure guards, and falls back after removal', async () => {
		TestBed.configureTestingModule({ imports: [DocumentViewsComponent] });
		const registry = TestBed.inject(ExtensionRegistry);
		registry.register({
			id: 'client.publish',
			contributions: ['internal', 'external'].flatMap((id, order) =>
				definePairedView(
					{ items: PUBLISH_ITEMS_SLOT, pages: PUBLISH_PAGES_SLOT },
					{ id, viewId: id, label: id, component: PublishPage, order },
				),
			),
		});
		const fixture = TestBed.createComponent(DocumentViewsComponent);
		fixture.componentRef.setInput('context', { document: { uid: 'one' }, noEdit: false });
		fixture.componentRef.setInput('itemSlot', 'PUBLISH_ITEMS');
		fixture.componentRef.setInput('pageSlot', 'PUBLISH_PAGES');
		fixture.componentRef.setInput('label', 'Publishing');
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.componentInstance.active()?.viewId).toBe('internal');
		expect(fixture.nativeElement.querySelector('[role="tablist"]').getAttribute('aria-label')).toBe(
			'Publishing',
		);
		const page = fixture.debugElement.query(By.directive(PublishPage))
			.componentInstance as PublishPage;
		const departure = { reason: 'tab' as const, nextViewId: 'history' };
		expect(await fixture.componentInstance.canDeactivate(departure)).toBeFalse();
		expect(page.canDeactivate).toHaveBeenCalledWith(departure);
		registry.register({
			id: 'client.hide',
			overrides: [{ slot: 'PUBLISH_PAGES', id: 'internal', disabled: true }],
		});
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.componentInstance.active()?.viewId).toBe('external');
		expect(
			fixture.componentInstance.diagnostics().some((item) => item.code === 'invalid-pair'),
		).toBeTrue();
	});
});
