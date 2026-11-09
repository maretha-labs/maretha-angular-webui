import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NuxeoTreeComponent, NuxeoTreeNodeComponent } from './projection-primitives';
import { WebUiLocale } from '../i18n/webui-locale';

@Component({
	imports: [NuxeoTreeComponent, NuxeoTreeNodeComponent],
	template: `<button id="outside" type="button">Outside</button>
		<nx-tree label="Customer files">
			@if (parentVisible) {
				<nx-tree-node
					[item]="parent"
					[(opened)]="opened"
					[selectedItem]="selected"
					(selected)="selected = $event"
				>
					<ng-template #content let-item>{{ item.title }}</ng-template>
					@if (childVisible) {
						<nx-tree-node
							[item]="child"
							[depth]="1"
							[isLeaf]="true"
							[selectedItem]="selected"
							(selected)="selected = $event"
							><ng-template #content let-item>{{ item.title }}</ng-template></nx-tree-node
						>
					}
				</nx-tree-node>
			}
			@if (lastVisible) {
				<nx-tree-node
					[item]="last"
					[isLeaf]="true"
					[selectedItem]="selected"
					(selected)="selected = $event"
					><ng-template #content let-item>{{ item.title }}</ng-template></nx-tree-node
				>
			}
		</nx-tree>`,
})
class TreeHost {
	parent = { title: 'Alpha' };
	child = { title: 'Beta' };
	last = { title: 'Zulu' };
	selected: { title: string } | null = null;
	opened = true;
	parentVisible = true;
	childVisible = true;
	lastVisible = true;
}
describe('SDK tree keyboard and focus', () => {
	let fixture: ComponentFixture<TreeHost>;
	const items = () =>
		Array.from(fixture.nativeElement.querySelectorAll('[role="treeitem"]')) as HTMLElement[];
	const key = (node: HTMLElement, value: string) => {
		const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
		node.dispatchEvent(event);
		fixture.detectChanges();
		return event;
	};
	const render = () => {
		fixture.changeDetectorRef.markForCheck();
		fixture.detectChanges();
	};
	beforeEach(() => {
		TestBed.configureTestingModule({ imports: [TreeHost] });
		fixture = TestBed.createComponent(TreeHost);
		render();
	});
	it('preserves standalone node keyboard entry for consumers providing their own tree host', () => {
		const standalone = TestBed.createComponent(NuxeoTreeNodeComponent);
		standalone.componentRef.setInput('item', { title: 'Customer standalone item' });
		standalone.componentRef.setInput('isLeaf', true);
		standalone.detectChanges();
		const item = standalone.nativeElement.querySelector('[role="treeitem"]') as HTMLElement;
		expect(item.tabIndex).toBe(0);
		item.focus();
		item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(standalone.componentInstance.selectedItem()).toEqual({
			title: 'Customer standalone item',
		});
	});
	it('exposes one tab stop, independent names, and visible depth-first navigation without selecting', () => {
		expect(fixture.nativeElement.querySelector('[role="tree"]').getAttribute('aria-label')).toBe(
			'Customer files',
		);
		expect(items().map((item) => item.tabIndex)).toEqual([0, -1, -1]);
		const parent = items()[0];
		expect(
			document.getElementById(parent.getAttribute('aria-labelledby')!)?.textContent?.trim(),
		).toBe('Alpha');
		parent.focus();
		key(parent, 'ArrowDown');
		expect(document.activeElement).toBe(items()[1]);
		expect(items().map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
		key(items()[1], 'End');
		expect(document.activeElement).toBe(items()[2]);
		key(items()[2], 'Home');
		expect(document.activeElement).toBe(parent);
		key(parent, 'ArrowUp');
		expect(document.activeElement).toBe(parent);
		expect(fixture.componentInstance.selected).toBeNull();
		key(parent, 'z');
		expect(document.activeElement).toBe(items()[2]);
		key(items()[2], 'Enter');
		expect(fixture.componentInstance.selected).toBe(fixture.componentInstance.last);
		expect(items()[2].getAttribute('aria-selected')).toBe('true');
		expect(key(items()[2], 'Tab').defaultPrevented).toBeFalse();
	});
	it('expands, enters a child and returns to its parent in LTR and RTL without bubbling activation', () => {
		for (const locale of ['en-US', 'ar']) {
			TestBed.inject(WebUiLocale).setLocale(locale);
			fixture.componentInstance.opened = false;
			render();
			const parent = items()[0];
			parent.focus();
			const expand = locale === 'ar' ? 'ArrowLeft' : 'ArrowRight';
			const collapse = locale === 'ar' ? 'ArrowRight' : 'ArrowLeft';
			key(parent, expand);
			expect(parent.getAttribute('aria-expanded')).toBe('true');
			expect(document.activeElement).toBe(parent);
			key(parent, expand);
			expect(document.activeElement).toBe(items()[1]);
			key(items()[1], ' ');
			expect(fixture.componentInstance.selected).toBe(fixture.componentInstance.child);
			key(items()[1], collapse);
			expect(document.activeElement).toBe(parent);
			key(parent, collapse);
			expect(parent.getAttribute('aria-expanded')).toBe('false');
			expect(items().length).toBe(2);
		}
	});
	it('recovers focus to a surviving parent on collapse/removal, then adjacent node or empty tree', () => {
		items()[1].focus();
		fixture.componentInstance.opened = false;
		render();
		expect(document.activeElement).toBe(items()[0]);
		fixture.componentInstance.opened = true;
		render();
		items()[1].focus();
		fixture.componentInstance.childVisible = false;
		render();
		expect(document.activeElement).toBe(items()[0]);
		fixture.componentInstance.parentVisible = false;
		render();
		expect(document.activeElement).toBe(items()[0]);
		expect(items()[0].textContent).toContain('Zulu');
		fixture.componentInstance.lastVisible = false;
		render();
		expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[role="tree"]'));
	});
	it('does not steal focus after the user leaves, and preserves one tab stop after asynchronous replacement', () => {
		items()[1].focus();
		const outside = fixture.nativeElement.querySelector('#outside') as HTMLElement;
		outside.focus();
		fixture.componentInstance.parentVisible = false;
		render();
		expect(document.activeElement).toBe(outside);
		expect(items()[0].tabIndex).toBe(0);
		fixture.componentInstance.parentVisible = true;
		render();
		expect(items().filter((item) => item.tabIndex === 0).length).toBe(1);
	});
});
