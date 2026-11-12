import { WebUiLocale } from '../i18n/webui-locale';
import { WebUiMessages } from '../webui-messages';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
	NuxeoAclTableComponent,
	NuxeoActionsMenuComponent,
	NuxeoBulkWidgetComponent,
	NuxeoCardComponent,
	NuxeoConfirmButtonComponent,
	NuxeoDialogComponent,
	NuxeoPageComponent,
	NuxeoPopupConfirmComponent,
	NuxeoSelectComponent,
	NuxeoTagComponent,
	NuxeoTooltipComponent,
	NuxeoTreeComponent,
	NuxeoTreeNodeComponent,
	NuxeoVersionsListComponent,
} from './projection-primitives';

@Component({
	standalone: true,
	imports: [
		NuxeoPageComponent,
		NuxeoCardComponent,
		NuxeoDialogComponent,
		NuxeoConfirmButtonComponent,
		NuxeoPopupConfirmComponent,
		NuxeoSelectComponent,
		NuxeoTagComponent,
		NuxeoTooltipComponent,
		NuxeoActionsMenuComponent,
		NuxeoTreeComponent,
		NuxeoTreeNodeComponent,
		NuxeoBulkWidgetComponent,
		NuxeoVersionsListComponent,
		NuxeoAclTableComponent,
	],
	changeDetection: ChangeDetectionStrategy.Eager,
	template: `
		<nx-page [value]="first"
			><ng-template #header let-value>Header {{ value.name }}</ng-template
			><ng-template #tabs let-value>Tabs {{ value.name }}</ng-template
			><ng-template #body let-value>Body {{ value.name }}</ng-template></nx-page
		>
		<nx-card heading="Card heading" [value]="first"
			><ng-template #content let-value>Card {{ value.name }}</ng-template></nx-card
		>
		<nx-card heading="Collapsed" [value]="second" collapsible
			><ng-template #content let-value>Hidden {{ value.name }}</ng-template></nx-card
		>
		<nx-dialog
			><ng-template #content let-value
				>Dialog {{ value?.name || 'fallback' }}</ng-template
			></nx-dialog
		>
		<nx-confirm-button
			[value]="first"
			(confirm)="confirmed.push($event)"
			(dismiss)="dismissed.push($event)"
			><ng-template #trigger let-value>Confirm {{ value.name }}</ng-template></nx-confirm-button
		>
		<nx-popup-confirm [value]="first" (confirm)="popupConfirmed.push($event)"
			><ng-template #trigger let-value>Popup {{ value.name }}</ng-template></nx-popup-confirm
		>
		<nx-select [value]="selected" required (changed)="selected = $event"
			><ng-template #options
				><option value="one">One</option>
				<option value="two">Two</option></ng-template
			></nx-select
		>
		<nx-select disabled
			><ng-template #options><option value="blocked">Blocked</option></ng-template></nx-select
		>
		<nx-tag [value]="first"
			><ng-template #content let-value>Tag {{ value.name }}</ng-template></nx-tag
		>
		<nx-tooltip [value]="first"
			><ng-template #trigger let-value
				><button type="button">Tip {{ value.name }}</button></ng-template
			><ng-template #content let-value>Tooltip {{ value.name }}</ng-template></nx-tooltip
		>
		<nx-actions-menu [value]="first"
			><ng-template #content let-value let-close="close"
				><button type="button" (click)="close()">Archive {{ value.name }}</button
				><button type="button">Delete</button></ng-template
			><ng-template #dropdown let-value
				><button role="menuitem">Overflow {{ value.name }}</button></ng-template
			></nx-actions-menu
		>
		<nx-tree
			><nx-tree-node
				[item]="first"
				[isLeaf]="leaf"
				[opened]="true"
				[selectedItem]="treeSelected"
				(selected)="treeSelected = $event"
				><ng-template #content let-value>Node {{ value.name }}</ng-template>
				<nx-tree-node [item]="second" (selected)="childSelected = $event"
					><ng-template #content let-value>Child {{ value.name }}</ng-template></nx-tree-node
				></nx-tree-node
			></nx-tree
		>
		<nx-bulk-widget
			[value]="first"
			[multivalued]="multi"
			[required]="required"
			(modeChanged)="modes.push($event)"
			><ng-template #content let-value>Bulk {{ value.name }}</ng-template></nx-bulk-widget
		>
		<nx-bulk-widget [value]="first" multivalued
			><ng-template #content>Multi-value bulk</ng-template></nx-bulk-widget
		>
		<nx-bulk-widget [value]="first" required
			><ng-template #content>Required bulk</ng-template></nx-bulk-widget
		>
		<nx-versions-list [value]="first"
			><ng-template #items let-value>Versions {{ value.name }}</ng-template
			><ng-template #actions let-value>Restore {{ value.name }}</ng-template></nx-versions-list
		>
		<nx-acl-table [value]="first" empty
			><ng-template #emptyResult let-value>No ACL {{ value.name }}</ng-template></nx-acl-table
		>
	`,
})
class PrimitiveHostComponent {
	first = { name: 'First' };
	second = { name: 'Second' };
	selected = 'one';
	multi = false;
	required = false;
	leaf = false;
	treeSelected: { name: string } | null = null;
	childSelected: { name: string } | null = null;
	confirmed: { name: string }[] = [];
	dismissed: { name: string }[] = [];
	popupConfirmed: { name: string }[] = [];
	modes: string[] = [];
}

