import { Component, computed, inject, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, NavigationCancel, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { defineDocumentView, DocumentViewContext } from './document-view';
import { DocumentViewsComponent } from './document-views.component';
import { ExtensionRegistry } from './extension-registry.service';
import { documentViewsNavigationGuard, ViewDeparture, ViewNavigation } from './view-navigation';

@Component({
	template:
		'<input aria-label="Draft" [value]="draft()" (input)="draft.set($any($event.target).value)" />',
})
class EditorPage {
	readonly context = input.required<DocumentViewContext>();
	readonly draft = signal('');
	readonly canDeactivate = jasmine.createSpy('canDeactivate').and.returnValue(true);
	hasPendingChanges(): boolean {
		return !!this.draft();
	}
}
@Component({ template: '<p>Read-only page</p>' })
class ReadPage {
	readonly context = input.required<DocumentViewContext>();
}

function registerViews(registry: ExtensionRegistry): void {
	registry.register({
		id: 'defaults',
		contributions: [
			...defineDocumentView({
				id: 'editor',
				viewId: 'edit',
				label: 'Edit',
				retain: true,
				order: 10,
				component: EditorPage,
			}),
			...defineDocumentView({
				id: 'read',
				viewId: 'read',
				label: 'Read',
				order: 20,
				component: ReadPage,
			}),
		],
	});
}
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
	fixture.detectChanges();
	await fixture.whenStable();
	fixture.detectChanges();
}

