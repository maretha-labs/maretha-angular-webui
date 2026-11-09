import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NuxeoActionsMenuComponent, NuxeoTooltipComponent } from './projection-primitives';
import { WebUiMessages } from '../webui-messages';

@Component({
	imports: [NuxeoActionsMenuComponent, NuxeoTooltipComponent],
	template: ` <button id="before" type="button">Before</button>
		<nx-actions-menu [label]="label" [scope]="scope" [disabled]="disabled">
			<ng-template #dropdown>
				@if (!empty) {
					<button id="first" type="button" (click)="actions.push('first')">Customer first</button>
					<button id="disabled" type="button" disabled>Disabled</button>
					<button id="aria-disabled" type="button" role="menuitem" aria-disabled="true">
						Unavailable
					</button>
					<div hidden><button type="button">Hidden child</button></div>
					<button type="button" style="visibility:hidden">Invisible</button>
					<a id="last" href="#customer" (click)="$event.preventDefault(); actions.push('last')"
						>Customer last</a
					>
				}
			</ng-template>
		</nx-actions-menu>
		<button id="after" type="button">After</button>
		<span id="customer-description">Customer existing help</span>
		<nx-tooltip>
			<ng-template #trigger
				><button id="tip-first" type="button" aria-describedby="customer-description">
					Customer trigger</button
				><button id="tip-second" type="button">Second trigger</button></ng-template
			>
			<ng-template #content>Additional help</ng-template>
		</nx-tooltip>`,
})
class AccessibilityHost {
	label = 'Customer actions';
	scope = 'first';
	disabled = false;
	empty = false;
	actions: string[] = [];
}

