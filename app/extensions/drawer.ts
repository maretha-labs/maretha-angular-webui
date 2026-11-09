import { WebUiNumberPipe } from './i18n/format-pipes';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { defineSlot } from './contribution';
import { ApplicationContext, ApplicationUser } from './user-menu';
import { DocumentActionContext } from './slots';
import { WebUiIconComponent } from './webui-icons';
import { WebUiMessages } from './webui-messages';
import { RailTooltipDirective } from './rail-tooltip.directive';
export interface DrawerContext extends ApplicationContext, DocumentActionContext {
	readonly user: ApplicationUser | null;
	readonly activeKey: string | null;
	readonly opened: boolean;
	readonly open: (key: string) => void;
	readonly close: () => void;
	readonly navigate: (path: string) => void;
	readonly recentDocuments: readonly any[];
	readonly collections: readonly any[];
	readonly clipboard: readonly any[];
	readonly tasks: Readonly<Record<string, readonly any[]>>;
	readonly taskCount: number;
	readonly clearHistory: () => void;
	readonly clearClipboard: () => void;
}
function isDrawerContext(value: unknown): value is DrawerContext {
	if (!value || typeof value !== 'object') return false;
	const c = value as DrawerContext;
	return (
		typeof c.noEdit === 'boolean' &&
		typeof c.opened === 'boolean' &&
		typeof c.open === 'function' &&
		typeof c.close === 'function' &&
		typeof c.navigate === 'function' &&
		Array.isArray(c.recentDocuments) &&
		Array.isArray(c.collections) &&
		Array.isArray(c.clipboard) &&
		typeof c.tasks === 'object' &&
		c.tasks !== null
	);
}
export const DRAWER_ITEMS_SLOT = defineSlot('DRAWER_ITEMS', isDrawerContext);
export const DRAWER_PAGES_SLOT = defineSlot('DRAWER_PAGES', isDrawerContext);
@Component({
	selector: 'nx-drawer-item',
	imports: [WebUiIconComponent, WebUiNumberPipe, RailTooltipDirective],
	template: `@let badgeCount =
			pageId() === 'tasks'
				? context().taskCount
				: pageId() === 'clipboard'
					? context().clipboard.length
					: 0;
		<button
			type="button"
			[nxRailTooltip]="messages.text(labelKey(), label())"
			[attr.aria-label]="messages.text(labelKey(), label())"
			[attr.aria-description]="badgeCount > 0 ? (badgeCount | webuiNumber) : null"
			[attr.aria-expanded]="route() ? null : context().opened && context().activeKey === pageId()"
			[attr.aria-controls]="route() ? null : 'nx-sidebar-drawer'"
			[class.selected]="context().opened && context().activeKey === pageId()"
			(click)="activate()"
		>
			<nx-webui-icon [name]="icon()" />
			@if (badgeCount > 0) {
				<span aria-hidden="true">{{ badgeCount | webuiNumber }}</span>
			}
		</button>`,
	styles:
		':host { display:block; width:100%; } button { position:relative; display:flex; align-items:center; justify-content:center; width:100%; height:48px; border:0; background:transparent; color:var(--nuxeo-sidebar-item-color); } button:hover,button.selected { color:var(--nuxeo-sidebar-item-hover-color); background:var(--nuxeo-sidebar-item-selected-background, rgba(255,255,255,.12)); border-radius:12px; } button.selected::before { content:""; position:absolute; inset-inline-start:0; top:50%; transform:translateY(-50%); width:4px; height:20px; background:var(--nuxeo-sidebar-selection-indicator, var(--nuxeo-sidebar-item-hover-color, #fff)); border-start-end-radius:16px; border-end-end-radius:16px; z-index:1; } button:focus-visible { outline:2px solid currentColor; outline-offset:-3px; } span { position:absolute; top:4px; inset-inline-end:4px; display:flex; align-items:center; justify-content:center; min-width:16px; height:16px; box-sizing:border-box; border-radius:50%; background:var(--nuxeo-badge-background, #fb6107); color:#fff; font-size:10px; line-height:1; padding:0 2px; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DrawerItemComponent {
	readonly context = input.required<DrawerContext>();
	readonly pageId = input.required<string>();
	readonly label = input.required<string>();
	readonly labelKey = input<string>();
	readonly icon = input.required<string>();
	readonly route = input<string>();
	readonly messages = inject(WebUiMessages);
	activate(): void {
		const route = this.route();
		if (route) this.context().navigate(route);
		else this.context().open(this.pageId());
	}
}