describe('Document view lifecycle', () => {
	let fixture: ComponentFixture<DocumentViewsComponent>;
	let registry: ExtensionRegistry;
	let addListener: jasmine.Spy;
	const context = { document: { uid: 'one', repository: 'default' }, noEdit: false };
	const editor = () =>
		fixture.debugElement.query(By.directive(EditorPage)).componentInstance as EditorPage;
	beforeEach(async () => {
		addListener = spyOn(window, 'addEventListener').and.callThrough();
		TestBed.configureTestingModule({ imports: [DocumentViewsComponent] });
		registry = TestBed.inject(ExtensionRegistry);
		registerViews(registry);
		fixture = TestBed.createComponent(DocumentViewsComponent);
		fixture.componentRef.setInput('context', context);
		fixture.componentRef.setInput('navigationPath', '/doc/one');
		await settle(fixture);
	});

	it('retains an opted-in draft across tabs and keeps the inactive panel hidden and inert', async () => {
		const original = editor();
		original.draft.set('Unsaved title');
		expect(await fixture.componentInstance.select('read')).toBeTrue();
		await settle(fixture);
		const panel = fixture.nativeElement.querySelector('[role="tabpanel"][hidden]') as HTMLElement;
		expect(panel.hasAttribute('inert')).toBeTrue();
		expect(getComputedStyle(panel).display).toBe('none');
		await fixture.componentInstance.select('edit');
		await settle(fixture);
		expect(editor()).toBe(original);
		expect(editor().draft()).toBe('Unsaved title');
	});

	it('waits for a guard, keeps the active page until approval, and preserves a rejected draft', async () => {
		let answer!: (allowed: boolean) => void;
		editor().draft.set('Draft');
		editor().canDeactivate.and.returnValue(
			new Promise<boolean>((resolve) => {
				answer = resolve;
			}),
		);
		const change = fixture.componentInstance.select('read');
		expect(fixture.componentInstance.pending()).toBeTrue();
		expect(fixture.componentInstance.active()?.viewId).toBe('edit');
		answer(false);
		expect(await change).toBeFalse();
		await settle(fixture);
		expect(editor().draft()).toBe('Draft');
		expect(fixture.componentInstance.selectedView()).toBe('edit');
		expect(fixture.componentInstance.departureMessage()).toContain('cancelled');
		const tabs = Array.from(
			fixture.nativeElement.querySelectorAll('[role="tab"]'),
		) as HTMLElement[];
		expect(document.activeElement).toBe(tabs[0]);
		expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1]);
	});

	it('treats a rejected or throwing guard as refusal', async () => {
		editor().canDeactivate.and.callFake(() => {
			throw new Error('Unable to save');
		});
		expect(await fixture.componentInstance.select('read')).toBeFalse();
		editor().canDeactivate.and.callFake(() => Promise.reject(new Error('Unable to save')));
		expect(await fixture.componentInstance.select('read')).toBeFalse();
		expect(fixture.componentInstance.active()?.viewId).toBe('edit');
	});

	it('ignores an obsolete approval after a newer selection request', async () => {
		let answer!: (allowed: boolean) => void;
		editor().canDeactivate.and.returnValue(
			new Promise<boolean>((resolve) => {
				answer = resolve;
			}),
		);
		const first = fixture.componentInstance.select('read');
		editor().canDeactivate.and.returnValue(false);
		expect(await fixture.componentInstance.select('read')).toBeFalse();
		answer(true);
		expect(await first).toBeFalse();
		expect(fixture.componentInstance.active()?.viewId).toBe('edit');
	});

	it('cancels a pending switch when the user reselects the current tab', async () => {
		let answer!: (allowed: boolean) => void;
		editor().canDeactivate.and.returnValue(
			new Promise<boolean>((resolve) => {
				answer = resolve;
			}),
		);
		const pending = fixture.componentInstance.select('read');
		expect(await fixture.componentInstance.select('edit')).toBeTrue();
		answer(true);
		expect(await pending).toBeFalse();
		expect(fixture.componentInstance.active()?.viewId).toBe('edit');
	});

	it('normalizes an invalid incoming view even when the fallback is already active', async () => {
		fixture.componentRef.setInput('selectedView', 'missing');
		await settle(fixture);
		expect(fixture.componentInstance.selectedView()).toBe('edit');
	});

	it('reveals a retained editor while its asynchronous departure prompt is pending', async () => {
		const original = editor();
		original.draft.set('Pending draft');
		await fixture.componentInstance.select('read');
		await settle(fixture);
		let answer!: (allowed: boolean) => void;
		original.canDeactivate.and.returnValue(
			new Promise<boolean>((resolve) => {
				answer = resolve;
			}),
		);
		const departure = fixture.componentInstance.canDeactivate({
			reason: 'navigation',
			nextViewId: null,
			nextUrl: '/other',
		});
		fixture.detectChanges();
		const panel = fixture.nativeElement.querySelector(
			'[role="tabpanel"]:not([hidden])',
		) as HTMLElement;
		expect(panel.querySelector('input')?.value).toBe('Pending draft');
		expect(panel.hasAttribute('inert')).toBeFalse();
		expect(fixture.componentInstance.selectedView()).toBe('read');
		answer(false);
		expect(await departure).toBeFalse();
		await settle(fixture);
		expect(fixture.componentInstance.visibleViewId()).toBe('read');
		expect(original.draft()).toBe('Pending draft');
	});
	it('guards retained inactive pages when leaving the document', async () => {
		const original = editor();
		await fixture.componentInstance.select('read');
		await settle(fixture);
		original.canDeactivate.and.returnValue(false);
		expect(await TestBed.inject(ViewNavigation).canNavigate('/dashboard', 1)).toBeFalse();
		expect(original.canDeactivate).toHaveBeenCalledWith({
			reason: 'navigation',
			nextViewId: null,
			nextUrl: '/dashboard',
		});
	});

	it('resets page state for another document or repository and cancels an old approval', async () => {
		const original = editor();
		let answer!: (allowed: boolean) => void;
		original.canDeactivate.and.returnValue(
			new Promise<boolean>((resolve) => {
				answer = resolve;
			}),
		);
		const change = fixture.componentInstance.select('read');
		fixture.componentRef.setInput('context', {
			...context,
			document: { uid: 'one', repository: 'other' },
		});
		fixture.detectChanges();
		answer(true);
		expect(await change).toBeFalse();
		await settle(fixture);
		expect(editor()).not.toBe(original);
		expect(editor().draft()).toBe('');
	});

	it('discards removed retained pages and does not restore stale drafts on re-registration', async () => {
		editor().draft.set('Old draft');
		await fixture.componentInstance.select('read');
		await settle(fixture);
		const restore = registry.register({
			id: 'hide',
			overrides: ['DOCUMENT_VIEWS_ITEMS', 'DOCUMENT_VIEWS_PAGES'].map((slot) => ({
				slot,
				id: 'editor',
				disabled: true,
			})),
		});
		await settle(fixture);
		expect(fixture.debugElement.query(By.directive(EditorPage))).toBeNull();
		restore();
		await settle(fixture);
		await fixture.componentInstance.select('edit');
		await settle(fixture);
		expect(editor().draft()).toBe('');
	});

	it('registers unload protection for dirty pages and removes it on destruction', () => {
		editor().draft.set('Draft');
		const listener = addListener.calls.allArgs().find(([type]) => type === 'beforeunload')![1] as (
			event: Event,
		) => void;
		const removeListener = spyOn(window, 'removeEventListener').and.callThrough();
		const event = new Event('beforeunload', { cancelable: true });
		listener(event);
		expect(event.defaultPrevented).toBeTrue();
		fixture.destroy();
		expect(removeListener).toHaveBeenCalledWith('beforeunload', listener);
	});
});