describe('projection primitives', () => {
	let fixture: ComponentFixture<PrimitiveHostComponent>;
	beforeEach(async () => {
		await TestBed.configureTestingModule({ imports: [PrimitiveHostComponent] }).compileComponents();
		fixture = TestBed.createComponent(PrimitiveHostComponent);
		fixture.detectChanges();
	});

	it('localizes omitted confirmation defaults and preserves explicitly supplied customer labels', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			ro: {
				'sdk.dialog.sure': 'Continuați?',
				'sdk.dialog.yes': 'Da',
				'sdk.dialog.no': 'Nu',
				'sdk.dialog.label': 'Fereastră',
				'sdk.tree.collapse': 'Restrânge',
			},
		});
		const defaults = TestBed.createComponent(NuxeoConfirmButtonComponent);
		const literal = TestBed.createComponent(NuxeoConfirmButtonComponent);
		literal.componentRef.setInput('dialogTitle', 'Are you sure?');
		literal.componentRef.setInput('dialogConfirm', 'Customer yes');
		defaults.detectChanges();
		literal.detectChanges();
		messages.locale.set('ro');
		defaults.detectChanges();
		literal.detectChanges();
		fixture.detectChanges();
		expect(defaults.nativeElement.textContent).toContain('Continuați?');
		expect(defaults.nativeElement.textContent).toContain('Da');
		expect(literal.nativeElement.textContent).toContain('Are you sure?');
		expect(literal.nativeElement.textContent).toContain('Customer yes');
		expect(literal.nativeElement.textContent).not.toContain('Continuați?');
		expect(fixture.nativeElement.querySelector('nx-dialog dialog').getAttribute('aria-label')).toBe(
			'Fereastră',
		);
		expect(
			fixture.nativeElement.querySelector('[role="treeitem"] button').getAttribute('aria-label'),
		).toBe('Restrânge');
	});
	it('localizes bulk mode labels without changing customer field labels or messages', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			fr: { 'sdk.bulk.updateMode': 'Mode de {label}', 'sdk.bulk.cleared': 'Ce champ sera vidé.' },
		});
		const component = TestBed.createComponent(NuxeoBulkWidgetComponent);
		component.componentRef.setInput('label', 'Customer');
		component.componentRef.setInput('mode', 'remove');
		component.detectChanges();
		messages.locale.set('fr');
		component.detectChanges();
		expect(component.nativeElement.querySelector('select').getAttribute('aria-label')).toBe(
			'Mode de Customer',
		);
		expect(component.nativeElement.textContent).toContain('Ce champ sera vidé.');
		component.componentRef.setInput('message', 'Customer warning');
		component.detectChanges();
		expect(component.nativeElement.textContent).toContain('Customer warning');
	});
	it('mounts every declared projection contract with its own typed value context', () => {
		const text = fixture.nativeElement.textContent;
		for (const expected of [
			'Header First',
			'Tabs First',
			'Body First',
			'Card First',
			'Dialog fallback',
			'Confirm First',
			'Popup First',
			'One',
			'Tag First',
			'Tip First',
			'Tooltip First',
			'Node First',
			'Bulk First',
			'Versions First',
			'Restore First',
			'No ACL First',
		])
			expect(text).toContain(expected);
		expect(text).not.toContain('Hidden Second');
	});

	it('provides deterministic empty projection fallbacks instead of failing required queries', () => {
		const bare = TestBed.createComponent(NuxeoPageComponent);
		bare.detectChanges();
		expect(bare.nativeElement.querySelector('header')).not.toBeNull();
		const card = TestBed.createComponent(NuxeoCardComponent);
		card.detectChanges();
		expect(card.nativeElement.querySelector('.card')).not.toBeNull();
	});

	it('uses ElementRef to open the native dialog once and emits one native close event', async () => {
		const dialog = fixture.debugElement.query(By.directive(NuxeoDialogComponent))
			.componentInstance as NuxeoDialogComponent;
		const native = dialog.dialog().nativeElement;
		const closed = jasmine.createSpy('closed');
		dialog.closed.subscribe(closed);
		spyOn(native, 'showModal').and.callThrough();
		dialog.open();
		dialog.open();
		expect(native.open).toBeTrue();
		expect(native.showModal).toHaveBeenCalledTimes(1);
		const nativeClose = new Promise<void>((resolve) =>
			native.addEventListener('close', () => resolve(), { once: true }),
		);
		dialog.close();
		await nativeClose;
		await fixture.whenStable();
		expect(closed).toHaveBeenCalledTimes(1);
	});

	it('captures confirm scope, rejects stale targets, and never dismisses a confirmed target', () => {
		const confirm = fixture.debugElement
			.queryAll(By.directive(NuxeoConfirmButtonComponent))
			.find((node) => !node.nativeElement.closest('nx-popup-confirm'))!
			.componentInstance as NuxeoConfirmButtonComponent<{ name: string }>;
		spyOn(confirm.dialog().dialog().nativeElement, 'showModal');
		confirm.openDialog();
		confirm.ngOnChanges({ value: {} } as any);
		confirm.confirmDialog();
		expect(fixture.componentInstance.confirmed).toEqual([]);
		confirm.openDialog();
		confirm.confirmDialog();
		confirm.onClosed();
		expect(fixture.componentInstance.confirmed).toEqual([{ name: 'First' }]);
		expect(fixture.componentInstance.dismissed).toEqual([]);
	});

	it('propagates popup confirmation and select changes through their public APIs', () => {
		const popupDebug = fixture.debugElement.query(By.directive(NuxeoPopupConfirmComponent));
		const popup = popupDebug.componentInstance as NuxeoPopupConfirmComponent<{ name: string }>;
		const confirmDebug = fixture.debugElement
			.queryAll(By.directive(NuxeoConfirmButtonComponent))
			.find((node) => node.nativeElement.closest('nx-popup-confirm'))!;
		const confirm = confirmDebug.componentInstance as NuxeoConfirmButtonComponent<{ name: string }>;
		spyOn(confirm.dialog().dialog().nativeElement, 'showModal');
		confirm.openDialog();
		confirm.confirmDialog();
		expect(popup).toBeTruthy();
		expect(fixture.componentInstance.popupConfirmed).toEqual([fixture.componentInstance.first]);
		const selects = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLSelectElement>(
			'nx-select select',
		);
		const select = selects[0];
		select.value = 'two';
		select.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		expect(fixture.componentInstance.selected).toBe('two');
		const selectComponent = fixture.debugElement.queryAll(By.directive(NuxeoSelectComponent))[0]
			.componentInstance as NuxeoSelectComponent;
		const disabledSelect = fixture.debugElement.queryAll(By.directive(NuxeoSelectComponent))[1]
			.componentInstance as NuxeoSelectComponent;
		expect(selectComponent.validate()).toBeTrue();
		expect(selects[1].disabled).toBeTrue();
		expect(disabledSelect.change('blocked')).toBeFalse();
	});

	it('keeps source main actions inline and opens only source dropdown actions in the overflow list', async () => {
		const menu = fixture.debugElement.query(By.directive(NuxeoActionsMenuComponent))
			.componentInstance as NuxeoActionsMenuComponent<{ name: string }>;
		expect(fixture.nativeElement.querySelector('.inline-actions').textContent).toContain(
			'Archive First',
		);
		expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
		menu.openMenu('first');
		fixture.detectChanges();
		await Promise.resolve();
		const menuElement = fixture.nativeElement.querySelector('[role="menu"]') as HTMLElement;
		const items = menuElement.querySelectorAll<HTMLElement>('[role="menuitem"]');
		expect(menuElement.textContent).toContain('Overflow First');
		expect(menuElement.textContent).not.toContain('Archive First');
		expect(document.activeElement).toBe(items[0]);
		menu.onMenuKeydown(new KeyboardEvent('keydown', { key: 'End' }));
		expect(document.activeElement).toBe(items[0]);
		menu.onMenuKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(menu.open()).toBeFalse();
		const stale = menu.context();
		menu.ngOnChanges({ value: {} } as any);
		menu.openMenu();
		stale.close();
		expect(menu.open()).toBeTrue();
	});

	it('exposes tree selection, ARIA hierarchy, and leaf-safe expansion', () => {
		const node = fixture.debugElement.query(By.directive(NuxeoTreeNodeComponent))
			.componentInstance as NuxeoTreeNodeComponent<{ name: string }>;
		const item = fixture.nativeElement.querySelector('[role="treeitem"]') as HTMLElement;
		expect(item.getAttribute('aria-level')).toBe('1');
		node.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(fixture.componentInstance.treeSelected).toEqual(fixture.componentInstance.first);
		const treeItems = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
			'[role="treeitem"]',
		);
		treeItems[1].click();
		expect(fixture.componentInstance.childSelected).toEqual(fixture.componentInstance.second);
		expect(fixture.componentInstance.treeSelected).toEqual(fixture.componentInstance.first);
		fixture.componentInstance.leaf = true;
		fixture.detectChanges();
		node.toggle();
		expect(node.opened()).toBeTrue();
	});

	it('mirrors tree expansion keys with locale without changing selection or leaf behavior', () => {
		const node = fixture.debugElement.query(By.directive(NuxeoTreeNodeComponent))
			.componentInstance as NuxeoTreeNodeComponent;
		const item = fixture.nativeElement.querySelector('[role="treeitem"]') as HTMLElement;
		TestBed.inject(WebUiLocale).setLocale('ar');
		item.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		expect(node.opened()).toBeFalse();
		item.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		expect(node.opened()).toBeTrue();
		expect(fixture.componentInstance.treeSelected).toBeNull();
		TestBed.inject(WebUiLocale).setLocale('en-US');
		item.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		expect(node.opened()).toBeFalse();
		fixture.componentInstance.leaf = true;
		fixture.detectChanges();
		item.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		expect(node.opened()).toBeFalse();
	});

	it('enforces source-compatible bulk mode restrictions at the public API boundary', () => {
		const bulk = fixture.debugElement.queryAll(By.directive(NuxeoBulkWidgetComponent))[0]
			.componentInstance as NuxeoBulkWidgetComponent;
		const multiBulk = fixture.debugElement.queryAll(By.directive(NuxeoBulkWidgetComponent))[1]
			.componentInstance as NuxeoBulkWidgetComponent;
		const requiredBulk = fixture.debugElement.queryAll(By.directive(NuxeoBulkWidgetComponent))[2]
			.componentInstance as NuxeoBulkWidgetComponent;
		expect(bulk.setMode('addValues')).toBeFalse();
		expect(bulk.mode()).toBe('keep');
		expect(multiBulk.setMode('addValues')).toBeTrue();
		expect(multiBulk.validate()).toBeTrue();
		expect(requiredBulk.setMode('remove')).toBeFalse();
		expect(requiredBulk.validate()).toBeTrue();
	});

	it('shows a tooltip from the projected button focus and dismisses it with Escape', () => {
		const tooltip = fixture.debugElement.query(By.directive(NuxeoTooltipComponent))
			.componentInstance as NuxeoTooltipComponent;
		const trigger = fixture.nativeElement.querySelector('nx-tooltip button') as HTMLButtonElement;
		trigger.focus();
		trigger.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		fixture.detectChanges();
		expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
		expect(fixture.nativeElement.querySelector('.tip').classList).toContain('visible');
		trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.tip').classList).not.toContain('visible');
	});

	it('resolves primitive surfaces from the existing theme tokens', () => {
		const root = document.documentElement;
		root.style.setProperty('--nuxeo-box', 'rgb(10, 20, 30)');
		root.style.setProperty('--nuxeo-text-default', 'rgb(40, 50, 60)');
		fixture.detectChanges();
		expect(getComputedStyle(fixture.nativeElement.querySelector('.card')).backgroundColor).toBe(
			'rgb(10, 20, 30)',
		);
		expect(getComputedStyle(fixture.nativeElement.querySelector('.versions')).backgroundColor).toBe(
			'rgb(10, 20, 30)',
		);
		expect(getComputedStyle(fixture.nativeElement.querySelector('.tip')).backgroundColor).toBe(
			'rgb(40, 50, 60)',
		);
		root.style.removeProperty('--nuxeo-box');
		root.style.removeProperty('--nuxeo-text-default');
	});
});
