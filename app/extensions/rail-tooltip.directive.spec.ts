import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { WebUiLocale } from './i18n/webui-locale';
import { RailTooltipDirective } from './rail-tooltip.directive';

@Component({
	imports: [RailTooltipDirective],
	template: `
		<span id="customer-help">Existing description</span>
		@if (showFirst) {
			<button
				id="first"
				type="button"
				[nxRailTooltip]="label"
				aria-describedby="customer-help"
				(click)="activations = activations + 1"
			>
				First
			</button>
		}
		<button id="second" type="button" nxRailTooltip="Second label">Second</button>
		<button id="after" type="button">After</button>
	`,
})
class RailTooltipHost {
	label = 'Browse';
	showFirst = true;
	activations = 0;
}

describe('Rail tooltip lifecycle', () => {
	let fixture: ComponentFixture<RailTooltipHost>;
	let navigation: Subject<NavigationStart>;
	const node = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLButtonElement;
	const labels = () => document.querySelectorAll<HTMLElement>('.nx-rail-tooltip[role="tooltip"]');
	const enter = (element: HTMLElement) => element.dispatchEvent(new MouseEvent('mouseenter'));
	const leave = (element: HTMLElement, relatedTarget: EventTarget | null = null) =>
		element.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget }));
	const settle = async () => {
		fixture.changeDetectorRef.markForCheck();
		fixture.detectChanges();
		await fixture.whenStable();
	};
	beforeEach(async () => {
		navigation = new Subject<NavigationStart>();
		TestBed.configureTestingModule({
			imports: [RailTooltipHost],
			providers: [{ provide: Router, useValue: { events: navigation.asObservable() } }],
		});
		fixture = TestBed.createComponent(RailTooltipHost);
		await settle();
	});
	afterEach(() => {
		fixture.destroy();
		navigation.complete();
		expect(labels().length).toBe(0);
	});
	it('uses one body overlay with a unique description token and replaces it when another item is hovered', async () => {
		enter(node('first'));
		await settle();
		expect(labels().length).toBe(1);
		const firstLabel = labels()[0];
		expect(firstLabel.textContent?.trim()).toBe('Browse');
		expect(firstLabel.closest('nx-drawer-item, nx-sidebar')).toBeNull();
		const descriptions = (node('first').getAttribute('aria-describedby') ?? '').split(/\s+/);
		expect(
			descriptions.some((id) => document.getElementById(id)?.textContent === 'Browse'),
		).toBeTrue();
		expect(node('first').getAttribute('aria-describedby')).toContain('customer-help');
		expect(node('first').hasAttribute('title')).toBeFalse();
		enter(node('second'));
		await settle();
		expect(labels().length).toBe(1);
		expect(labels()[0].textContent?.trim()).toBe('Second label');
		expect(labels()[0].id).not.toBe(firstLabel.id);
		expect(node('first').getAttribute('aria-describedby')).toBe('customer-help');
		leave(node('second'));
		await settle();
		expect(labels().length).toBe(0);
	});
	it('keeps focus and pointer descriptions until both leave and preserves descriptions added by the caller', async () => {
		node('first').focus();
		enter(node('first'));
		await settle();
		const ownedId = (node('first').getAttribute('aria-describedby') ?? '')
			.split(/\s+/)
			.find((id) => document.getElementById(id)?.textContent === 'Browse');
		expect(ownedId).toBeDefined();
		node('first').setAttribute('aria-describedby', `customer-help ${ownedId} other-help`);
		leave(node('first'));
		await settle();
		expect(labels().length).toBe(1);
		node('after').focus();
		await settle();
		expect(labels().length).toBe(0);
		expect(node('first').getAttribute('aria-describedby')).toBe('customer-help other-help');
	});
	it('allows the pointer to enter the label without making it disappear', async () => {
		enter(node('first'));
		await settle();
		const label = labels()[0];
		leave(node('first'), label);
		enter(label);
		await settle();
		expect(labels().length).toBe(1);
		leave(label, node('after'));
		await settle();
		expect(labels().length).toBe(0);
	});
	it('consumes Escape only while a label is visible and keeps the trigger focused', async () => {
		node('first').focus();
		await settle();
		const ancestor = jasmine.createSpy('ancestor');
		fixture.nativeElement.addEventListener('keydown', ancestor);
		node('first').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(labels().length).toBe(0);
		expect(document.activeElement).toBe(node('first'));
		expect(ancestor).not.toHaveBeenCalled();
		node('first').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(ancestor).toHaveBeenCalledTimes(1);
	});
	it('does not intercept Escape belonging to a different focused control', async () => {
		enter(node('first'));
		node('after').focus();
		await settle();
		expect(labels().length).toBe(1);
		const ancestor = jasmine.createSpy('ancestor');
		fixture.nativeElement.addEventListener('keydown', ancestor);
		node('after').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(labels().length).toBe(0);
		expect(ancestor).toHaveBeenCalledTimes(1);
	});
	it('dismisses on activation and navigation without interfering with the button action', async () => {
		node('first').focus();
		await settle();
		node('first').click();
		await settle();
		expect(fixture.componentInstance.activations).toBe(1);
		expect(labels().length).toBe(0);
		node('after').focus();
		node('first').focus();
		await settle();
		expect(labels().length).toBe(1);
		navigation.next(new NavigationStart(1, '/other'));
		await settle();
		expect(labels().length).toBe(0);
		expect(node('first').getAttribute('aria-describedby')).toBe('customer-help');
	});
	it('updates translated text and direction and safely displays caller-owned text', async () => {
		enter(node('first'));
		await settle();
		fixture.componentInstance.label = '<b>Customer label</b>';
		TestBed.inject(WebUiLocale).setLocale('ar');
		await settle();
		expect(labels().length).toBe(1);
		expect(labels()[0].textContent?.trim()).toBe('<b>Customer label</b>');
		expect(labels()[0].querySelector('b')).toBeNull();
	});
	it('does not show a focus label caused by a touch activation or leave one after its contribution is removed', async () => {
		node('first').dispatchEvent(
			new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }),
		);
		node('first').focus();
		node('first').click();
		await settle();
		expect(labels().length).toBe(0);
		node('after').focus();
		node('first').focus();
		await settle();
		expect(labels().length).toBe(1);
		fixture.componentInstance.showFirst = false;
		await settle();
		expect(labels().length).toBe(0);
	});
});