@Component({
	imports: [DocumentViewsComponent],
	template:
		'<nx-document-views [context]="context()" [navigationPath]="path()" [selectedView]="selected()" />',
})
class RouteHost {
	private readonly route = inject(ActivatedRoute);
	private readonly id = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))));
	readonly selected = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('view'))), {
		initialValue: null,
	});
	readonly path = computed(() => `/doc/${this.id()}`);
	readonly context = computed(() => ({ document: { uid: this.id() }, noEdit: false }));
}
@Component({ template: 'Other page' })
class OtherPage {}

describe('Document view router guards', () => {
	let harness: RouterTestingHarness;
	let router: Router;
	beforeEach(async () => {
		TestBed.configureTestingModule({
			providers: [
				provideRouter([
					{
						path: 'doc',
						canActivate: [documentViewsNavigationGuard],
						runGuardsAndResolvers: 'always',
						children: [{ path: ':id', component: RouteHost }],
					},
					{
						path: 'other',
						component: OtherPage,
						canActivate: [documentViewsNavigationGuard],
						runGuardsAndResolvers: 'always',
					},
				]),
			],
		});
		registerViews(TestBed.inject(ExtensionRegistry));
		harness = await RouterTestingHarness.create('/doc/one?view=edit');
		router = TestBed.inject(Router);
		await settle(harness.fixture);
	});
	it('blocks query, document and top-level navigation before the URL changes', async () => {
		const editor = harness.routeDebugElement!.query(By.directive(EditorPage))
			.componentInstance as EditorPage;
		editor.canDeactivate.and.returnValue(false);
		expect(await router.navigateByUrl('/doc/one?view=read')).toBeFalse();
		expect(router.url).toBe('/doc/one?view=edit');
		expect(await router.navigateByUrl('/doc/two?view=edit')).toBeFalse();
		expect(await router.navigateByUrl('/other')).toBeFalse();
		expect(router.url).toBe('/doc/one?view=edit');
	});
	it('discards a tab approval if another guard cancels navigation', async () => {
		const host = harness.routeDebugElement!.query(By.directive(DocumentViewsComponent))
			.componentInstance as DocumentViewsComponent;
		const editor = harness.routeDebugElement!.query(By.directive(EditorPage))
			.componentInstance as EditorPage;
		expect(await TestBed.inject(ViewNavigation).canNavigate('/doc/one?view=read', 1000)).toBeTrue();
		// This models another route guard cancelling after this host approved departure.
		(router.events as unknown as { next(event: NavigationCancel): void }).next(
			new NavigationCancel(1000, '/doc/one?view=read', 'Another guard refused'),
		);
		editor.canDeactivate.and.returnValue(false);
		host.selectedView.set('read');
		await settle(harness.fixture);
		expect(host.active()?.viewId).toBe('edit');
		expect(editor.canDeactivate).toHaveBeenCalledTimes(2);
	});

	it('approves a query transition once and updates the selected page after navigation', async () => {
		const editor = harness.routeDebugElement!.query(By.directive(EditorPage))
			.componentInstance as EditorPage;
		editor.canDeactivate.and.callFake((departure: ViewDeparture) =>
			Promise.resolve(departure.nextViewId === 'read'),
		);
		expect(await router.navigateByUrl('/doc/one?view=read')).toBeTrue();
		await settle(harness.fixture);
		expect(editor.canDeactivate).toHaveBeenCalledTimes(1);
		expect(
			harness
				.routeDebugElement!.query(By.directive(DocumentViewsComponent))
				.componentInstance.active().viewId,
		).toBe('read');
	});
});