describe('SDK projected action and tooltip accessibility', () => {
	let fixture: ComponentFixture<AccessibilityHost>;
	let menu: NuxeoActionsMenuComponent;
	const key = (element: HTMLElement, value: string) => {
		const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
		element.dispatchEvent(event);
		return event;
	};
	const node = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement;
	beforeEach(() => {
		TestBed.configureTestingModule({ imports: [AccessibilityHost] });
		fixture = TestBed.createComponent(AccessibilityHost);
		fixture.detectChanges();
		menu = fixture.debugElement.query(By.directive(NuxeoActionsMenuComponent)).componentInstance;
	});
	const open = async (which: 'ArrowDown' | 'ArrowUp' = 'ArrowDown') => {
		const trigger = node('nx-actions-menu > button');
		trigger.focus();
		key(trigger, which);
		fixture.detectChanges();
		await fixture.whenStable();
		return node('[role="menu"]');
	};
	it('announces one named action menu and navigates visible enabled projected actions without activating them', async () => {
		const trigger = node('nx-actions-menu > button');
		expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
		expect(trigger.hasAttribute('aria-controls')).toBeFalse();
		const popup = await open();
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(trigger.getAttribute('aria-controls')).toBe(popup.id);
		expect(popup.getAttribute('aria-label')).toBe('Customer actions');
		expect(node('#first').getAttribute('role')).toBe('menuitem');
		expect(node('#last').getAttribute('role')).toBe('menuitem');
		expect(document.activeElement).toBe(node('#first'));
		expect(node('#first').tabIndex).toBe(-1);
		key(node('#first'), 'ArrowDown');
		expect(document.activeElement).toBe(node('#last'));
		key(node('#last'), 'ArrowDown');
		expect(document.activeElement).toBe(node('#first'));
		key(node('#first'), 'ArrowUp');
		expect(document.activeElement).toBe(node('#last'));
		key(node('#last'), 'Home');
		expect(document.activeElement).toBe(node('#first'));
		key(node('#first'), 'End');
		expect(document.activeElement).toBe(node('#last'));
		expect(fixture.componentInstance.actions).toEqual([]);
		node('#last').click();
		fixture.detectChanges();
		await fixture.whenStable();
		expect(fixture.componentInstance.actions).toEqual(['last']);
		expect(menu.open()).toBeFalse();
		expect(document.activeElement).toBe(trigger);
	});
	it('opens the last item with Up, returns focus on Escape, and anchors normal Tab navigation before removing the popup', async () => {
		await open('ArrowUp');
		expect(document.activeElement).toBe(node('#last'));
		expect(key(node('#last'), 'Escape').defaultPrevented).toBeTrue();
		fixture.detectChanges();
		await fixture.whenStable();
		expect(document.activeElement).toBe(node('nx-actions-menu > button'));
		await open();
		const tab = key(node('#first'), 'Tab');
		expect(tab.defaultPrevented).toBeFalse();
		expect(document.activeElement).toBe(node('nx-actions-menu > button'));
		fixture.detectChanges();
		expect(node('[role="menu"]')).toBeNull();
	});
	it('lets an empty popup receive focus and Escape and never applies queued focus to an obsolete scope', async () => {
		fixture.componentInstance.empty = true;
		fixture.detectChanges();
		const popup = await open();
		expect(document.activeElement).toBe(popup);
		key(popup, 'Escape');
		fixture.detectChanges();
		await fixture.whenStable();
		expect(document.activeElement).toBe(node('nx-actions-menu > button'));
		node('#after').focus();
		menu.openMenu('first');
		fixture.componentInstance.scope = 'second';
		fixture.changeDetectorRef.markForCheck();
		fixture.detectChanges();
		await fixture.whenStable();
		expect(menu.open()).toBeFalse();
		expect(document.activeElement).toBe(node('#after'));
		menu.openMenu('first');
		fixture.destroy();
		await Promise.resolve();
	});
	it('keeps dismissal inside the active popup and does not steal focus chosen by an action', async () => {
		const ownerKeydown = jasmine.createSpy('ownerKeydown');
		fixture.nativeElement.addEventListener('keydown', ownerKeydown);
		await open();
		ownerKeydown.calls.reset();
		key(node('#first'), 'Escape');
		fixture.detectChanges();
		await fixture.whenStable();
		expect(ownerKeydown).not.toHaveBeenCalled();
		key(node('nx-actions-menu > button'), 'Escape');
		expect(ownerKeydown).toHaveBeenCalledTimes(1);
		await open();
		node('#first').addEventListener('click', () => node('#after').focus());
		node('#first').click();
		fixture.detectChanges();
		await fixture.whenStable();
		expect(menu.open()).toBeFalse();
		expect(document.activeElement).toBe(node('#after'));
		await open();
		menu.close(true);
		node('#after').focus();
		fixture.detectChanges();
		await fixture.whenStable();
		expect(document.activeElement).toBe(node('#after'));
		const tooltipTrigger = node('#tip-first');
		tooltipTrigger.focus();
		fixture.detectChanges();
		ownerKeydown.calls.reset();
		key(tooltipTrigger, 'Escape');
		expect(ownerKeydown).not.toHaveBeenCalled();
		key(tooltipTrigger, 'Escape');
		expect(ownerKeydown).toHaveBeenCalledTimes(1);
	});

	it('retains supplied labels and supplies a localized default when no action label is supplied', async () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', { ar: { 'actionsMenu.more': 'المزيد' } });
		messages.locale.set('ar');
		fixture.detectChanges();
		expect(node('nx-actions-menu > button').textContent?.trim()).toBe('Customer actions');
		fixture.componentInstance.label = '';
		fixture.changeDetectorRef.markForCheck();
		fixture.detectChanges();
		expect(node('nx-actions-menu > button').textContent?.trim()).toBe('المزيد');
		fixture.componentInstance.disabled = true;
		fixture.changeDetectorRef.markForCheck();
		fixture.detectChanges();
		node('nx-actions-menu > button').click();
		menu.openMenu('first');
		fixture.detectChanges();
		await fixture.whenStable();
		expect(menu.open()).toBeFalse();
	});
	it('keeps hover help open over the tooltip and until both pointer and trigger focus leave', () => {
		const host = node('nx-tooltip');
		const tooltip = fixture.debugElement.query(By.directive(NuxeoTooltipComponent))
			.componentInstance as NuxeoTooltipComponent;
		host.dispatchEvent(new MouseEvent('mouseenter'));
		fixture.detectChanges();
		expect(tooltip.visible()).toBeTrue();
		const tip = node('[role="tooltip"]');
		node('.anchor').dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: tip }));
		expect(tooltip.visible()).toBeTrue();
		host.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: node('#after') }));
		expect(tooltip.visible()).toBeFalse();
		node('#tip-first').focus();
		host.dispatchEvent(new MouseEvent('mouseenter'));
		host.dispatchEvent(new MouseEvent('mouseleave'));
		expect(tooltip.visible()).toBeTrue();
		host.dispatchEvent(new MouseEvent('mouseenter'));
		node('#after').focus();
		expect(tooltip.visible()).toBeTrue();
		host.dispatchEvent(new MouseEvent('mouseleave'));
		expect(tooltip.visible()).toBeFalse();
	});

	it('preserves existing and subsequently added descriptions, removes only its own ID, and leaves focus on Escape', () => {
		const tooltip = fixture.debugElement.query(By.directive(NuxeoTooltipComponent))
			.componentInstance as NuxeoTooltipComponent;
		const first = node('#tip-first'),
			second = node('#tip-second');
		first.focus();
		fixture.detectChanges();
		expect(first.getAttribute('aria-describedby')).toBe(`customer-description ${tooltip.id}`);
		first.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		expect(first.getAttribute('aria-describedby')).toBe(`customer-description ${tooltip.id}`);
		key(first, 'Escape');
		fixture.detectChanges();
		expect(tooltip.visible()).toBeFalse();
		expect(document.activeElement).toBe(first);
		first.setAttribute(
			'aria-describedby',
			`${first.getAttribute('aria-describedby')} customer-extra`,
		);
		second.focus();
		fixture.detectChanges();
		expect(first.getAttribute('aria-describedby')).toBe('customer-description customer-extra');
		expect(second.getAttribute('aria-describedby')).toBe(tooltip.id);
		node('#after').focus();
		fixture.detectChanges();
		expect(second.hasAttribute('aria-describedby')).toBeFalse();
		expect(tooltip.visible()).toBeFalse();
		first.focus();
		fixture.detectChanges();
		fixture.destroy();
		expect(first.getAttribute('aria-describedby')).toBe('customer-description customer-extra');
	});
});
